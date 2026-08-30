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
  "http://localhost:8789/*",
  "https://api.ocr.space/*"
].sort()), "主机权限只能包含本机后端和 OCR.space");
assert(manifest.content_security_policy?.extension_pages === "script-src 'self'; object-src 'self'", "扩展页 CSP 不符合本地静态脚本约束");
assert(!manifest.content_security_policy.extension_pages.includes("unsafe-"), "扩展页 CSP 不得允许 unsafe-inline 或 unsafe-eval");
assert(manifest.background?.service_worker === "background.js", "缺少 MV3 service worker");

const expectedMatches = [
  "http://127.0.0.1:4173/official-mock*",
  "http://localhost:4173/official-mock*",
  "https://sh.122.gov.cn/*"
];
assert(manifest.content_scripts?.length === 2, "必须声明页面助手与官方规则桥两组静态内容脚本");
const contentDeclaration = manifest.content_scripts.find((item) => item.js?.includes("content.js"));
const ruleBridgeDeclaration = manifest.content_scripts.find((item) => item.js?.includes("official-rule-bridge.js"));
assert(Boolean(contentDeclaration), "缺少页面助手静态内容脚本");
assert(Boolean(ruleBridgeDeclaration), "缺少官方规则桥静态内容脚本");
assert(JSON.stringify([...contentDeclaration.matches].sort()) === JSON.stringify(expectedMatches.sort()), "静态内容脚本匹配范围不正确");
assert(JSON.stringify(contentDeclaration.js) === JSON.stringify(["certificate-fields.js", "content.js"]), "内容脚本必须是静态 certificate-fields.js 与 content.js");
assert(JSON.stringify(contentDeclaration.css) === JSON.stringify(["content.css"]), "内容样式必须静态声明以避开页面 CSP");
assert(JSON.stringify(ruleBridgeDeclaration.matches) === JSON.stringify(["https://sh.122.gov.cn/veh1/netxh/zbxh*"]), "官方规则桥必须覆盖模拟与正式自编 iframe，并由桥内精确路径门控");
assert(ruleBridgeDeclaration.world === "MAIN" && ruleBridgeDeclaration.all_frames === true, "官方规则桥必须在自编 iframe 的 MAIN world 只读运行");
assert(ruleBridgeDeclaration.run_at === "document_idle", "官方规则桥必须等待页面模块加载");

for (const relativePath of [
  manifest.action.default_popup,
  manifest.background.service_worker,
  ...contentDeclaration.js,
  ...contentDeclaration.css,
  ...ruleBridgeDeclaration.js,
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
const ruleBridgeScript = await read("official-rule-bridge.js");
const backgroundScript = await read("background.js");
const smokeScript = await readFile(resolve(extensionRoot, "scripts/smoke-fixture.mjs"), "utf8");
const popupHtml = await read("popup.html");
const popupScriptName = popupHtml.match(/<script\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
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
assert(contentScript.includes("official-simulation") && contentScript.includes("/veh1/netxh/main"), "内容脚本必须正向识别官方模拟选号壳层");
assert(contentScript.includes("official-live") && contentScript.includes("isOfficialLiveShell") && contentScript.includes('"/veh1/netxh/zbxh"') && contentScript.includes('"/veh1/netxh/sjxh"'), "内容脚本必须按精确正式壳层与 iframe 路径识别正式选号");
assert(contentScript.includes('"live-local"') && !contentScript.includes('namespace: "live"'), "正式号池必须使用仅本机命名空间，不能生成公共 live 观察");
assert(contentScript.includes("detectFlowStep") && contentScript.includes("CONFIRM_INFO"), "助手必须自动跟随官方步骤，并只在确认信息页开放车辆档案");
assert(contentScript.includes("entry-nav") && contentScript.includes("12123 选号站") && contentScript.includes("号段公示"), "登录和基本信息必须显示默认导航");
assert(contentScript.includes("veh1/netxh/main?gnid=1001") && contentScript.includes("vehxhhdpub"), "默认导航必须链到 12123 选号站和号段公示");
assert(contentScript.includes("1024") && contentScript.includes("2048") && contentScript.includes("400") && contentScript.includes("520") && contentScript.includes("1314"), "偏好预设必须提供建议组合");
assert(contentScript.includes("showLanding") && contentScript.includes("showEntryNav") && contentScript.includes("toggle-compose-combo"), "导航只在选号过程外展示，并要能改自编筛选");
assert(!contentScript.includes("flow-index"), "助手不得展示流程索引");
assert(contentScript.includes("HTMLElement.prototype.click.call"), "官方模拟键盘只能走 prototype.click.call");
assert(contentScript.includes("platego_vehicle_records") && contentScript.includes("一键填入确认页") && contentScript.includes("fill-search-both") && contentScript.includes("一键填入"), "内容脚本必须提供确认页填入与查询窗一键填入");
assert(!contentScript.includes("填入此栏") && !contentScript.includes("fill-search-field"), "查询窗不得再提供分栏填入此栏");
assert(contentScript.includes("scanOfficialSelectionKeyboard") && contentScript.includes("maybeStartOfficialSelfScan") && contentScript.includes('if (page.mode !== "self") return;'), "官方模拟或正式页只能在用户已经切到自编后遍历白色按键");
assert(!contentScript.includes("activateOfficialSelfTab") && !contentScript.includes("findOfficialSelfTab"), "插件不得主动把随机选号切回自编选号");
assert(contentScript.includes("pause-scan") && contentScript.includes("scanHold") && contentScript.includes("暂停读取"), "采集中必须能暂停读取并保留已读号码");
assert(contentScript.includes("MAX_OFFICIAL_SCAN_NODES") && contentScript.includes("replaceOfficialLocalPool") && contentScript.includes("export-pool"), "官方模拟必须走完号池、刷新本机池并保留导出");
assert(contentScript.includes("looksLikeStartSelection") && contentScript.includes("开始选号"), "用户点击开始选号后才能自动进入自编遍历");
assert(contentScript.includes("officialKeyboardRoot") && contentScript.includes("waitOfficialKeyboardStep") && contentScript.includes(".keyboard"), "自编遍历必须按可见键盘当前白键逐层确认");
assert(contentScript.includes("isOfficialKeyboardResetFlash") && contentScript.includes("officialIdleKeySignature") && contentScript.includes("readOfficialSettledLabels"), "按键后必须丢掉空键盘中间态，等白键稳定后再读");
assert(contentScript.includes("officialIntentInputs") && contentScript.includes("officialHasInputSuffix") && contentScript.includes("officialInputValue"), "可选号码必须来自自编输入框里实际出现的后缀");
assert(contentScript.includes("officialFixedPrefix") && contentScript.includes("officialLastKeyCompletions") && contentScript.includes("harvestOfficialLastKeys"), "官方自编固定前缀只有沪，框满后用剩余白键补最后一位");
assert(contentScript.includes("officialNextHdKeys") && contentScript.includes("expandOfficialHdArr") && contentScript.includes("tryOfficialRuleSnapshotScan"), "官方自编必须以号段规则快照为主路径");
assert(contentScript.includes("officialIsExcluded") && contentScript.includes("hphmRegexes") && contentScript.includes("filterComplete"), "号段快照必须逐前缀应用完整灰键过滤规则");
assert(contentScript.includes("platego_official_rule_snapshot") && contentScript.includes("可编号段快照"), "号段快照必须写入本机并标明不是实时可用");
assert(contentScript.includes("platego_self_entry_queue") && contentScript.includes("manual-self-pool"), "自编页必须提供可持久化的本机手动号池");
assert(contentScript.includes("fill-self-batch") && contentScript.includes("maybeAdvanceSubmittedSelfBatch") && contentScript.includes("restore-self-batch") && contentScript.includes("currentSelfEntryBatch"), "自编页必须按每轮最多五个填入、根据提交回执自动推进并能恢复上一轮");
assert(contentScript.includes("platego_position_patterns") && contentScript.includes("position-pattern-slot") && contentScript.includes("positionPatternMatches"), "自编页必须直接提供固定位置或顺序匹配规则");
assert(contentScript.includes("toggle-rule-result") && contentScript.includes("select-rule-top-five") && contentScript.includes("platego_self_rule_selection"), "自编页必须允许用户明确选择规则命中号码");
assert(contentScript.includes("queueMicrotask") && contentScript.includes("slotIndex + 1") && contentScript.includes('event.key !== "Backspace"'), "规则格必须支持逐字自动前进和退格返回上一格");
assert(contentScript.includes("data-selected-drag") && contentScript.includes("reorderSelectedValues") && contentScript.includes("已选填入顺序"), "已选号码必须能拖动排序并按每轮五个分组展示");
assert(contentScript.includes("randomPositionRuleMarkup") && contentScript.includes('tips.push("position")') && contentScript.includes("toggle-position-pattern-enabled"), "随机页必须复用特定号码规则，并独立保存随机高亮开关");
assert(contentScript.includes('tips.push("many")') && contentScript.includes("hasManySameDigit"), "随机页必须提供同一数字至少三次的好多数高亮");
assert(contentScript.includes('data-action="pair-digits"') && contentScript.includes('data-action="sequence-targets"') && contentScript.includes('data-action="many-digits"'), "相同数字、顺序号和好多数必须允许自定义高亮目标，留空时沿用自动识别");
assert(contentScript.includes("digits.length - 3") && contentScript.includes("isConsecutiveDigits"), "随机顺序号必须从三个连续数字开始识别");
assert(contentScript.includes("classifyStrongNumberTips") && contentScript.includes("data-platego-number-tip-strong") && contentScript.includes("hasLoopSequence"), "随机号码必须把强匹配拆为静态泛光层，并支持四位以上回环");
assert(contentScript.includes("hasStrongPairLike") && contentScript.includes("hasStrongManySameDigit"), "三连或 AABB、四次重复或多个好多数命中必须进入强匹配层");
assert(contentScript.includes("presetRuleBuilderMarkup") && contentScript.includes("set-preset-rule-context") && contentScript.includes("选号规则预置"), "进入正式选号前必须可以预置随机与自编规则");
assert(contentScript.includes("匹配顺序") && contentScript.includes("rule-actions"), "规则卡顶部操作必须保持稳定位置并使用匹配顺序文案");
assert(!contentScript.includes('data-action="number-specifics"') && !contentScript.includes('data-action="remove-highlight-combo"'), "特定号码不得保留独立输入区，必须统一为规则卡");
assert(contentScript.includes("assistantScrollTop") && contentScript.includes("ruleResultsScrollTop") && contentScript.includes('classList.contains("shell")') && contentScript.includes('classList.contains("rule-results")'), "页面状态重绘时必须保留助手面板和匹配列表的滚动位置");
assert(contentScript.includes("platego_pool_snapshots_v1") && contentScript.includes("platego_captured_pool") && contentScript.includes("MAX_POOL_SNAPSHOTS"), "每次自动读取都必须在本机保留最新号池和滚动快照");
assert(contentScript.includes("officialIntentSlotSuffixes") && contentScript.includes("fillOfficialSelfEntryBatch"), "官方模拟自编必须按五意向槽的实际状态继续填入");
assert(!contentScript.includes('data-action="submit-self-batch"'), "自编批次助手不得提供代提交动作");
assert(!contentScript.includes("getHdList") && !contentScript.includes("validConfirmHphm") && !contentScript.includes("validToken"), "不得请求号段接口或读取校验令牌");
assert(ruleBridgeScript.includes("hphmRegex") && ruleBridgeScript.includes("hdArr") && ruleBridgeScript.includes("filterComplete"), "官方规则桥必须只读提取模板和完整过滤规则");
assert(!/fetch\s*\(|XMLHttpRequest|\.click\s*\(|cookie|localStorage|sessionStorage|indexedDB|clsbdh|validToken|captcha|yzm|password|idcard|sfzmhm/i.test(ruleBridgeScript), "官方规则桥不得联网、点击或读取敏感页面数据");
assert(contentScript.includes("clickOfficialSearchQuery") && contentScript.includes("isBrandQueryButton"), "查询窗一键填入后只代点查询，不点选择或确定");
assert(contentScript.includes("waitOfficialInputSuffix") && contentScript.includes("officialPause"), "按键后必须先等输入框写下后缀，再稍停让白键跟上");
assert(!contentScript.includes("looksLikeUnsettledKeyboard"), "第三位之后不得把字母白键当成未刷新而放弃");
assert(contentScript.includes("armOfficialKeyWatch") && contentScript.includes("MutationObserver"), "按键后必须等官方键盘 class 变化再继续");
assert(!contentScript.includes("terminals.push(prefix + label)"), "不得在框未满时用按键路径拼接完整号");
assert(!/开始选号[\s\S]{0,80}\.click\s*\(/.test(contentScript), "不得代点开始选号");
assert(contentScript.includes('digits.includes("0")'), "顺子不得把 0 算进去");
assert(contentScript.includes("data-action=\"check-vehicle\""), "填写后必须提供合格证核对预览");
assert(contentScript.includes("data-dropzone") && contentScript.includes("groupedVehicleMarkup"), "车辆档案必须支持拖入识别，长号码按四位分组显示");
assert(!contentScript.includes("保存到本机"), "车辆档案应默认自动保存，不得再放保存按钮");
assert(contentScript.includes("PLATEGO_OCR_CERTIFICATE") && contentScript.includes("OCR.space"), "内容脚本必须提供可选的 OCR.space 识别入口");
assert(!contentScript.includes("https://api.ocr.space"), "内容脚本不得直接请求 OCR.space");
assert(backgroundScript.includes("PLATEGO_OCR_CERTIFICATE") && backgroundScript.includes("https://api.ocr.space/parse/image"), "合格证识别只能走 OCR.space");
assert(backgroundScript.includes('return String(value || "").toLowerCase() === "cht" ? "cht" : "chs"'), "OCR.space 语言只能是简体或繁体中文");
assert(!contentScript.includes("OCR 密钥") && !contentScript.includes("data-ocr-key"), "页面助手不得填写 OCR.space 密钥");
assert(popupScript.includes("platego_ocr_space_key"), "OCR.space 密钥必须保存在插件弹窗后台配置");
assert(popupHtml.includes("OCR.space 密钥") && popupHtml.includes("简体中文"), "插件弹窗必须提供 OCR.space 密钥和中文语言");
assert(!backgroundScript.includes("LanguageModel"), "合格证识别不得依赖 Chrome 本机模型");
assert(backgroundScript.includes('importScripts("certificate-fields.js")'), "合格证栏位规则必须与后台脚本分离加载");
assert(!/PLATEGO_OCR_CERTIFICATE[\s\S]{0,1200}8789/.test(backgroundScript), "OCR 请求不得占用本机 PlateGo 后端额度");
await assertFile("certificate-fields.js");
assert(backgroundScript.includes('platego_real_adapter_approved: false'), "后台必须明确记录真实适配未批准");
assert(backgroundScript.includes('value.namespace !== "simulation"'), "后台必须拒绝非 simulation 观察");
assert(backgroundScript.includes('"position-only"'), "公共 Coverage 契约必须保留 position-only 前向兼容值");
assert(popupScript.includes("PLATEGO_GET_PAGE_STATUS"), "弹窗必须查询内容脚本的真实页面状态");
assert(popupScript.includes("official-live") && popupScript.includes("realAdapterApproved"), "弹窗必须区分已精确验收的正式页与未知官方页");
assert(popupScript.includes("official-simulation"), "弹窗必须区分官方模拟页与正式页");

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
assert(smokeScript.includes("[data-action=fill-self-batch]") && smokeScript.includes("[data-platego-user-validate]") && smokeScript.includes("已检测到你的提交回执"), "夹具 smoke 必须由用户提交一组并覆盖自动推进到下一组");
for (const action of ["changeBatch", "randomNumber", "validate", "confirmSelection", "submit"]) {
  assert(smokeScript.includes(`"${action}"`), `夹具 smoke 缺少用户专属动作审计：${action}`);
}
assert(smokeScript.includes("assertNoExtensionPageActions(finalClickAudit"), "夹具 smoke 必须最终证明扩展没有点击页面动作");
assert(smokeScript.includes('observationSummary.simulation >= 1 && observationSummary.live === 0'), "夹具 smoke 必须证明公共观察保持 simulation/live 分流");

for (const scriptName of ["content.js", "official-rule-bridge.js", "background.js", "certificate-fields.js", resolve(extensionRoot, "scripts/smoke-fixture.mjs")]) {
  const scriptPath = scriptName.startsWith("/") ? scriptName : resolve(distRoot, scriptName);
  execFileSync(process.execPath, ["--check", scriptPath], { stdio: "pipe" });
}

console.log("PlateGo extension validation: PASS");
console.log("MV3, minimal permissions, CSP, static injection, storage bridge, high-fidelity fixture audit and no-submit guard verified.");
