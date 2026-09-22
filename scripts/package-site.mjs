import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configFiles = ["compose.yaml", "nginx.conf", ".env.example", "image-lock.json"];
const guideFiles = ["Install.command", "Install-Windows.cmd", "Install-Windows.ps1", "INSTALL.html", "SHA256SUMS.txt"];
const publicBuildFile = /^(?:manifest\.json|index\.html|popup\.html|background\.js|certificate-fields\.js|content\.js|content\.css|official-rule-bridge\.js|assets\/[A-Za-z0-9_.-]+\.(?:js|css|svg|png|woff2?))$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (command, args, cwd) => execFileSync(command, args, { cwd, maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
const zipRead = (path, entry) => run("unzip", ["-p", path, entry]);

async function regularFile(path) {
  assert((await lstat(path)).isFile(), `只接受普通文件：${path}`);
  return readFile(path);
}

async function buildFiles(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(resolve(root, prefix), { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory() && relative === "assets") files.push(...await buildFiles(root, "assets/"));
    else {
      assert(entry.isFile() && publicBuildFile.test(relative), `扩展构建包含非公开白名单文件：${relative}`);
      files.push(relative);
    }
  }
  return files.sort();
}

function git(root, args) {
  try { return run("git", args, root).toString().trim(); }
  catch { return null; }
}

function render(template, values) {
  return template.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (_, name) => {
    assert(Object.hasOwn(values, name), `未知模板字段：${name}`);
    return values[name];
  });
}

export async function packageSite({ root = projectRoot, now = new Date() } = {}) {
  const buildRoot = resolve(root, "apps/extension/dist");
  const buildManifest = await regularFile(resolve(buildRoot, "manifest.json"));
  const sourceManifest = await regularFile(resolve(root, "apps/extension/public/manifest.json"));
  const { version } = JSON.parse(buildManifest);
  assert(/^\d+(?:\.\d+){2,3}$/.test(version), "扩展版本必须是 3 或 4 段数字");
  assert.equal(JSON.parse(sourceManifest).version, version, "构建版本与源码 manifest 不一致，请重新构建");

  const zipRoot = `PlateGo-Chrome-v${version}`;
  const zipName = `${zipRoot}.zip`;
  const zipPath = resolve(root, "dist/releases", zipName);
  const zipBytes = await regularFile(zipPath);
  run("unzip", ["-tq", zipPath]);
  const names = run("unzip", ["-Z", "-1", zipPath]).toString().trim().split("\n");
  assert.equal(new Set(names).size, names.length, "ZIP 含重复路径");
  assert(!/^l[rwx-]{9}\s/m.test(run("unzip", ["-Z", "-l", zipPath]).toString()), "ZIP 不能包含符号链接");
  const files = await buildFiles(buildRoot);
  const allowed = new Set([...guideFiles, ...files.map((file) => `extension/${file}`)].map((file) => `${zipRoot}/${file}`));
  const directories = new Set([`${zipRoot}/`, `${zipRoot}/extension/`, `${zipRoot}/extension/assets/`]);
  for (const name of names) assert(allowed.has(name) || directories.has(name), `ZIP 包含非公开白名单路径：${name}`);
  for (const name of allowed) assert(names.includes(name), `ZIP 缺少必需文件：${name}`);
  const checked = new Set();
  const packageChecksums = zipRead(zipPath, `${zipRoot}/SHA256SUMS.txt`).toString().trim().split(/\r?\n/);
  for (const line of packageChecksums) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    assert(match, "安装包 SHA256SUMS.txt 格式无效");
    const name = `${zipRoot}/${match[2]}`;
    assert(allowed.has(name) && name !== `${zipRoot}/SHA256SUMS.txt` && !checked.has(name), `安装包校验路径无效或重复：${match[2]}`);
    assert.equal(hash(zipRead(zipPath, name)), match[1], `安装包内部 SHA-256 不一致：${match[2]}`);
    checked.add(name);
  }
  assert.equal(checked.size, allowed.size - 1, "安装包 SHA256SUMS.txt 未覆盖全部文件");
  const buildChecksums = [];
  for (const path of files) {
    const bytes = await regularFile(resolve(buildRoot, path));
    const sha256 = hash(bytes);
    assert.equal(hash(zipRead(zipPath, `${zipRoot}/extension/${path}`)), sha256, `安装包与当前扩展构建不同：${path}`);
    buildChecksums.push({ path, sha256, size: bytes.length });
  }

  const sourceCommit = git(root, ["rev-parse", "HEAD"]);
  const worktreeStatus = git(root, ["status", "--porcelain", "--untracked-files=normal"]);
  const artifactId = `platego-v${version}-${now.toISOString().replace(/[-:.]/g, "")}-${sourceCommit?.slice(0, 7) || "nogit"}`;
  const outputRoot = resolve(root, "dist/deployment");
  const directory = resolve(outputRoot, artifactId);
  const archive = `${directory}.tar.gz`;
  const latest = { version, path: `/downloads/${zipName}`, sha256: hash(zipBytes), size: zipBytes.length };
  const checksumPath = `/downloads/SHA256SUMS-v${version}.txt`;
  const values = {
    ARTIFACT_ID: artifactId, VERSION: version, DOWNLOAD_PATH: latest.path,
    CHECKSUM_PATH: checksumPath, SHA256: latest.sha256,
    SIZE_LABEL: `${(zipBytes.length / 1024 / 1024).toFixed(2)} MiB`
  };
  const inputs = [];
  const payload = [];
  async function input(relative) {
    const bytes = await regularFile(resolve(root, relative));
    inputs.push({ path: relative, sha256: hash(bytes), size: bytes.length });
    return bytes;
  }
  async function output(path, bytes) {
    await writeFile(resolve(directory, path), bytes, { mode: 0o644, flag: "wx" });
    await chmod(resolve(directory, path), 0o644);
    payload.push({ path, sha256: hash(bytes), size: Buffer.byteLength(bytes) });
  }

  await mkdir(outputRoot, { recursive: true });
  await mkdir(directory, { mode: 0o755 });
  try {
    for (const path of [directory, resolve(directory, "site"), resolve(directory, "site/downloads")]) {
      if (path !== directory) await mkdir(path, { mode: 0o755 });
      await chmod(path, 0o755);
    }
    for (const file of configFiles) await output(file, await input(`ops/downloads/${file}`));
    const imageLock = JSON.parse(await readFile(resolve(directory, "image-lock.json"), "utf8"));
    assert(/^\d+\.\d+\.\d+-alpine-slim$/.test(imageLock.version) && /^sha256:[a-f0-9]{64}$/.test(imageLock.digest), "镜像必须固定版本和 SHA-256");
    assert.equal(imageLock.image, `ghcr.io/nginx/nginx-unprivileged:${imageLock.version}@${imageLock.digest}`, "镜像来源与固定版本记录不一致");
    assert((await readFile(resolve(directory, "compose.yaml"), "utf8")).includes(`image: ${imageLock.image}\n`), "Compose 镜像与核验记录不一致");
    await output("README.zh-CN.md", render((await input("ops/downloads/README.zh-CN.md")).toString(), values));
    await output("site/index.html", render((await input("ops/downloads/index.html")).toString(), values));
    await output("site/latest.json", `${JSON.stringify(latest, null, 2)}\n`);
    await output("site/healthz", "ok\n");
    await output(`site${latest.path}`, zipBytes);
    await output(`site${checksumPath}`, `${latest.sha256}  ${zipName}\n`);
    await input("scripts/package-site.mjs");
    await output("deployment.json", `${JSON.stringify({
      schemaVersion: 1, artifactId, createdAt: now.toISOString(), version,
      source: {
        repository: "https://github.com/OttoPrua/PlateGo", gitCommit: sourceCommit,
        worktreeDirty: worktreeStatus === null ? null : Boolean(worktreeStatus),
        manifestSha256: hash(sourceManifest), packagingInputs: inputs
      },
      build: { manifestSha256: hash(buildManifest), files: buildChecksums },
      release: { file: zipName, sha256: latest.sha256, size: latest.size },
      image: imageLock, files: [...payload]
    }, null, 2)}\n`);
    await output("SHA256SUMS", `${payload.map((file) => `${file.sha256}  ${file.path}`).join("\n")}\n`);
    execFileSync("tar", ["-czf", archive, "-C", outputRoot, artifactId], {
      env: { ...process.env, COPYFILE_DISABLE: "1" }, stdio: ["ignore", "pipe", "pipe"]
    });
    const archiveSha256 = hash(await readFile(archive));
    await writeFile(`${archive}.sha256`, `${archiveSha256}  ${basename(archive)}\n`, { flag: "wx", mode: 0o644 });
    return { artifactId, directory, archive, archiveSha256, latest };
  } catch (error) {
    // Only remove this invocation's newly created, uniquely named output.
    await rm(directory, { recursive: true, force: true });
    await rm(archive, { force: true });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await packageSite(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
