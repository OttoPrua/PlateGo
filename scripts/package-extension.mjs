import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const extensionFiles = [
  "manifest.json", "index.html", "popup.html", "background.js", "certificate-fields.js",
  "content.js", "content.css", "official-rule-bridge.js"
];
const installerFiles = ["Install.command", "Install-Windows.cmd", "Install-Windows.ps1", "INSTALL.html"];
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

async function plainFile(root, relative) {
  if (!/^[A-Za-z0-9_./-]+$/.test(relative) || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`不安全的文件路径：${relative}`);
  }
  let current = root;
  for (const part of ["", ...relative.split("/")]) {
    current = part ? resolve(current, part) : current;
    const info = await lstat(current);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) throw new Error(`拒绝链接或特殊文件：${current}`);
  }
  if (!(await lstat(current)).isFile()) throw new Error(`不是文件：${current}`);
  return current;
}

export async function packageExtension({
  buildDir = resolve(projectRoot, "apps/extension/dist"),
  outputDir = resolve(projectRoot, "dist/releases")
} = {}) {
  buildDir = resolve(buildDir);
  outputDir = resolve(outputDir);
  const manifest = JSON.parse(await readFile(await plainFile(buildDir, "manifest.json"), "utf8"));
  if (manifest.manifest_version !== 3 || !/^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/.test(manifest.version)
    || manifest.version.split(".").some((part) => Number(part) > 65535) || !manifest.version.split(".").some(Number)) {
    throw new Error("构建产物必须包含有效的 MV3 manifest 与 Chrome 版本号");
  }
  const references = [manifest.action?.default_popup, manifest.background?.service_worker,
    ...(manifest.content_scripts ?? []).flatMap((item) => [...(item.js ?? []), ...(item.css ?? [])])];
  if (references.some((name) => !extensionFiles.includes(name))) throw new Error("manifest 引用了发布白名单外的文件");

  const selected = new Set(extensionFiles);
  for (const html of ["index.html", "popup.html"]) {
    const source = await readFile(await plainFile(buildDir, html), "utf8");
    for (const match of source.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
      const asset = match[1].replace(/^\.\//, "");
      if (!/^assets\/[A-Za-z0-9_-]+\.(?:js|css)$/.test(asset)) throw new Error(`HTML 引用了发布白名单外的资源：${match[1]}`);
      selected.add(asset);
    }
  }
  // Only entry-page resources are public in this build. New lazy chunks need an explicit packaging update.
  for (const name of selected) {
    const path = await plainFile(buildDir, name);
    if (!name.startsWith("assets/") || !name.endsWith(".js")) continue;
    const source = await readFile(path, "utf8");
    for (const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) {
      const imported = match[1].startsWith("./") ? `assets/${match[1].slice(2)}` : match[1];
      if (!selected.has(imported)) throw new Error(`JS 引用了发布白名单外的模块：${match[1]}`);
    }
  }

  await mkdir(outputDir, { recursive: true });
  const temporary = await mkdtemp(resolve(outputDir, ".package-"));
  const stem = `PlateGo-Chrome-v${manifest.version}`;
  const packageRoot = resolve(temporary, stem);
  const archiveName = `${stem}.zip`;
  try {
    const checksums = [];
    for (const name of [...selected].sort()) {
      const target = resolve(packageRoot, "extension", name);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(await plainFile(buildDir, name), target);
      await chmod(target, 0o644);
      checksums.push(`${sha256(await readFile(target))}  extension/${name}`);
    }
    for (const name of installerFiles) {
      const source = resolve(projectRoot, "apps/extension/installer", name);
      if (!(await lstat(source)).isFile() || (await lstat(source)).isSymbolicLink()) throw new Error(`安装器不是普通文件：${name}`);
      let content = await readFile(source, "utf8");
      if (name.endsWith(".ps1")) content = "\uFEFF" + content.replace(/^\uFEFF/, ""); // Windows PowerShell 5.1 needs a BOM for Chinese.
      if (name.endsWith(".cmd") || name.endsWith(".ps1")) content = content.replace(/\r?\n/g, "\r\n");
      const target = resolve(packageRoot, name);
      await writeFile(target, content, { mode: name === "Install.command" ? 0o755 : 0o644 });
      checksums.push(`${sha256(await readFile(target))}  ${name}`);
    }
    await writeFile(resolve(packageRoot, "SHA256SUMS.txt"), checksums.sort().join("\n") + "\n");
    execFileSync("zip", ["-q", "-X", "-r", resolve(temporary, archiveName), stem], { cwd: temporary });
    const digest = sha256(await readFile(resolve(temporary, archiveName)));
    await writeFile(resolve(temporary, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`);
    await rename(resolve(temporary, archiveName), resolve(outputDir, archiveName));
    await rename(resolve(temporary, `${archiveName}.sha256`), resolve(outputDir, `${archiveName}.sha256`));
    return { version: manifest.version, archive: resolve(outputDir, archiveName), sha256: digest, checksum: resolve(outputDir, `${archiveName}.sha256`) };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  packageExtension().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(`发布包生成失败：${error.message}`);
    process.exitCode = 1;
  });
}
