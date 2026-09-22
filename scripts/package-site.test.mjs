import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { packageSite } from "./package-site.mjs";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function containerSmoke(directory, latest) {
  const project = `platego-site-test-${process.pid}`;
  const compose = (...args) => execFileSync("docker", ["compose", "-p", project, "-f", resolve(directory, "compose.yaml"), ...args], {
    env: { ...process.env, HOST_BIND_PORT: "0" }, stdio: ["ignore", "pipe", "pipe"]
  }).toString().trim();
  assert.equal(execFileSync("docker", ["ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`]).toString().trim(), "", "测试项目名已被占用");
  try {
    compose("up", "-d", "--wait", "--wait-timeout", "45");
    const address = compose("port", "downloads", "8080");
    assert.match(address, /^127\.0\.0\.1:\d+$/);
    const base = `http://${address}`;
    assert.equal(await (await fetch(`${base}/healthz`)).text(), "ok\n");
    const landing = await fetch(base, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(landing.status, 200);
    assert.equal(landing.headers.get("Cache-Control"), "no-cache");
    assert.equal(landing.headers.get("Content-Encoding"), "gzip");
    const index = await fetch(`${base}/latest.json`, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(index.headers.get("Cache-Control"), "no-cache");
    assert.equal(index.headers.get("Content-Encoding"), "gzip");
    assert.deepEqual(await index.json(), latest);
    const download = await fetch(`${base}${latest.path}`, { headers: { "Accept-Encoding": "gzip" } });
    assert.equal(download.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    assert.equal(download.headers.get("Content-Encoding"), null);
    assert.equal(sha(Buffer.from(await download.arrayBuffer())), latest.sha256);
    assert(download.headers.get("ETag"));
    const cached = await fetch(`${base}${latest.path}`, { headers: { "If-None-Match": download.headers.get("ETag") } });
    assert.equal(cached.status, 304);
    const proxied = await Promise.all(["/", "/latest.json", latest.path].map(async (path) => {
      const response = await fetch(`${base}${path}`, { headers: { "Accept-Encoding": "gzip", Via: "1.1 Caddy" } });
      assert.equal(response.status, 200, `proxied GET ${path}`);
      const body = Buffer.from(await response.arrayBuffer());
      if (path === latest.path) assert.equal(sha(body), latest.sha256);
      if (path === "/latest.json") assert.deepEqual(JSON.parse(body), latest);
      return { path, encoding: response.headers.get("Content-Encoding") };
    }));
    assert.deepEqual(proxied, [
      { path: "/", encoding: "gzip" },
      { path: "/latest.json", encoding: "gzip" },
      { path: latest.path, encoding: null }
    ]);
    const sums = await fetch(`${base}/downloads/SHA256SUMS-v${latest.version}.txt`);
    assert.equal(sums.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
    assert((await sums.text()).startsWith(latest.sha256));
    assert.equal((await fetch(`${base}/v1/pools`)).status, 404);
    assert.equal((await fetch(`${base}/deployment.json`)).status, 404);
    const [container] = JSON.parse(execFileSync("docker", ["inspect", compose("ps", "-q", "downloads")]).toString());
    assert.equal(container.Config.User, "101:101");
    assert.equal(container.HostConfig.ReadonlyRootfs, true);
    assert.equal(container.State.Health.Status, "healthy");
    assert(container.Mounts.every((mount) => !mount.RW));
  } finally {
    compose("down", "--timeout", "3");
  }
}

async function fixture(t) {
  const root = await mkdtemp(resolve(tmpdir(), "platego-site-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of ["ops", "scripts", "apps/extension/dist", "apps/extension/public", "dist/releases", "zip/PlateGo-Chrome-v0.1.1/extension", "private", "services"]) {
    await mkdir(resolve(root, path), { recursive: true });
  }
  await cp(resolve(sourceRoot, "ops/downloads"), resolve(root, "ops/downloads"), { recursive: true });
  await copyFile(resolve(sourceRoot, "scripts/package-site.mjs"), resolve(root, "scripts/package-site.mjs"));
  for (const path of ["apps/extension/dist/manifest.json", "apps/extension/public/manifest.json", "zip/PlateGo-Chrome-v0.1.1/extension/manifest.json"]) {
    await writeFile(resolve(root, path), JSON.stringify({ manifest_version: 3, version: "0.1.1" }));
  }
  const guideFiles = ["Install.command", "Install-Windows.cmd", "Install-Windows.ps1", "INSTALL.html"];
  for (const path of guideFiles) {
    await writeFile(resolve(root, "zip/PlateGo-Chrome-v0.1.1", path), "fixture\n");
  }
  const checksums = [];
  for (const path of [...guideFiles, "extension/manifest.json"]) {
    checksums.push(`${sha(await readFile(resolve(root, "zip/PlateGo-Chrome-v0.1.1", path)))}  ${path}`);
  }
  await writeFile(resolve(root, "zip/PlateGo-Chrome-v0.1.1/SHA256SUMS.txt"), `${checksums.join("\n")}\n`);
  await writeFile(resolve(root, "private/certificate.txt"), "PRIVATE_FIXTURE_MUST_NOT_SHIP");
  await writeFile(resolve(root, "services/.env"), "SECRET_FIXTURE_MUST_NOT_SHIP");
  const zip = resolve(root, "dist/releases/PlateGo-Chrome-v0.1.1.zip");
  execFileSync("zip", ["-qr", zip, "PlateGo-Chrome-v0.1.1"], { cwd: resolve(root, "zip") });
  return { root, zip };
}

test("packages only public files and records matching links, hashes and source state", async (t) => {
  const { root, zip } = await fixture(t);
  const result = await packageSite({ root, now: new Date("2026-09-22T00:00:00Z") });
  const latest = JSON.parse(await readFile(resolve(result.directory, "site/latest.json"), "utf8"));
  assert.deepEqual(Object.keys(latest), ["version", "path", "sha256", "size"]);
  assert.equal(latest.sha256, sha(await readFile(zip)));
  assert.equal(latest.size, (await readFile(zip)).length);
  const page = await readFile(resolve(result.directory, "site/index.html"), "utf8");
  assert(page.includes(`href="${latest.path}"`) && page.includes(latest.sha256));
  assert(page.includes("开发者模式") && page.includes("OCR.space") && !page.includes("{{"));
  for (const match of page.matchAll(/href="(\/[^"#]*)"/g)) await readFile(resolve(result.directory, `site${match[1]}`));
  const checksums = (await readFile(resolve(result.directory, "SHA256SUMS"), "utf8")).trim().split("\n");
  for (const line of checksums) {
    const [digest, path] = line.split("  ");
    assert.equal(sha(await readFile(resolve(result.directory, path))), digest, path);
  }
  const metadata = JSON.parse(await readFile(resolve(result.directory, "deployment.json"), "utf8"));
  assert.equal(metadata.source.gitCommit, null);
  assert.equal(metadata.source.worktreeDirty, null);
  assert.equal(metadata.release.sha256, latest.sha256);
  assert.equal(metadata.files.length, checksums.length - 1);
  const archiveFiles = execFileSync("tar", ["-tzf", result.archive]).toString();
  assert(!/private|services|node_modules|certificate|\.env\n/.test(archiveFiles));
  assert.equal(sha(await readFile(result.archive)), result.archiveSha256);
  const config = await readFile(resolve(result.directory, "compose.yaml"), "utf8");
  assert(config.includes("127.0.0.1:${HOST_BIND_PORT:-18801}:8080"));
  assert(config.includes("read_only: true") && config.includes("user: \"101:101\""));
  if (process.env.PLATEGO_DOCKER_SMOKE === "1") await containerSmoke(result.directory, latest);
});

test("rejects an unexpected private file even when the ZIP is valid", async (t) => {
  const { root, zip } = await fixture(t);
  await mkdir(resolve(root, "zip/PlateGo-Chrome-v0.1.1/private"));
  await writeFile(resolve(root, "zip/PlateGo-Chrome-v0.1.1/private/secret.txt"), "not-public");
  execFileSync("zip", ["-qr", zip, "PlateGo-Chrome-v0.1.1/private"], { cwd: resolve(root, "zip") });
  await assert.rejects(packageSite({ root }), /非公开白名单路径/);
});

test("rejects a stale ZIP after the extension build changes", async (t) => {
  const { root } = await fixture(t);
  await writeFile(resolve(root, "apps/extension/dist/manifest.json"), JSON.stringify({ manifest_version: 3, version: "0.1.1", name: "changed" }));
  await assert.rejects(packageSite({ root }), /安装包与当前扩展构建不同/);
});

test("rejects a changed installer whose inner checksum no longer matches", async (t) => {
  const { root, zip } = await fixture(t);
  await writeFile(resolve(root, "zip/PlateGo-Chrome-v0.1.1/Install.command"), "tampered installer\n");
  execFileSync("zip", ["-q", zip, "PlateGo-Chrome-v0.1.1/Install.command"], { cwd: resolve(root, "zip") });
  await assert.rejects(packageSite({ root }), /安装包内部 SHA-256 不一致/);
});
