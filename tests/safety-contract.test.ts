import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NON_OFFICIAL_SOURCE_MUST_USE_SIMULATION_NAMESPACE,
  OFFICIAL_PAGE_MUST_USE_LIVE_NAMESPACE,
  observationNamespaceError
} from "../packages/core/src/index";

const root = resolve(import.meta.dirname, "..");

describe("public workspace safety contract", () => {
  it("keeps extension host permissions narrow", async () => {
    const manifest = JSON.parse(await readFile(resolve(root, "apps/extension/public/manifest.json"), "utf8")) as {
      host_permissions: string[];
      permissions: string[];
      content_scripts: Array<{ matches: string[] }>;
    };
    expect(manifest.host_permissions).not.toContain("<all_urls>");
    expect(manifest.host_permissions).not.toContain("http://*/*");
    expect(manifest.host_permissions).not.toContain("https://*/*");
    expect([...manifest.host_permissions].sort()).toEqual([
      "http://127.0.0.1:8789/*",
      "http://localhost:8789/*",
      "https://api.ocr.space/*"
    ].sort());
    expect(manifest.permissions).not.toContain("scripting");
    expect(manifest.permissions).not.toContain("tabs");
    expect(manifest.content_scripts.flatMap((entry) => entry.matches)).toContain("https://sh.122.gov.cn/*");
  });

  it("does not contain a programmatic click path in the page assistant", async () => {
    const content = await readFile(resolve(root, "apps/extension/public/content.js"), "utf8");
    expect(content).not.toMatch(/\.click\s*\(/);
    expect(content).not.toMatch(/dispatchEvent\s*\(\s*new\s+(?:MouseEvent|PointerEvent)/);
    expect(content).toContain("HTMLElement.prototype.click.call");
    expect(content).toContain("official-simulation");
    expect(content).toContain("official-live");
    expect(content).toContain("当前官方页面不在已验收的精确选号路由内");
    expect(content).toContain('realAdapterApproved: page.kind === "official-live"');
    expect(content).toContain('namespace: page.kind === "official-live" ? "live-local" : "simulation"');
  });

  it("keeps position-pattern rules in dedicated local extension storage", async () => {
    const [content, storage, dashboard] = await Promise.all([
      readFile(resolve(root, "apps/extension/public/content.js"), "utf8"),
      readFile(resolve(root, "packages/client-app/src/storage.ts"), "utf8"),
      readFile(resolve(root, "apps/extension/src/dashboard.tsx"), "utf8")
    ]);
    expect(content).toContain('POSITION_PATTERNS_STORAGE_KEY = "platego_position_patterns"');
    expect(content).toContain("persistPositionPatterns");
    expect(content).toContain("positionPatternMatches");
    expect(content).not.toMatch(/fetch[\s\S]{0,160}platego_position_patterns/);
    expect(storage).toContain('POSITION_PATTERNS_KEY = "platego_position_patterns"');
    expect(dashboard).toContain('POSITION_PATTERNS_STORAGE_KEY = "platego_position_patterns"');
  });

  it("keeps the exported configuration schema free of key material", async () => {
    const core = await readFile(resolve(root, "packages/core/src/index.ts"), "utf8");
    const configBlock = core.slice(core.indexOf("export interface PlateConfig"), core.indexOf("export interface PublicPoolObservation"));
    expect(configBlock).not.toMatch(/timeKey|sessionToken|paymentKey|rawKey/i);
  });

  it("encodes official-page / non-official observation namespace rules in the public contract", () => {
    expect(observationNamespaceError("official-page", "simulation")).toBe(OFFICIAL_PAGE_MUST_USE_LIVE_NAMESPACE);
    expect(observationNamespaceError("official-mock", "live")).toBe(NON_OFFICIAL_SOURCE_MUST_USE_SIMULATION_NAMESPACE);
    expect(observationNamespaceError("official-page", "live")).toBeUndefined();
    expect(observationNamespaceError("official-mock", "simulation")).toBeUndefined();
  });

  it("keeps npm workspaces on public packages only", async () => {
    const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
      workspaces: string[];
    };
    expect(pkg.workspaces).toEqual(["apps/*", "packages/*"]);
  });

  it("documents private companion paths in gitignore without requiring them to be deleted", async () => {
    const gitignore = await readFile(resolve(root, ".gitignore"), "utf8");
    for (const pattern of ["private/", "services/", "**/node_modules/**", "**/dist/**", "**/var/**", ".env"]) {
      expect(gitignore).toContain(pattern);
    }
    expect(existsSync(resolve(root, "apps/extension/package.json"))).toBe(true);
  });

  it("does not declare a dependency on the private backend package", async () => {
    const manifests = [
      "package.json",
      "apps/extension/package.json",
      "apps/web/package.json",
      "packages/client-app/package.json",
      "packages/core/package.json",
      "packages/sim-data/package.json"
    ];
    for (const relativePath of manifests) {
      const pkg = JSON.parse(await readFile(resolve(root, relativePath), "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      expect(pkg.dependencies?.["@platego/pool-api"]).toBeUndefined();
      expect(pkg.devDependencies?.["@platego/pool-api"]).toBeUndefined();
    }
  });

  it("git-ignores private companion paths once a repository exists", () => {
    if (!existsSync(resolve(root, ".git"))) return;
    const ignored = execFileSync("git", [
      "check-ignore",
      "private",
      "services/pool-api",
      "node_modules",
      "apps/web/dist",
      "apps/extension/dist"
    ], { cwd: root, encoding: "utf8" });
    expect(ignored).toMatch(/private/);
    expect(ignored).toMatch(/services\/pool-api/);
    expect(ignored).toMatch(/node_modules/);
    expect(ignored).toMatch(/dist/);
  });
});
