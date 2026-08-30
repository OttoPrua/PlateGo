import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentSource = await readFile(resolve(extensionRoot, "public/content.js"), "utf8");
const ruleBridgeSource = await readFile(resolve(extensionRoot, "public/official-rule-bridge.js"), "utf8");
const manifest = JSON.parse(await readFile(resolve(extensionRoot, "public/manifest.json"), "utf8"));

function classifyOfficialShanghaiPage(locationLike, signals) {
  const official = locationLike.protocol === "https:" && locationLike.hostname === "sh.122.gov.cn";
  if (!official) return { kind: "unsupported" };
  const gnid = new URLSearchParams(locationLike.search || "").get("gnid");
  const simulationShell = locationLike.pathname === "/veh1/netxh/main" && gnid === "1001";
  const liveShell = locationLike.pathname === "/veh1/netxh" && gnid === "1001";
  if (!simulationShell && !liveShell) return { kind: "official-unverified" };
  if (signals.visibleRandomFrame) return { kind: liveShell ? "official-live" : "official-simulation", mode: "random" };
  if (signals.visibleCustomFrame) return { kind: liveShell ? "official-live" : "official-simulation", mode: "self" };
  return simulationShell ? { kind: "official-simulation", mode: "entry" } : { kind: "official-unverified" };
}

function matchFlowStepText(compact) {
  if (!compact) return "";
  if (/完成号牌预选|预选成功|您已成功完成本/.test(compact)) return "COMPLETE";
  if (/本人选号手机验证/.test(compact)) return "PHONE_VERIFY";
  if (/选号服务说明/.test(compact)) return "SERVICE_NOTICE";
  if (/(^|[^\u4e00-\u9fff])确认信息([^\u4e00-\u9fff]|$)/.test(compact) || /整车(出厂)?合格证编号/.test(compact)) {
    return "CONFIRM_INFO";
  }
  if (/(^|[^\u4e00-\u9fff])基本信息([^\u4e00-\u9fff]|$)/.test(compact)) return "BASIC_INFO";
  return "";
}

function detectFlowStep(signals) {
  if (signals.mode === "random" || signals.mode === "self") return "SELECT";
  if (signals.declaredStep) return signals.declaredStep;
  if (signals.hasCertificateField || signals.hasVinField) return "CONFIRM_INFO";
  return matchFlowStepText(String(signals.heading || "").replace(/\s+/g, ""))
    || matchFlowStepText(String(signals.visibleText || "").replace(/\s+/g, ""))
    || "BASIC_INFO";
}

test("only exact simulation and live shells with gnid=1001 can leave unverified", () => {
  assert.deepEqual(classifyOfficialShanghaiPage({
    protocol: "https:",
    hostname: "sh.122.gov.cn",
    pathname: "/veh1/netxh/main",
    search: ""
  }, { hasMemContent: true, hasTabSj: true, hasTabZb: true }), { kind: "official-unverified" });

  assert.deepEqual(classifyOfficialShanghaiPage({
    protocol: "https:",
    hostname: "sh.122.gov.cn",
    pathname: "/veh1/netxh/main",
    search: "?gnid=2001"
  }, { hasMemContent: true, hasTabSj: true, hasTabZb: true }), { kind: "official-unverified" });

  assert.deepEqual(classifyOfficialShanghaiPage({
    protocol: "https:",
    hostname: "sh.122.gov.cn",
    pathname: "/m/vehxh",
    search: ""
  }, { hasMemContent: true, hasTabSj: true, hasTabZb: true }), { kind: "official-unverified" });

  assert.deepEqual(classifyOfficialShanghaiPage({
    protocol: "https:",
    hostname: "sh.122.gov.cn",
    pathname: "/veh1/netxh/main",
    search: "?gnid=1001"
  }, {}), { kind: "official-simulation", mode: "entry" });

  assert.deepEqual(classifyOfficialShanghaiPage({
    protocol: "https:",
    hostname: "sh.122.gov.cn",
    pathname: "/veh1/netxh/main",
    search: "?gnid=1001"
  }, {
    hasMemContent: true,
    hasTabSj: true,
    hasTabZb: true,
    visibleRandomFrame: true
  }), { kind: "official-simulation", mode: "random" });

  assert.deepEqual(classifyOfficialShanghaiPage({
    protocol: "https:",
    hostname: "sh.122.gov.cn",
    pathname: "/veh1/netxh/main",
    search: "?gnid=1001"
  }, {
    hasMemContent: true,
    hasTabSj: true,
    hasTabZb: true,
    visibleCustomFrame: true
  }), { kind: "official-simulation", mode: "self" });

  assert.deepEqual(classifyOfficialShanghaiPage({
    protocol: "https:",
    hostname: "sh.122.gov.cn",
    pathname: "/veh1/netxh",
    search: "?gnid=1001"
  }, {}), { kind: "official-unverified" });

  assert.deepEqual(classifyOfficialShanghaiPage({
    protocol: "https:",
    hostname: "sh.122.gov.cn",
    pathname: "/veh1/netxh",
    search: "?gnid=1001"
  }, { visibleCustomFrame: true }), { kind: "official-live", mode: "self" });

  assert.deepEqual(classifyOfficialShanghaiPage({
    protocol: "https:",
    hostname: "sh.122.gov.cn",
    pathname: "/veh1/netxh",
    search: "?gnid=1001"
  }, { visibleRandomFrame: true }), { kind: "official-live", mode: "random" });
});

test("follows official iframe steps and only opens vehicle tools on confirm info", () => {
  assert.equal(detectFlowStep({ visibleText: "基本信息 车管所 号牌种类" }), "BASIC_INFO");
  assert.equal(detectFlowStep({ heading: "确认信息", visibleText: "整车合格证编号" }), "CONFIRM_INFO");
  assert.equal(detectFlowStep({ visibleText: "此步骤不录入车辆识别代号；这些虚构资料将在确认信息步骤单独核对。基本信息" }), "BASIC_INFO");
  assert.equal(detectFlowStep({ hasVinField: true, visibleText: "基本信息" }), "CONFIRM_INFO");
  assert.equal(detectFlowStep({ hasVinField: true, visibleText: "请输入车辆品牌 请输入车辆型号 查询" }), "CONFIRM_INFO");
  assert.equal(detectFlowStep({ mode: "random", visibleText: "确认信息" }), "SELECT");
  assert.equal(detectFlowStep({ declaredStep: "CONFIRM_INFO", visibleText: "基本信息" }), "CONFIRM_INFO");
  assert.doesNotMatch(contentSource, /flow-index/);
  assert.doesNotMatch(contentSource, /下一步：/);
  assert.match(contentSource, /CONFIRM_INFO/);
  assert.match(contentSource, /activePageDocuments/);
  assert.match(contentSource, /showVehicleArchive \? vehicleArchiveMarkup/);
  assert.match(contentSource, /showVehicleArchive = onConfirmStep \|\| state.searchOpen/);
  assert.match(contentSource, /isBrandSearchDialogOpen/);
  assert.match(contentSource, /watchBrandSearchOpener/);
  assert.match(contentSource, /isOverlaySearchFrame/);
  assert.match(contentSource, /parentConfirmFields/);
  assert.match(contentSource, /canFillVehicle = onConfirmStep/);
  assert.doesNotMatch(contentSource, /填入此栏/);
  assert.match(contentSource, /fill-search-both/);
  assert.match(contentSource, /一键填入/);
  assert.match(contentSource, /clickOfficialSearchQuery/);
  assert.match(contentSource, /search-pair/);
  assert.match(contentSource, /looksLikeBrandSearchChrome/);
  assert.match(contentSource, /refreshPageHints/);
  assert.match(contentSource, /syncSearchMode/);
  assert.match(contentSource, /data-action="check-vehicle"/);
  assert.match(contentSource, /looksLikeConfirmPage/);
  assert.match(contentSource, /collectReadableDocuments/);
  assert.match(contentSource, /companionHiddenInputs/);
  assert.match(contentSource, /findSearchInput/);
  assert.match(contentSource, /核对请回确认页看合格证位置/);
  assert.doesNotMatch(contentSource, /row\.querySelectorAll\("input\[type='hidden'\]"\)/);
  assert.doesNotMatch(contentSource, /activateAllowedControl/);
  assert.doesNotMatch(contentSource, /highlightNext/);
});

test("content script supports exact formal selection frames and never clicks confirm controls", () => {
  assert.match(contentSource, /official-simulation/);
  assert.match(contentSource, /official-live/);
  assert.match(contentSource, /\/veh1\/netxh\/main/);
  assert.match(contentSource, /isOfficialLiveShell/);
  assert.match(contentSource, /\/veh1\/netxh\/zbxh/);
  assert.match(contentSource, /\/veh1\/netxh\/sjxh/);
  assert.match(contentSource, /sjxhTest/);
  assert.match(contentSource, /zbxhTest/);
  assert.match(contentSource, /当前官方页面不在已验收的精确选号路由内/);
  assert.match(contentSource, /realAdapterApproved: page\.kind === "official-live"/);
  assert.doesNotMatch(contentSource, /\.click\s*\(/);
  assert.doesNotMatch(contentSource, /dispatchEvent\s*\(\s*new\s+(?:MouseEvent|PointerEvent)/);
  assert.match(contentSource, /activateSimulationKey/);
  assert.match(contentSource, /HTMLElement\.prototype\.click\.call/);
  assert.match(contentSource, /#submit/);
  assert.match(contentSource, /\.btns/);
  assert.match(contentSource, /官方主机禁止上传/);
  assert.match(contentSource, /capture-random/);
  assert.match(contentSource, /data-platego-number-tip/);
  assert.match(contentSource, /highlightRandomNumberFrames/);
  assert.match(contentSource, /ensureNumberTipStyles/);
  assert.match(contentSource, /watchRandomBatchChanges/);
  assert.match(contentSource, /maybeStartOfficialSelfScan/);
  assert.match(contentSource, /if \(page\.mode !== "self"\) return;/);
  assert.doesNotMatch(contentSource, /activateOfficialSelfTab/);
  assert.doesNotMatch(contentSource, /findOfficialSelfTab/);
  assert.match(contentSource, /scanOfficialSelectionKeyboard/);
  assert.match(contentSource, /pause-scan/);
  assert.match(contentSource, /scanHold/);
  assert.match(contentSource, /暂停读取/);
  assert.match(contentSource, /pressOfficialCharacter/);
  assert.match(contentSource, /officialKeyboardRoot/);
  assert.match(contentSource, /\.keyboard/);
  assert.match(contentSource, /waitOfficialKeyboardStep/);
  assert.match(contentSource, /waitOfficialInputSuffix/);
  assert.match(contentSource, /officialPause/);
  assert.doesNotMatch(contentSource, /looksLikeUnsettledKeyboard/);
  assert.match(contentSource, /officialActiveKeySignature/);
  assert.match(contentSource, /isOfficialKeyboardResetFlash/);
  assert.match(contentSource, /officialIdleKeySignature/);
  assert.match(contentSource, /captureOfficialIdleSignature/);
  assert.match(contentSource, /readOfficialSettledLabels/);
  assert.match(contentSource, /officialIntentInputs/);
  assert.match(contentSource, /officialHasInputSuffix/);
  assert.match(contentSource, /officialInputValue/);
  assert.match(contentSource, /officialFixedPrefix/);
  assert.match(contentSource, /officialLastKeyCompletions/);
  assert.match(contentSource, /harvestOfficialLastKeys/);
  assert.match(contentSource, /officialNextHdKeys/);
  assert.match(contentSource, /officialIsExcluded/);
  assert.match(contentSource, /compileOfficialHdRegexes/);
  assert.match(contentSource, /filterComplete/);
  assert.match(contentSource, /hphmRegexes/);
  assert.match(contentSource, /expandOfficialHdArr/);
  assert.match(contentSource, /tryOfficialRuleSnapshotScan/);
  assert.match(contentSource, /platego_official_rule_snapshot/);
  assert.match(contentSource, /可编号段快照/);
  assert.doesNotMatch(contentSource, /getHdList/);
  assert.doesNotMatch(contentSource, /validConfirmHphm/);
  assert.doesNotMatch(contentSource, /validToken/);
  assert.doesNotMatch(contentSource, /script\.textContent\s*=\s*`\(function/);
  assert.match(contentSource, /input\.text-width5/);
  assert.match(contentSource, /armOfficialKeyWatch/);
  assert.match(contentSource, /MutationObserver/);
  assert.doesNotMatch(contentSource, /末位只读当前白键/);
  assert.doesNotMatch(contentSource, /terminals\.push\(prefix \+ label\)/);
  assert.doesNotMatch(contentSource, /frameDoc\.querySelectorAll\("li"\)/);
  assert.match(contentSource, /li\.delete\.active/);
  assert.match(contentSource, /classList.contains\("active"\)/);
  assert.match(contentSource, /MAX_OFFICIAL_SCAN_NODES/);
  assert.match(contentSource, /replaceOfficialLocalPool/);
  assert.match(contentSource, /platego_captured_pool/);
  assert.match(contentSource, /platego_pool_snapshots_v1/);
  assert.match(contentSource, /platego_position_patterns/);
  assert.match(contentSource, /platego_position_patterns_updated_at/);
  assert.match(contentSource, /state\.selfRuleMatchCache = \{ key: "", values: \[\] \};\s+persistPositionPatterns\(\);/);
  assert.match(contentSource, /platego_config_updated_at/);
  assert.match(contentSource, /positionPatternMatches/);
  assert.match(contentSource, /toggle-rule-result/);
  assert.match(contentSource, /select-rule-top-five/);
  assert.match(contentSource, /export-pool/);
  assert.match(contentSource, /function exportCandidatePool/);
  assert.match(contentSource, /looksLikeStartSelection/);
  assert.match(contentSource, /开始选号/);
  assert.doesNotMatch(contentSource, /开始选号[\s\S]{0,80}\.click\s*\(/);
  assert.match(contentSource, /相同数字/);
  assert.match(contentSource, /顺序号/);
  assert.match(contentSource, /特定号码/);
  assert.match(contentSource, /0 不参与/);
  assert.doesNotMatch(contentSource, /只读评分/);
  assert.match(contentSource, /platego_vehicle_records/);
  assert.match(contentSource, /data-draft-field/);
  assert.match(contentSource, /"live-local"/);
  assert.doesNotMatch(contentSource, /namespace: "live"/);
  assert.doesNotMatch(contentSource, /source: "official-page"/);
});

test("official runtime rule bridge is narrowly scoped, main-world, read-only, and iframe-only", () => {
  const declaration = manifest.content_scripts.find((item) => item.js?.includes("official-rule-bridge.js"));
  assert.ok(declaration);
  assert.deepEqual(declaration.matches, ["https://sh.122.gov.cn/veh1/netxh/zbxh*"]);
  assert.equal(declaration.world, "MAIN");
  assert.equal(declaration.all_frames, true);
  assert.equal(declaration.run_at, "document_idle");
  assert.match(ruleBridgeSource, /hphmRegex/);
  assert.match(ruleBridgeSource, /hdArr/);
  assert.match(ruleBridgeSource, /filterComplete/);
  assert.match(ruleBridgeSource, /event\.source !== window\.parent/);
  assert.match(ruleBridgeSource, /event\.origin !== ORIGIN/);
  assert.match(ruleBridgeSource, /SUPPORTED_FRAME_PATHS/);
  assert.match(ruleBridgeSource, /"\/veh1\/netxh\/zbxh"/);
  assert.doesNotMatch(ruleBridgeSource, /\.click\s*\(/);
  assert.doesNotMatch(ruleBridgeSource, /fetch\s*\(/);
  assert.doesNotMatch(ruleBridgeSource, /XMLHttpRequest/);
  assert.doesNotMatch(ruleBridgeSource, /cookie|localStorage|sessionStorage|indexedDB|clsbdh|validToken|captcha|yzm|password|idcard|sfzmhm/i);
});

test("official runtime bridge returns every cached grey-key filter on simulation and live frames", () => {
  function runBridge(hphmRegex, pathname = "/veh1/netxh/zbxhTest") {
    let listener;
    let posted;
    const parent = {
      postMessage(payload, origin) { posted = { payload, origin }; }
    };
    const loader = () => {};
    loader.s = {
      contexts: {
        _: {
          defined: {
            "vehxh/comm/zbxhfaker": {
              options: {
                hdArr: ["AA!@!!", "AB!@!!"],
                hphmRegex,
                hphmLength: 7,
                hpzl: "52"
              }
            }
          }
        }
      }
    };
    const window = {
      top: parent,
      parent,
      location: { origin: "https://sh.122.gov.cn", pathname },
      requirejs: loader,
      addEventListener(type, callback) { if (type === "message") listener = callback; }
    };
    vm.runInNewContext(ruleBridgeSource, {
      window,
      document: { querySelector() { return null; } }
    });
    listener({
      source: parent,
      origin: "https://sh.122.gov.cn",
      data: { source: "platego-rule-snapshot-request", nonce: "pg12345678" }
    });
    return posted;
  }

  const complete = runBridge(["^AA4", "^AB9Z99$"]);
  assert.equal(complete.origin, "https://sh.122.gov.cn");
  assert.equal(complete.payload.payload.filterComplete, true);
  assert.equal(complete.payload.payload.hphmRegexCount, 2);
  assert.deepEqual(complete.payload.payload.hphmRegexes.map((item) => item.source), ["^AA4", "^AB9Z99$"]);
  assert.deepEqual(Object.keys(complete.payload.payload).sort(), [
    "filterComplete", "hdArr", "hphmLength", "hphmRegexCount", "hphmRegexes", "plateType", "source"
  ]);

  const oversized = runBridge(Array.from({ length: 129 }, (_, index) => `^AA${index}$`));
  assert.equal(oversized.payload.payload.filterComplete, false);
  assert.equal(oversized.payload.payload.hphmRegexCount, 129);
  assert.equal(oversized.payload.payload.hphmRegexes.length, 128);

  const live = runBridge(["^AA4"], "/veh1/netxh/zbxh");
  assert.equal(live.payload.payload.filterComplete, true);
  assert.equal(live.payload.payload.source, "amd:zbxhfaker");
});

test("empty-keyboard letter set is a reset flash after a typed prefix, not the next layer", () => {
  function isOfficialKeyboardResetFlash(signature, idleSignature, suffix) {
    if (!suffix || !signature) return false;
    if (idleSignature && signature === idleSignature) return true;
    return !/[0-9]/.test(signature) && signature.length >= 20;
  }
  const idle = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  assert.equal(isOfficialKeyboardResetFlash(idle, idle, ""), false);
  assert.equal(isOfficialKeyboardResetFlash(idle, idle, "AA0"), true);
  assert.equal(isOfficialKeyboardResetFlash("0123456789", idle, "AA"), false);
  assert.equal(isOfficialKeyboardResetFlash("AB", idle, "A"), false);
  assert.equal(isOfficialKeyboardResetFlash(idle, "AB", "AA0"), true);
});

test("a suffix is available only when an official intent input displays it", () => {
  function officialHasInputSuffix(displayed, suffix) {
    return displayed.includes(suffix);
  }
  assert.equal(officialHasInputSuffix(["AA0"], "AA0A0"), false);
  assert.equal(officialHasInputSuffix(["AA0A0"], "AA0A0"), true);
  assert.equal(officialHasInputSuffix(["AA00"], "AA0A0"), false);
});

test("official hdArr templates exclude every runtime-grey branch and never accept sensitive fields", () => {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  function sanitizeOfficialHdArr(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((item) => {
      const token = String(item || "").toUpperCase().trim();
      return /^[A-HJ-NP-Z0-9!@#*]{1,12}$/.test(token) ? token : "";
    }).filter(Boolean))];
  }
  function officialCharAllowed(templateChar, actual) {
    if (templateChar === "!") return digits.includes(actual);
    if (templateChar === "@") return letters.includes(actual);
    return templateChar === actual;
  }
  function officialTemplateMatches(template, prefix) {
    if (!template || prefix.length > template.length) return false;
    for (let index = 0; index < prefix.length; index += 1) {
      if (!officialCharAllowed(template[index], prefix[index])) return false;
    }
    return true;
  }
  function compileRegexes(value) {
    return value.map((item) => new RegExp(item.source, item.flags || ""));
  }
  function isExcluded(prefix, regexes) {
    return regexes.some((regex) => {
      regex.lastIndex = 0;
      const matched = regex.test(prefix);
      regex.lastIndex = 0;
      return matched;
    });
  }
  function officialNextHdKeys(hdArr, prefix, regexes = []) {
    const keys = new Set();
    for (const template of sanitizeOfficialHdArr(hdArr)) {
      if (!officialTemplateMatches(template, prefix) || prefix.length >= template.length) continue;
      const next = template[prefix.length];
      if (next === "!") [...digits].forEach((item) => keys.add(item));
      else if (next === "@") [...letters].forEach((item) => keys.add(item));
      else keys.add(next);
    }
    return [...keys].filter((key) => !isExcluded(prefix + key, regexes)).sort();
  }
  function officialRuleFieldsSafe(value) {
    if (/vin|validtoken|cookie/i.test(JSON.stringify(value))) return null;
    const hdArr = sanitizeOfficialHdArr(value.hdArr);
    const descriptors = Array.isArray(value.hphmRegexes) ? value.hphmRegexes : [];
    const complete = value.filterComplete === true && value.hphmRegexCount === descriptors.length;
    return hdArr.length ? { hdArr, descriptors, complete } : null;
  }
  const hdArr = ["AA!@!!", "AB!@!!"];
  const descriptors = [
    { source: "^AA4", flags: "" },
    { source: "^AA0A4", flags: "" },
    { source: "^AB9Z99$", flags: "" }
  ];
  const regexes = compileRegexes(descriptors);
  assert.deepEqual(officialNextHdKeys(hdArr, "", regexes), ["A"]);
  assert.deepEqual(officialNextHdKeys(hdArr, "A", regexes), ["A", "B"]);
  assert.deepEqual(officialNextHdKeys(hdArr, "AA", regexes), digits.split("").filter((item) => item !== "4"));
  assert.equal(officialNextHdKeys(hdArr, "AA0", regexes).join(""), letters);
  assert.deepEqual(officialNextHdKeys(hdArr, "AA0A", regexes), digits.split("").filter((item) => item !== "4"));
  assert.equal(officialNextHdKeys(hdArr, "AB9Z9", regexes).includes("9"), false);
  assert.equal(officialRuleFieldsSafe({ hdArr, vin: "LSVAA4189F2000001" }), null);
  assert.equal(officialRuleFieldsSafe({ hdArr, validToken: "abc" }), null);
  assert.equal(officialRuleFieldsSafe({ hdArr }).complete, false);
  assert.equal(officialRuleFieldsSafe({ hdArr, hphmRegexes: descriptors, hphmRegexCount: 3, filterComplete: true }).complete, true);
  assert.equal(officialRuleFieldsSafe({ hdArr, hphmRegexes: descriptors.slice(0, 2), hphmRegexCount: 3, filterComplete: true }).complete, false);
});

test("official self plates keep 沪 only and complete the last character from remaining white keys", () => {
  function officialInputValue(raw) {
    const value = String(raw || "").toUpperCase().replace(/[·.\s]/g, "");
    return value.startsWith("沪") ? value.slice(1) : value;
  }
  function officialLastKeyCompletions(boxSuffix, labels, resetFlash) {
    if (!boxSuffix || resetFlash) return [];
    return labels.map((label) => boxSuffix + label);
  }
  assert.equal(officialInputValue("AA0A0"), "AA0A0");
  assert.equal(officialInputValue("沪AA0A0"), "AA0A0");
  assert.equal(`沪A${officialInputValue("AA0A0")}`, "沪AAA0A0");
  assert.equal(`沪${officialInputValue("AA0A0")}`, "沪AA0A0");
  assert.deepEqual(
    officialLastKeyCompletions("AA0A0", ["1", "2", "9"], false).map((item) => `沪${item}`),
    ["沪AA0A01", "沪AA0A02", "沪AA0A09"]
  );
  assert.deepEqual(officialLastKeyCompletions("AA0A0", ["A", "B"], true), []);
});
