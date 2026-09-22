import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { packageExtension } from "../../../scripts/package-extension.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const fixed = ["background.js", "certificate-fields.js", "content.js", "content.css", "official-rule-bridge.js"];

async function sandbox(t) {
  const path = await realpath(await mkdtemp(resolve(tmpdir(), "platego-installer-")));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function fixture(base, version = "0.1.0") {
  const buildDir = resolve(base, `构建 ${version}`);
  await mkdir(resolve(buildDir, "assets"), { recursive: true });
  await writeFile(resolve(buildDir, "manifest.json"), JSON.stringify({
    manifest_version: 3, version, name: "PlateGo 测试",
    action: { default_popup: "popup.html" }, background: { service_worker: "background.js" },
    content_scripts: [{ js: ["certificate-fields.js", "content.js", "official-rule-bridge.js"], css: ["content.css"] }]
  }));
  for (const file of fixed) await writeFile(resolve(buildDir, file), `/* fixture ${version} ${file} */\n`);
  for (const name of ["index", "popup"]) await writeFile(resolve(buildDir, `${name}.html`), '<script src="./assets/entry-A12345.js"></script><link href="./assets/entry-B12345.css">');
  await writeFile(resolve(buildDir, "assets/entry-A12345.js"), 'console.log("本地 fixture");');
  await writeFile(resolve(buildDir, "assets/entry-B12345.css"), "body { color: green; }");
  return buildDir;
}

async function packaged(base, version = "0.1.0") {
  const buildDir = await fixture(base, version);
  const result = await packageExtension({ buildDir, outputDir: resolve(base, "发布 output") });
  const extracted = resolve(base, `解压 ${version}`);
  await mkdir(extracted);
  execFileSync("unzip", ["-q", result.archive, "-d", extracted]);
  return { ...result, buildDir, packageRoot: resolve(extracted, `PlateGo-Chrome-v${version}`) };
}

function install(packageRoot, dataHome, extraEnv = {}) {
  return spawnSync("/bin/bash", [resolve(packageRoot, "Install.command")], {
    encoding: "utf8", env: { ...process.env, PLATEGO_DATA_HOME: dataHome, PLATEGO_NO_OPEN: "1", ...extraEnv }
  });
}

function success(result) { assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`); }
function rejected(result, reason) {
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, reason);
}

test("ZIP allowlist excludes private extras, preserves executable mode and verifies every payload byte", async (t) => {
  const base = await sandbox(t);
  const buildDir = await fixture(base);
  await mkdir(resolve(buildDir, "private"));
  for (const name of [".env", "private/vehicle.json", "assets/secret-A12345.js", "assets/entry-A12345.js.map"]) {
    await writeFile(resolve(buildDir, name), "PRIVATE_FIXTURE_DO_NOT_SHIP");
  }
  const result = await packageExtension({ buildDir, outputDir: resolve(base, "release") });
  const entries = execFileSync("unzip", ["-Z", "-1", result.archive], { encoding: "utf8" }).trim().split("\n");
  assert.ok(entries.every((entry) => entry.startsWith("PlateGo-Chrome-v0.1.0/")));
  assert.ok(entries.every((entry) => !/\.env|private|secret|\.map|__MACOSX/.test(entry)));
  const extracted = resolve(base, "extracted");
  execFileSync("unzip", ["-q", result.archive, "-d", extracted]);
  const packageRoot = resolve(extracted, "PlateGo-Chrome-v0.1.0");
  const sums = (await readFile(resolve(packageRoot, "SHA256SUMS.txt"), "utf8")).trim().split("\n");
  const listed = new Set();
  for (const line of sums) {
    assert.match(line, /^[a-f0-9]{64}  [^\r\n]+$/);
    const path = line.slice(66);
    assert.equal(hash(await readFile(resolve(packageRoot, path))), line.slice(0, 64), path);
    listed.add(`PlateGo-Chrome-v0.1.0/${path}`);
  }
  assert.equal(listed.size, sums.length);
  assert.deepEqual(new Set(entries.filter((entry) => !entry.endsWith("/") && !entry.endsWith("/SHA256SUMS.txt"))), listed);
  assert.equal((await lstat(resolve(packageRoot, "Install.command"))).mode & 0o777, 0o755);
  assert.equal(await readFile(result.checksum, "utf8"), `${hash(await readFile(result.archive))}  PlateGo-Chrome-v0.1.0.zip\n`);
  const ps = await readFile(resolve(packageRoot, "Install-Windows.ps1"));
  assert.deepEqual([...ps.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  for (const name of ["Install-Windows.cmd", "Install-Windows.ps1"]) assert.doesNotMatch(await readFile(resolve(packageRoot, name), "utf8"), /(?<!\r)\n/);
});

test("packaging refuses symlink files, linked assets, unsafe HTML paths and invalid manifests", async (t) => {
  const base = await sandbox(t);
  const buildDir = await fixture(base);
  const options = { buildDir, outputDir: resolve(base, "output") };
  const content = resolve(buildDir, "content.js");
  await rm(content);
  await symlink(resolve(buildDir, "background.js"), content);
  await assert.rejects(packageExtension(options), /链接/);
  await rm(content);
  await writeFile(content, "regular");
  const assets = resolve(buildDir, "assets");
  await cp(assets, resolve(base, "linked-assets"), { recursive: true });
  await rm(assets, { recursive: true });
  await symlink(resolve(base, "linked-assets"), assets);
  await assert.rejects(packageExtension(options), /链接/);
  await rm(assets);
  await cp(resolve(base, "linked-assets"), assets, { recursive: true });
  await writeFile(resolve(buildDir, "index.html"), '<script src="../private.js"></script>');
  await assert.rejects(packageExtension(options), /白名单/);
  const manifestPath = resolve(buildDir, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, version: "../../leak" }));
  await assert.rejects(packageExtension(options), /版本号/);
  await writeFile(manifestPath, JSON.stringify({ ...manifest, background: { service_worker: "../private.js" } }));
  await assert.rejects(packageExtension(options), /白名单/);
});

test("macOS installer stages first install, upgrades at a stable path and keeps a recoverable previous version", { skip: process.platform !== "darwin" }, async (t) => {
  const base = await sandbox(t);
  const first = await packaged(base);
  const dataHome = resolve(base, "应用 Data");
  const destination = resolve(dataHome, "PlateGo/extension");
  const initial = install(first.packageRoot, dataHome);
  success(initial);
  assert.match(initial.stdout, /浏览器内仍需你确认/);
  assert.match(initial.stdout, /重新加载/);
  assert.doesNotMatch(initial.stdout, /已把安装目录复制/);
  const original = await readFile(resolve(destination, "content.js"), "utf8");
  const second = await packaged(base, "0.1.1");
  success(install(second.packageRoot, dataHome));
  assert.equal(JSON.parse(await readFile(resolve(destination, "manifest.json"), "utf8")).version, "0.1.1");
  const previous = (await readdir(resolve(dataHome, "PlateGo"))).filter((name) => name.startsWith("previous."));
  assert.equal(previous.length, 1);
  assert.equal(await readFile(resolve(dataHome, "PlateGo", previous[0], "extension/content.js"), "utf8"), original);
  success(install(second.packageRoot, dataHome));
  assert.equal((await readdir(resolve(dataHome, "PlateGo"))).filter((name) => name.startsWith("previous.")).length, 2);
  assert.ok(!(await readdir(resolve(dataHome, "PlateGo"))).some((name) => name.startsWith(".stage.") || name === ".install-lock"));
});

test("macOS installer refuses tampering, omissions, path escape and unlisted files without altering the previous install", { skip: process.platform !== "darwin" }, async (t) => {
  const base = await sandbox(t);
  const release = await packaged(base);
  const dataHome = resolve(base, "isolated-data");
  success(install(release.packageRoot, dataHome));
  const installed = resolve(dataHome, "PlateGo/extension/content.js");
  const original = await readFile(installed, "utf8");
  const content = resolve(release.packageRoot, "extension/content.js");
  const originalPayload = await readFile(content);
  await writeFile(content, "tampered");
  rejected(install(release.packageRoot, dataHome), /文件校验失败/);
  await writeFile(content, originalPayload);
  const checksumFile = resolve(release.packageRoot, "SHA256SUMS.txt");
  const sums = await readFile(checksumFile, "utf8");
  await writeFile(checksumFile, sums.replace("extension/content.js", "extension/../../outside.js"));
  rejected(install(release.packageRoot, dataHome), /不安全或未知路径/);
  await writeFile(checksumFile, sums.split("\n").filter((line) => !line.endsWith("extension/content.js")).join("\n"));
  rejected(install(release.packageRoot, dataHome), /校验清单不完整/);
  await writeFile(checksumFile, sums);
  const extra = resolve(release.packageRoot, "extension/private.json");
  await writeFile(extra, "extra");
  rejected(install(release.packageRoot, dataHome), /清单外文件/);
  await rm(extra);
  await rm(content);
  await symlink(installed, content);
  rejected(install(release.packageRoot, dataHome), /符号链接或特殊文件/);
  assert.equal(await readFile(installed, "utf8"), original);
  assert.deepEqual(await readdir(resolve(dataHome, "PlateGo")), ["extension"]);
});

test("macOS installer rejects linked targets and an active lock; commit failure restores the exact previous directory", { skip: process.platform !== "darwin" }, async (t) => {
  const base = await sandbox(t);
  const release = await packaged(base);
  const dataHome = resolve(base, "data");
  await mkdir(resolve(dataHome, "PlateGo"), { recursive: true });
  const elsewhere = resolve(base, "other-app");
  await mkdir(elsewhere);
  const target = resolve(dataHome, "PlateGo/extension");
  await symlink(elsewhere, target);
  rejected(install(release.packageRoot, dataHome), /符号链接/);
  assert.deepEqual(await readdir(elsewhere), []);
  await rm(target);
  const linkedHome = resolve(base, "linked-data");
  await symlink(dataHome, linkedHome);
  rejected(install(release.packageRoot, linkedHome), /符号链接/);
  await mkdir(resolve(dataHome, "PlateGo/.install-lock"));
  rejected(install(release.packageRoot, dataHome), /已有安装/);
  await rm(resolve(dataHome, "PlateGo/.install-lock"), { recursive: true });
  success(install(release.packageRoot, dataHome));
  const originalInode = (await lstat(target)).ino;
  const mockBin = resolve(base, "mock-bin");
  await mkdir(mockBin);
  const mockCopy = resolve(mockBin, "cp");
  await writeFile(mockCopy, '#!/bin/bash\necho "simulated stage failure" >&2\nexit 78\n');
  await chmod(mockCopy, 0o755);
  rejected(install(release.packageRoot, dataHome, { PATH: `${mockBin}:${process.env.PATH}` }), /simulated stage failure/);
  assert.equal((await lstat(target)).ino, originalInode);
  await rm(mockCopy);
  const mockMove = resolve(mockBin, "mv");
  await writeFile(mockMove, '#!/bin/bash\nif [[ "$1" == */.stage.*/extension ]]; then echo "simulated commit failure" >&2; exit 77; fi\nexec /bin/mv "$@"\n');
  await chmod(mockMove, 0o755);
  const result = install(release.packageRoot, dataHome, { PATH: `${mockBin}:${process.env.PATH}` });
  rejected(result, /simulated commit failure/);
  assert.match(result.stderr, /已恢复上一版/);
  assert.equal((await lstat(target)).ino, originalInode);
  assert.deepEqual(await readdir(resolve(dataHome, "PlateGo")), ["extension"]);
});

test("installer entry points preserve browser/OS policy boundaries (static Windows checks; no Windows runtime claim)", async () => {
  const installerRoot = resolve(root, "apps/extension/installer");
  const mac = await readFile(resolve(installerRoot, "Install.command"), "utf8");
  const windows = await readFile(resolve(installerRoot, "Install-Windows.ps1"), "utf8");
  const cmd = await readFile(resolve(installerRoot, "Install-Windows.cmd"), "utf8");
  execFileSync("/bin/bash", ["-n", resolve(installerRoot, "Install.command")]);
  for (const script of [mac, windows, cmd]) {
    assert.doesNotMatch(script, /--load-extension|--user-data-dir|--remote-debugging|Set-ExecutionPolicy|ExecutionPolicy\s+Bypass|sudo|\breg(?:\.exe)?\s+(?:add|delete)|\b(?:killall|taskkill)\b|xattr|spctl/);
    assert.doesNotMatch(script, /Chrome[\\/]User Data|Chrome[\\/]Preferences/);
  }
  assert.match(cmd, /-NoProfile -ExecutionPolicy RemoteSigned -File "%~dp0Install-Windows.ps1"/);
  assert.match(cmd, /if errorlevel 1[\s\S]*pause[\s\S]*exit \/b 1/);
  assert.match(windows, /ReparsePoint/);
  assert.match(windows, /Get-FileHash -LiteralPath \$file -Algorithm SHA256/);
  assert.match(windows, /Assert-Payload \$stage \$true[\s\S]*Move-Item/);
  assert.match(windows, /finally[\s\S]*\$lockOwned/);
});
