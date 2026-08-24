import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = resolve(extensionRoot, "dist");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function read(relativePath) {
  return readFile(resolve(distRoot, relativePath), "utf8");
}

async function assertFile(relativePath) {
  await access(resolve(distRoot, relativePath));
}

const manifest = JSON.parse(await read("manifest.json"));
assert(manifest.manifest_version === 3, "manifest_version 必须是 3");
assert(Number(manifest.minimum_chrome_version) >= 109, "Chrome 最低版本必须覆盖 structuredClone 与 adoptedStyleSheets");
assert(JSON.stringify([...manifest.permissions].sort()) === JSON.stringify(["activeTab", "storage"]), "权限清单不是预期的最小集合");
assert(!manifest.permissions.includes("scripting") && !manifest.permissions.includes("tabs"), "不得请求 scripting 或 tabs 权限");
assert(JSON.stringify([...manifest.host_permissions].sort()) === JSON.stringify([
  "http://127.0.0.1:8789/*",
  "http://localhost:8789/*"
].sort()), "主机权限只能包含本机后端");
assert(manifest.content_security_policy?.extension_pages === "script-src 'self'; object-src 'self'", "扩展页 CSP 不符合本地静态脚本约束");
assert(!manifest.content_security_policy.extension_pages.includes("unsafe-"), "扩展页 CSP 不得允许 unsafe-inline 或 unsafe-eval");
assert(manifest.background?.service_worker === "background.js", "缺少 MV3 service worker");

const expectedMatches = [
  "http://127.0.0.1:4173/official-mock*",
  "http://localhost:4173/official-mock*",
  "https://sh.122.gov.cn/*"
];
assert(manifest.content_scripts?.length === 1, "必须只有一组静态内容脚本声明");
const contentDeclaration = manifest.content_scripts[0];
assert(JSON.stringify([...contentDeclaration.matches].sort()) === JSON.stringify(expectedMatches.sort()), "静态内容脚本匹配范围不正确");
assert(JSON.stringify(contentDeclaration.js) === JSON.stringify(["content.js"]), "内容脚本必须是静态 content.js");
assert(JSON.stringify(contentDeclaration.css) === JSON.stringify(["content.css"]), "内容样式必须静态声明以避开页面 CSP");

for (const relativePath of [
  manifest.action.default_popup,
  manifest.background.service_worker,
  ...contentDeclaration.js,
  ...contentDeclaration.css,
  "index.html"
]) await assertFile(relativePath);

for (const htmlName of ["index.html", "popup.html"]) {
  const html = await read(htmlName);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attributes = match[1];
    const body = match[2].trim();
    const source = attributes.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    assert(Boolean(source), `${htmlName} 包含无 src 的内联脚本`);
    assert(!/^(?:https?:|data:|javascript:)/i.test(source), `${htmlName} 包含远程或内联脚本地址`);
    assert(body.length === 0, `${htmlName} 包含内联脚本内容`);
    const target = source.replace(/^\.\//, "").replace(/^\//, "");
    await assertFile(target);
  }
}

const contentScript = await read("content.js");
const backgroundScript = await read("background.js");
const smokeScript = await readFile(resolve(extensionRoot, "scripts/smoke-fixture.mjs"), "utf8");
const popupScriptName = (await read("popup.html")).match(/<script\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
  ?.replace(/^\.\//, "").replace(/^\//, "");
assert(Boolean(popupScriptName), "popup.html 缺少静态弹窗脚本");
const popupScript = await read(popupScriptName);
const dangerousPageActions = [
  /\.click\s*\(/,
  /\.submit\s*\(/,
  /requestSubmit\s*\(/,
  /new\s+MouseEvent\s*\(/,
  /new\s+KeyboardEvent\s*\(/,
  /dispatchEvent\s*\(\s*new\s+Event\s*\(\s*["']submit["']/
];
for (const pattern of dangerousPageActions) {
  assert(!pattern.test(contentScript), `内容脚本出现禁止的页面动作：${pattern}`);
}
for (const userOnlyControl of [
  "data-platego-user-gate-action",
  "data-platego-user-confirm-info",
  "data-platego-random-reset",
  "data-platego-user-enter-self",
  "data-platego-user-validate",
  "data-platego-user-confirm-selection"
]) {
  assert(!contentScript.includes(userOnlyControl), `内容脚本不得查询用户专属页面动作：${userOnlyControl}`);
}
assert(!/^\s*import\s/m.test(contentScript), "静态内容脚本不能依赖模块 import");
assert(contentScript.includes('page.randomNumbers = mode === "random" ? readRandomNumbers(root, page) : []'), "随机号码只能在随机模式下只读采集");
assert(contentScript.includes('[data-platego-random-number]'), "随机只读评分缺少固定夹具标记");
assert(contentScript.includes('namespace: "simulation"') && contentScript.includes('source: "official-mock"'), "样机观察必须固定进入 simulation 命名空间");
assert(!contentScript.includes('namespace: "live"') && !contentScript.includes('source: "official-page"'), "未验收内容脚本不得生成真实公共观察");
assert(backgroundScript.includes('platego_real_adapter_approved: false'), "后台必须明确记录真实适配未批准");
assert(backgroundScript.includes('value.namespace !== "simulation"'), "后台必须拒绝非 simulation 观察");
assert(backgroundScript.includes('"position-only"'), "公共 Coverage 契约必须保留 position-only 前向兼容值");
assert(popupScript.includes("PLATEGO_GET_PAGE_STATUS"), "弹窗必须查询内容脚本的真实页面状态");
assert(popupScript.includes("真实 DOM 尚未现场验收"), "弹窗必须明确提示真实上海适配未验收");

assert(smokeScript.includes("document.documentElement.dataset.plategoEntryGate"), "夹具 smoke 必须读取公开 entry gate 状态");
assert(smokeScript.includes("MAX_ENTRY_GATE_ACTIONS") && smokeScript.includes('finalEntryGate === "SELECTION_READY"'), "夹具 smoke 必须有界推进到 SELECTION_READY");
assert(!/for\s*\([^)]*<\s*[45]\s*;[^)]*data-platego-user-gate-action/s.test(smokeScript), "夹具 smoke 不得硬编码 4 或 5 个入口动作");
assert(smokeScript.includes("entryGateTrace") && smokeScript.includes("entryGateActions"), "夹具 smoke 必须记录入口 gate 轨迹");
assert(smokeScript.includes("__plategoClickAudit") && smokeScript.includes('window.__plategoClickAudit = {extension: emptyBucket(), user: emptyBucket()}'), "夹具 smoke 必须把用户点击与扩展点击分账");
assert(smokeScript.includes("confirmInfoPresent") && smokeScript.includes("gateActionDisabled"), "夹具 smoke 必须按页面状态识别默认未确认的确认信息页");
assert(smokeScript.includes("__plategoTestUserClick('[data-platego-user-confirm-info]')") && smokeScript.includes("confirmInfoActions.length === 1"), "夹具 smoke 必须把确认信息勾选记录为独立用户动作");
assert(smokeScript.includes("__plategoTestUserClick('[data-platego-random-reset]')"), "夹具 smoke 必须模拟用户亲自启动第一批随机号码");
assert(smokeScript.includes("只读读取 0 个号码") && smokeScript.includes("Random page did not begin empty"), "夹具 smoke 必须证明随机页初始为空");
assert(smokeScript.includes("Expected 10 read-only scored random cards") && smokeScript.includes("selectedCards === 0"), "夹具 smoke 必须证明用户启动后仅只读评分 10 个号码");
assert(smokeScript.includes("Non-empty probe input was not restored after traversal") && smokeScript.includes("收集 240 个完整组合"), "夹具 smoke 必须证明完整遍历并恢复非空输入");
for (const action of ["changeBatch", "randomNumber", "validate", "confirmSelection", "submit"]) {
  assert(smokeScript.includes(`"${action}"`), `夹具 smoke 缺少用户专属动作审计：${action}`);
}
assert(smokeScript.includes("assertNoExtensionPageActions(finalClickAudit"), "夹具 smoke 必须最终证明扩展没有点击页面动作");
assert(smokeScript.includes('observationSummary.simulation >= 1 && observationSummary.live === 0'), "夹具 smoke 必须证明公共观察保持 simulation/live 分流");

for (const scriptName of ["content.js", "background.js", resolve(extensionRoot, "scripts/smoke-fixture.mjs")]) {
  const scriptPath = scriptName.startsWith("/") ? scriptName : resolve(distRoot, scriptName);
  execFileSync(process.execPath, ["--check", scriptPath], { stdio: "pipe" });
}

console.log("PlateGo extension validation: PASS");
console.log("MV3, minimal permissions, CSP, static injection, storage bridge, high-fidelity fixture audit and no-submit guard verified.");
