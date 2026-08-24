(() => {
  "use strict";

  if (window.__PLATEGO_ASSISTANT_V1__) return;
  window.__PLATEGO_ASSISTANT_V1__ = true;

  const ADAPTER_VERSION = "shanghai-dom-v1-local-fixture";
  const MAX_SCAN_NODES = 3000;
  const DEFAULT_API_BASE = "http://127.0.0.1:8789";
  const LOCAL_FIXTURE_HOSTS = new Set(["127.0.0.1", "localhost"]);
  const KNOWN_GATES = new Set([
    "LOGIN_REQUIRED",
    "BASIC_INFO_REQUIRED",
    "IDENTITY_VERIFICATION_REQUIRED",
    "SELECTION_READY"
  ]);
  const DEFAULT_CONFIG = {
    schemaVersion: 1,
    simDataVersion: "extension-fallback",
    regionCode: "310000",
    plateType: "small_blue",
    rules: [
      { id: "rule-avoid-4", label: "避开数字 4", kind: "avoid", target: "4", weight: 28, enabled: true },
      { id: "rule-repeat", label: "偏好重复数字", kind: "repeat", target: "", weight: 14, enabled: true },
      { id: "rule-sequence", label: "偏好连续数字", kind: "sequence", target: "", weight: 10, enabled: true }
    ],
    favorites: [],
    orderedCandidates: [],
    exportedAt: new Date(0).toISOString()
  };

  const host = document.createElement("div");
  host.id = "platego-extension-host";
  host.setAttribute("role", "complementary");
  host.setAttribute("aria-label", "PlateGo 页面助手");
  const shadow = host.attachShadow({ mode: "open" });
  document.documentElement.appendChild(host);

  const state = {
    visible: true,
    scanning: false,
    scanVisited: 0,
    scanReason: "尚未采集",
    graph: null,
    terminals: [],
    coverage: "unknown",
    observation: null,
    uploadedHash: "",
    uploadBusy: false,
    diff: null,
    diffApplied: false,
    message: "",
    messageTone: "neutral",
    groupIndex: 0,
    config: structuredClone(DEFAULT_CONFIG),
    apiBase: DEFAULT_API_BASE
  };

  const styles = `
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer}.shell{width:370px;max-height:calc(100vh - 118px);overflow:auto;color:#1b2722;background:#fffefb;border:1px solid rgba(18,65,47,.2);border-radius:16px;box-shadow:0 18px 55px rgba(9,35,25,.22);font-size:12px}.head{position:sticky;top:0;z-index:3;height:58px;padding:0 14px;display:flex;align-items:center;gap:9px;color:white;background:#124f3c;border-radius:15px 15px 0 0}.mark{width:31px;height:31px;display:grid;place-items:center;border-radius:9px;color:#124f3c;background:#c9f27b;font-weight:800}.brand{display:grid;line-height:1.2}.brand b{font-size:14px}.brand small{color:rgba(255,255,255,.68);font-size:8px;letter-spacing:.7px}.close{margin-left:auto;width:29px;height:29px;border:0;border-radius:8px;color:white;background:rgba(255,255,255,.12);font-size:16px}.body{padding:13px}.status{display:flex;align-items:flex-start;gap:9px;padding:11px;border-radius:10px;background:#eff5ec}.status i{flex:none;width:8px;height:8px;margin-top:3px;border-radius:50%;background:#4ea476;box-shadow:0 0 0 4px rgba(78,164,118,.12)}.status.warn{background:#fff5e7}.status.warn i{background:#cf8a2d}.status.fail{background:#fbeeee}.status.fail i{background:#bd5c5c}.status div{display:grid;gap:2px}.status strong{font-size:11px}.status span{color:#68736d;font-size:9px;line-height:1.45}.safety{margin:10px 0;padding:8px 10px;border-left:3px solid #8db17b;background:#f4f7f1;color:#66716b;font-size:9px;line-height:1.5}.section{margin-top:11px;padding-top:11px;border-top:1px solid #e5e9e5}.title{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.title strong{font-size:11px}.tag{padding:3px 6px;border-radius:5px;color:#145c45;background:#eaf4e7;font-size:8px}.buttons{display:flex;flex-wrap:wrap;gap:6px}.buttons.spaced{margin-top:8px}.buttons button{min-height:33px;padding:0 10px;border:1px solid #d6dfd8;border-radius:8px;color:#145c45;background:white;font-weight:600;font-size:9px}.buttons button.primary{border-color:#145c45;color:white;background:#145c45}.buttons button:disabled{opacity:.4;cursor:not-allowed}.numbers{display:grid;grid-template-columns:1fr 1fr;gap:5px}.number{padding:7px 8px;border-radius:7px;background:#f1f4f0;display:flex;align-items:center;justify-content:space-between}.number b{letter-spacing:.6px}.number span{color:#59816e;font-size:8px}.progress{width:100%;height:6px;margin:7px 0;border:0;border-radius:8px;overflow:hidden;background:#e4e9e5}.progress::-webkit-progress-bar{background:#e4e9e5}.progress::-webkit-progress-value{background:#56a476;transition:width .2s}.scan-copy{color:#718079;font-size:9px;line-height:1.45}.diff{display:grid;grid-template-columns:1fr 1fr;gap:6px}.diff>div{min-height:70px;padding:8px;border-radius:8px;background:#f4f6f3}.diff strong{display:block;margin-bottom:5px;font-size:9px}.diff span{display:inline-block;margin:2px;padding:3px 4px;border-radius:4px;background:white;font-size:8px}.diff em{color:#98a09b;font-size:8px}.diff .remove strong{color:#a64b4b}.diff .add strong{color:#2e669e}.message{margin-top:8px;padding:8px;border-radius:8px;color:#626d67;background:#f1f3f1;font-size:9px;line-height:1.5}.message.success{color:#145c45;background:#eaf5e9}.message.error{color:#a14848;background:#fbecec}.config-warning{margin-top:8px;padding:8px;border-radius:8px;color:#8a5d24;background:#fff4e3;font-size:9px;line-height:1.5}.privacy{margin-top:10px;color:#87908b;font-size:8px;line-height:1.5}.empty{padding:10px;text-align:center;color:#8a938e;background:#f5f6f4;border-radius:8px;font-size:9px}@media(max-width:520px){.shell{width:calc(100vw - 20px)}}
  `;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  shadow.adoptedStyleSheets = [sheet];
  const mount = document.createElement("div");
  shadow.appendChild(mount);

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[character]));
  }

  function storageGet(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (items) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(items);
      });
    });
  }

  function storageSet(items) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(items, () => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve();
      });
    });
  }

  function runtimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) reject(new Error(error.message));
        else resolve(response);
      });
    });
  }

  function normalizeConfig(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.rules)
      || !Array.isArray(value.favorites) || !Array.isArray(value.orderedCandidates)) {
      return structuredClone(DEFAULT_CONFIG);
    }
    return value;
  }

  function isLocalFixtureLocation() {
    return location.protocol === "http:"
      && LOCAL_FIXTURE_HOSTS.has(location.hostname)
      && location.port === "4173"
      && /^\/official-mock(?:\/|$)/.test(location.pathname);
  }

  function isOfficialShanghaiLocation() {
    return location.protocol === "https:" && location.hostname === "sh.122.gov.cn";
  }

  function emptyPage(kind, detail) {
    return {
      kind,
      detail,
      officialHost: kind === "official-unverified",
      fixtureVerified: false,
      gate: "UNKNOWN",
      mode: "unknown",
      candidateInputs: [],
      keyboardKeys: [],
      randomNumbers: [],
      automationReady: false,
      prefix: "沪A",
      targetLength: 0,
      regionCode: "310000",
      plateType: "small_blue"
    };
  }

  function pageState() {
    if (isOfficialShanghaiLocation()) {
      return emptyPage("official-unverified", "真实页面 DOM 尚未完成现场验收");
    }
    if (!isLocalFixtureLocation()) {
      return emptyPage("unsupported", "当前页面不在上海适配范围");
    }

    const root = document.querySelector("[data-platego-adapter-root='shanghai-v1']");
    const declaredMock = document.documentElement.dataset.plategoOfficialMock === "shanghai";
    if (!(root instanceof HTMLElement) || !declaredMock) {
      return emptyPage("fixture-pending", "本地样机契约尚未就绪");
    }

    const regionCode = root.dataset.plategoRegionCode || "";
    const plateType = root.dataset.plategoPlateType || "";
    const prefix = (root.dataset.plategoPrefix || "").toUpperCase();
    const targetLength = Number(root.dataset.plategoTargetLength || 0);
    const metadataValid = regionCode === "310000"
      && (plateType === "small_blue" || plateType === "small_nev")
      && /^沪[A-Z]$/.test(prefix)
      && targetLength === (plateType === "small_nev" ? 6 : 5);
    if (!metadataValid) {
      return emptyPage("fixture-invalid", "本地样机元数据与上海 v1 契约不匹配");
    }

    const declaredGate = document.documentElement.dataset.plategoEntryGate || "UNKNOWN";
    const gate = KNOWN_GATES.has(declaredGate) ? declaredGate : "UNKNOWN";
    const declaredMode = document.documentElement.dataset.plategoSelectionMode || "unknown";
    const mode = ["entry", "random", "self"].includes(declaredMode) ? declaredMode : "unknown";
    const candidateInputs = [...root.querySelectorAll("input[data-platego-candidate-input]")]
      .filter((element) => element instanceof HTMLInputElement)
      .sort((left, right) => Number(left.dataset.plategoCandidateInput) - Number(right.dataset.plategoCandidateInput));
    const keyboard = root.querySelector("[data-platego-keyboard]");
    const keyboardKeys = keyboard
      ? [...keyboard.querySelectorAll("button[data-platego-key]")].filter((element) => element instanceof HTMLButtonElement)
      : [];
    const inputContractValid = candidateInputs.length === 5
      && candidateInputs.every((input) => Number(input.maxLength) === targetLength);
    const keyboardContractValid = keyboardKeys.length > 0
      && keyboardKeys.every((button) => /^[A-HJ-NP-Z0-9]$/.test((button.dataset.plategoKey || "").toUpperCase()));

    const page = {
      kind: "official-mock",
      detail: "上海本地脱敏样机",
      officialHost: false,
      fixtureVerified: true,
      gate,
      mode,
      candidateInputs,
      keyboardKeys,
      randomNumbers: [],
      automationReady: gate === "SELECTION_READY" && mode === "self" && inputContractValid && keyboardContractValid,
      prefix,
      targetLength,
      regionCode,
      plateType
    };
    page.randomNumbers = mode === "random" ? readRandomNumbers(root, page) : [];
    return page;
  }

  function readRandomNumbers(root, page) {
    const suffixLength = page.targetLength;
    const values = [...root.querySelectorAll("[data-platego-random-number]")]
      .map((element) => String(element.dataset.plategoRandomNumber || element.textContent || "").replace(/\s/g, "").toUpperCase())
      .filter((value) => value.startsWith(page.prefix))
      .filter((value) => new RegExp(`^[沪][A-Z][A-HJ-NP-Z0-9]{${suffixLength}}$`).test(value));
    return [...new Set(values)].slice(0, 30);
  }

  function hasSequence(value) {
    const digits = value.replace(/\D/g, "");
    for (let index = 0; index <= digits.length - 3; index += 1) {
      const triplet = digits.slice(index, index + 3).split("").map(Number);
      if ((triplet[1] === triplet[0] + 1 && triplet[2] === triplet[1] + 1)
        || (triplet[1] === triplet[0] - 1 && triplet[2] === triplet[1] - 1)) return true;
    }
    return false;
  }

  function score(value) {
    const normalized = String(value).toUpperCase();
    let result = 50;
    for (const rule of state.config.rules || []) {
      if (!rule?.enabled) continue;
      const target = String(rule.target || "").toUpperCase();
      let matched = false;
      if (rule.kind === "contains" && target) matched = normalized.includes(target);
      if (rule.kind === "prefix" && target) matched = normalized.startsWith(target);
      if (rule.kind === "suffix" && target) matched = normalized.endsWith(target);
      if (rule.kind === "repeat") matched = /(.)\1/.test(normalized);
      if (rule.kind === "sequence") matched = hasSequence(normalized);
      if (rule.kind === "avoid" && target && normalized.includes(target)) {
        result -= Math.abs(Number(rule.weight) || 0);
        continue;
      }
      if (matched) result += Number(rule.weight) || 0;
    }
    const suffix = normalized.slice(-4);
    if (/^(.)\1{3}$/.test(suffix)) result += 32;
    else if (/(.)\1{2}/.test(normalized)) result += 18;
    if (/([0-9])\1.*([0-9])\2/.test(normalized)) result += 8;
    return Math.max(0, Math.min(100, result));
  }

  function isConfigCompatible(page) {
    return state.config.regionCode === page.regionCode && state.config.plateType === page.plateType;
  }

  function relevantCandidates(page) {
    const suffixPattern = new RegExp(`^[A-HJ-NP-Z0-9]{${page.targetLength}}$`);
    return (state.config.orderedCandidates || []).filter((item) => {
      const value = String(item?.value || "").toUpperCase();
      return value.startsWith(page.prefix) && suffixPattern.test(value.slice(page.prefix.length));
    });
  }

  function statusCopy(page) {
    if (page.kind === "official-unverified") {
      return ["fail", "上海官方域名已识别，真实适配保持关闭", "未经过现场 DOM 验收：不读取号码、不写入输入框、不采集、不上传。"]; 
    }
    if (page.kind === "official-mock") {
      if (page.gate !== "SELECTION_READY") return ["warn", "等待用户完成入口步骤", page.gate];
      if (page.mode === "random") return ["ready", "随机选号样机已就绪", `只读读取 ${page.randomNumbers.length} 个号码并本地评分；页面按钮仍由用户点击。`];
      if (page.automationReady) return ["ready", "自编键盘样机契约已通过", "允许一次启动后自动填入与退格遍历；验证与提交始终禁用。"]; 
      if (page.mode === "self") return ["fail", "自编键盘契约不完整", "输入框数量、长度或键盘标记不符合上海样机 v1，已安全停止。"]; 
      return ["warn", "选号环境已就绪", "请由用户在样机中选择随机选号或自编选号。"]; 
    }
    if (page.kind === "fixture-pending") return ["warn", "等待本地样机就绪", page.detail];
    if (page.kind === "fixture-invalid") return ["fail", "本地样机契约不匹配", page.detail];
    return ["fail", "不支持当前页面", "完整插件工作台仍可单独运行。"]; 
  }

  function list(values) {
    return values.length
      ? values.slice(0, 10).map((value) => `<span>${escapeHtml(value)}</span>`).join("")
      : "<em>无</em>";
  }

  function render() {
    const page = pageState();
    const [tone, title, detail] = statusCopy(page);
    const scored = page.randomNumbers
      .map((value) => ({ value, score: score(value) }))
      .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value));
    const progress = state.scanning
      ? Math.min(99, Math.round((state.scanVisited / MAX_SCAN_NODES) * 100))
      : state.graph ? 100 : 0;
    const configCompatible = isConfigCompatible(page);
    const candidates = page.fixtureVerified ? relevantCandidates(page) : [];
    const groupSize = Math.max(1, page.candidateInputs.length || 5);
    const groupCount = Math.max(1, Math.ceil(candidates.length / groupSize));
    const safeGroupIndex = Math.min(state.groupIndex, groupCount - 1);
    const uploadComplete = Boolean(state.observation && state.uploadedHash === state.observation.observationHash);

    mount.innerHTML = `<div class="shell">
      <div class="head"><span class="mark">P</span><span class="brand"><b>PlateGo 助手</b><small>SHANGHAI · FAIL-CLOSED</small></span><button type="button" class="close" data-action="hide" title="隐藏" aria-label="隐藏页面助手">×</button></div>
      <div class="body">
        <div class="status ${tone}" aria-live="polite"><i></i><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div></div>
        <div class="safety">自动动作仅限本地样机中的输入框填入与退格。内容脚本没有点击页面验证、提交或任一选号按钮的路径。</div>
        <div class="buttons"><button type="button" data-action="refresh">重新读取页面</button>${page.mode === "self" ? `<button type="button" class="primary" data-action="scan" ${page.automationReady && !state.scanning ? "" : "disabled"}>${state.scanning ? "采集中…" : "开始完整采集"}</button>` : ""}</div>

        ${scored.length ? `<div class="section"><div class="title"><strong>当前随机号码</strong><span class="tag">只读评分</span></div><div class="numbers">${scored.slice(0, 10).map((item) => `<div class="number"><b>${escapeHtml(item.value)}</b><span>${item.score}</span></div>`).join("")}</div></div>` : ""}

        ${(state.scanning || state.graph) ? `<div class="section"><div class="title"><strong>自编键盘采集</strong><span class="tag">${escapeHtml(state.coverage)}</span></div><progress class="progress" max="100" value="${progress}" aria-label="采集进度"></progress><div class="scan-copy">已遍历 ${state.scanVisited} 个前缀 · 收集 ${state.terminals.length} 个完整组合<br>${escapeHtml(state.scanReason)}</div></div>` : ""}

        ${state.diff ? `<div class="section"><div class="title"><strong>候选池变化</strong><span class="tag">${state.diffApplied ? "已确认" : "等待确认"}</span></div><div class="diff"><div><strong>保留 ${state.diff.retained.length}</strong>${list(state.diff.retained)}</div><div class="remove"><strong>移除 ${state.diff.invalid.length}</strong>${list(state.diff.invalid)}</div><div><strong>未知 ${state.diff.unknown.length}</strong>${list(state.diff.unknown)}</div><div class="add"><strong>新增 ${state.diff.added.length}</strong>${list(state.diff.added)}</div></div>${!configCompatible ? `<div class="config-warning">插件工作台当前选择的地区或号牌类型与页面不一致；候选更新和分组填入保持禁用，公共模拟观察仍可单独确认上传。</div>` : ""}<div class="buttons spaced"><button type="button" data-action="apply-diff" ${configCompatible && !state.diffApplied ? "" : "disabled"}>${state.diffApplied ? "已更新到插件本机" : "确认更新到插件本机"}</button><button type="button" class="primary" data-action="upload" ${state.observation && !state.uploadBusy && !uploadComplete ? "" : "disabled"}>${state.uploadBusy ? "上传中…" : uploadComplete ? "公共观察已上传" : "确认上传公共模拟观察"}</button></div></div>` : ""}

        ${page.mode === "self" && page.candidateInputs.length ? `<div class="section"><div class="title"><strong>候选分组填入</strong><span class="tag">第 ${safeGroupIndex + 1} / ${groupCount} 组</span></div><div class="buttons"><button type="button" data-action="previous-group" ${safeGroupIndex === 0 ? "disabled" : ""}>上一组</button><button type="button" class="primary" data-action="fill-group" ${configCompatible && candidates.length && !state.scanning ? "" : "disabled"}>填入本组（不验证）</button><button type="button" data-action="next-group" ${safeGroupIndex >= groupCount - 1 ? "disabled" : ""}>下一组</button></div></div>` : ""}

        ${state.message ? `<div class="message ${state.messageTone}" aria-live="polite">${escapeHtml(state.message)}</div>` : ""}
        <div class="privacy">公共观察严格分流：本地 official-mock 只能上传 simulation；真实 sh.122.gov.cn 适配未验收，live 上传硬关闭。不会上传候选、收藏、规则、最终号码、身份资料、Cookie 或完整页面。</div>
      </div>
    </div>`;
  }

  function nativeSetValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function settle() {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  async function writeProbe(input, value) {
    nativeSetValue(input, value);
    await settle();
  }

  function enabledKeys(page) {
    return [...new Set(page.keyboardKeys
      .filter((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true")
      .map((button) => String(button.dataset.plategoKey || "").trim().toUpperCase())
      .filter((key) => /^[A-HJ-NP-Z0-9]$/.test(key)))]
      .sort();
  }

  async function scanKeyboard() {
    if (state.scanning) return;
    const initialPage = pageState();
    if (!initialPage.automationReady) {
      setMessage("页面结构没有通过当前本地样机适配契约，采集已安全停止。", "error");
      return;
    }

    const input = initialPage.candidateInputs[0];
    const originalValue = input.value;
    const seen = new Set();
    const transitions = {};
    const terminals = [];
    let hitLimit = false;
    let interrupted = false;
    let failure = "";
    state.scanning = true;
    state.scanVisited = 0;
    state.scanReason = "自动填写一个前缀、读取可用键，再退格返回父前缀";
    state.graph = null;
    state.terminals = [];
    state.coverage = "unknown";
    state.observation = null;
    state.uploadedHash = "";
    state.diff = null;
    state.diffApplied = false;
    state.message = "采集只操作第一个样机输入框，并会在结束后恢复原值；不会触发任何页面按钮。";
    state.messageTone = "neutral";
    render();

    const visit = async (prefix, alreadyWritten = false) => {
      if (seen.size >= MAX_SCAN_NODES) {
        hitLimit = true;
        return;
      }
      const currentPage = pageState();
      if (!input.isConnected || !currentPage.automationReady || currentPage.candidateInputs[0] !== input) {
        interrupted = true;
        return;
      }
      if (seen.has(prefix)) return;
      if (!alreadyWritten) await writeProbe(input, prefix);
      seen.add(prefix);
      state.scanVisited = seen.size;
      if (prefix.length === initialPage.targetLength) {
        terminals.push(prefix);
        return;
      }

      const next = enabledKeys(pageState());
      transitions[prefix] = next;
      for (const key of next) {
        if (hitLimit || interrupted) break;
        await writeProbe(input, prefix + key);
        await visit(prefix + key, true);
        if (input.isConnected) await writeProbe(input, prefix);
      }
      if (seen.size % 30 === 0) render();
    };

    try {
      await visit("");
    } catch (error) {
      failure = error instanceof Error ? error.message : "采集异常";
    } finally {
      if (input.isConnected) {
        try { await writeProbe(input, originalValue); } catch { /* best-effort fixture restoration */ }
      }
    }

    state.scanning = false;
    state.graph = transitions;
    state.terminals = [...new Set(terminals)].sort();
    if (!failure && !hitLimit && !interrupted && state.terminals.length > 0) {
      state.coverage = "complete";
      state.scanReason = "全部可达前缀已遍历，原输入值已恢复";
    } else if (state.terminals.length > 0) {
      state.coverage = "partial";
      state.scanReason = failure || (hitLimit ? `达到 ${MAX_SCAN_NODES} 个前缀上限` : "页面状态在采集中发生变化");
    } else {
      state.coverage = "unknown";
      state.scanReason = failure || (interrupted ? "页面状态在采集中发生变化" : "未形成可确认的完整组合");
    }
    buildDiff(initialPage);
    if (Object.keys(transitions).length > 0) state.observation = createObservation(initialPage);
    state.message = state.coverage === "complete"
      ? "完整采集完成。候选本机更新与公共模拟观察上传需要分别由你确认。"
      : "采集未达到完整覆盖；未观察到的旧候选只标记为 unknown，不会移除。";
    state.messageTone = state.coverage === "complete" ? "success" : failure ? "error" : "neutral";
    render();
  }

  function buildDiff(page) {
    const previous = [...new Set(relevantCandidates(page).map((item) => String(item.value).toUpperCase()))];
    const observed = state.terminals.map((suffix) => `${page.prefix}${suffix}`);
    const observedSet = new Set(observed);
    const retained = previous.filter((value) => observedSet.has(value));
    const missing = previous.filter((value) => !observedSet.has(value));
    const ranked = [...observed].sort((left, right) => score(right) - score(left) || left.localeCompare(right));
    state.diff = {
      retained,
      invalid: state.coverage === "complete" ? missing : [],
      unknown: state.coverage === "complete" ? [] : missing,
      added: ranked.filter((value) => !previous.includes(value)).slice(0, 15)
    };
  }

  async function applyDiff() {
    const page = pageState();
    if (!state.diff || state.diffApplied || !page.fixtureVerified || !isConfigCompatible(page)) {
      setMessage("候选更新条件不满足；请确认样机契约以及工作台地区和号牌类型。", "error");
      return;
    }
    const invalid = new Set(state.diff.invalid.map((value) => value.toUpperCase()));
    const retainedEntries = (state.config.orderedCandidates || []).filter((item) => !invalid.has(String(item.value).toUpperCase()));
    const existing = new Set(retainedEntries.map((item) => String(item.value).toUpperCase()));
    const now = new Date().toISOString();
    const additions = state.diff.added
      .filter((value) => !existing.has(value.toUpperCase()))
      .map((value, index) => ({
        id: `capture-${Date.now().toString(36)}-${index}`,
        value,
        source: "capture",
        score: score(value),
        createdAt: now
      }));
    const nextConfig = {
      ...state.config,
      orderedCandidates: [...retainedEntries, ...additions],
      exportedAt: now
    };
    try {
      await storageSet({ platego_config: nextConfig, platego_config_updated_at: now });
      state.config = nextConfig;
      state.diffApplied = true;
      state.message = `候选池已在插件本机更新：保留 ${state.diff.retained.length}、移除 ${state.diff.invalid.length}、新增 ${additions.length}。`;
      state.messageTone = "success";
    } catch (error) {
      state.message = `本机更新失败：${error instanceof Error ? error.message : "未知错误"}`;
      state.messageTone = "error";
    }
    render();
  }

  function stable(value) {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]));
    }
    return value;
  }

  function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function createObservation(page) {
    const core = {
      namespace: "simulation",
      regionCode: page.regionCode,
      plateType: page.plateType,
      prefix: page.prefix,
      transitions: state.graph,
      terminals: state.terminals,
      coverage: state.coverage,
      observedAt: new Date().toISOString(),
      adapterVersion: ADAPTER_VERSION,
      source: "official-mock"
    };
    return { ...core, observationHash: fnv1a(JSON.stringify(stable(core))) };
  }

  async function uploadObservation() {
    const page = pageState();
    if (state.uploadBusy || !state.observation || !page.fixtureVerified) return;
    state.uploadBusy = true;
    state.message = "正在通过插件后台上传严格筛选后的公共模拟观察…";
    state.messageTone = "neutral";
    render();
    try {
      const response = await runtimeMessage({
        type: "PLATEGO_UPLOAD_PUBLIC_OBSERVATION",
        apiBase: state.apiBase,
        observation: state.observation
      });
      if (!response?.ok) throw new Error(response?.error || "上传失败");
      state.uploadedHash = state.observation.observationHash;
      state.message = `公共模拟观察已上传${response.deduplicated ? "（后端已去重）" : ""}。候选、收藏、偏好、输入结果和页面内容均未上传。`;
      state.messageTone = "success";
    } catch (error) {
      state.message = `上传失败（${error instanceof Error ? error.message : "未知错误"}）。采集结果仍保留在当前页面内。`;
      state.messageTone = "error";
    } finally {
      state.uploadBusy = false;
      render();
    }
  }

  async function fillGroup() {
    const page = pageState();
    if (!page.automationReady || !isConfigCompatible(page) || state.scanning) {
      setMessage("当前页面或插件配置没有通过本地填入门，操作已安全停止。", "error");
      return;
    }
    const candidates = relevantCandidates(page);
    const groupSize = page.candidateInputs.length;
    const groupCount = Math.max(1, Math.ceil(candidates.length / groupSize));
    state.groupIndex = Math.min(state.groupIndex, groupCount - 1);
    const group = candidates.slice(state.groupIndex * groupSize, state.groupIndex * groupSize + groupSize);
    if (!group.length) {
      setMessage("插件候选池为空，请先在完整工作台筛选或导入当前上海号牌类型的配置。", "error");
      return;
    }
    for (let index = 0; index < page.candidateInputs.length; index += 1) {
      const full = String(group[index]?.value || "").toUpperCase();
      const suffix = full.startsWith(page.prefix) ? full.slice(page.prefix.length) : "";
      if (!page.candidateInputs[index].isConnected) {
        setMessage("样机输入框在填入过程中发生变化，已安全停止。", "error");
        return;
      }
      await writeProbe(page.candidateInputs[index], suffix);
    }
    state.message = `已填入第 ${state.groupIndex + 1} 组 ${group.length} 个候选。请由你亲自点击页面“验证本组”；插件不会继续操作。`;
    state.messageTone = "success";
    render();
  }

  function setMessage(message, tone) {
    state.message = message;
    state.messageTone = tone;
    render();
  }

  shadow.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("button[data-action]");
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    const action = button.dataset.action;
    if (action === "hide") {
      state.visible = false;
      host.hidden = true;
    } else if (action === "refresh") {
      render();
    } else if (action === "scan") {
      void scanKeyboard();
    } else if (action === "apply-diff") {
      void applyDiff();
    } else if (action === "upload") {
      void uploadObservation();
    } else if (action === "fill-group") {
      void fillGroup();
    } else if (action === "previous-group") {
      state.groupIndex = Math.max(0, state.groupIndex - 1);
      render();
    } else if (action === "next-group") {
      state.groupIndex += 1;
      render();
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PLATEGO_TOGGLE_ASSISTANT") {
      state.visible = !state.visible;
      host.hidden = !state.visible;
      if (state.visible) render();
      sendResponse({ visible: state.visible });
      return undefined;
    }
    if (message?.type === "PLATEGO_GET_PAGE_STATUS") {
      const page = pageState();
      sendResponse({
        kind: page.kind,
        fixtureVerified: page.fixtureVerified,
        gate: page.gate,
        mode: page.mode,
        automationReady: page.automationReady,
        randomCount: page.randomNumbers.length,
        adapterVersion: ADAPTER_VERSION,
        realAdapterApproved: false
      });
    }
    return undefined;
  });

  let refreshTimer;
  const observer = new MutationObserver(() => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      if (state.visible && !state.scanning) render();
    }, 140);
  });
  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: [
      "data-platego-entry-gate", "data-platego-selection-mode", "data-platego-official-mock",
      "data-platego-adapter-root", "disabled"
    ]
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.platego_config?.newValue) state.config = normalizeConfig(changes.platego_config.newValue);
    if (typeof changes.platego_api_base?.newValue === "string") state.apiBase = changes.platego_api_base.newValue;
    if (state.visible && !state.scanning) render();
  });

  storageGet(["platego_config", "platego_api_base"]).then((stored) => {
    state.config = normalizeConfig(stored.platego_config);
    state.apiBase = typeof stored.platego_api_base === "string" ? stored.platego_api_base : DEFAULT_API_BASE;
    render();
  }).catch((error) => {
    state.message = `读取插件本机配置失败：${error.message}`;
    state.messageTone = "error";
    render();
  });
  render();
})();
