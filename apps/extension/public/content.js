(() => {
  "use strict";

  if (window.__PLATEGO_ASSISTANT_V1__) return;
  window.__PLATEGO_ASSISTANT_V1__ = true;

  const ADAPTER_VERSION = "shanghai-dom-v1-local-fixture";
  const MAX_MOCK_SCAN_NODES = 3000;
  const MAX_OFFICIAL_SCAN_NODES = 50000;
  const DEFAULT_API_BASE = "http://127.0.0.1:8789";
  const LOCAL_FIXTURE_HOSTS = new Set(["127.0.0.1", "localhost"]);
  const KNOWN_GATES = new Set([
    "LOGIN_REQUIRED",
    "BASIC_INFO_REQUIRED",
    "IDENTITY_VERIFICATION_REQUIRED",
    "SELECTION_READY"
  ]);
  const LEGACY_LUCKY_NUMBER_PATTERNS = ["168", "518", "520", "1314", "668", "688", "886", "868", "988", "898", "689"];
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
    highlightPrefs: { pair: true, pairDigits: "", sequence: true, many: true, sequenceTargets: "", manyDigits: "" },
    composePrefs: { combinations: [], segments: [] },
    exportedAt: new Date(0).toISOString()
  };
  const DEFAULT_NUMBER_TIPS = { pair: true, pairDigits: "", sequence: true, many: true, sequenceTargets: "", manyDigits: "" };
  const DEFAULT_COMPOSE_PREFS = { combinations: [], segments: [] };
  const DEFAULT_SELF_ENTRY_QUEUE = {
    schemaVersion: 1,
    regionCode: "310000",
    plateType: "",
    prefix: "",
    manualValues: [],
    consumedValues: [],
    lastConsumedValues: [],
    updatedAt: ""
  };
  const SUGGESTED_COMPOSE_COMBINATIONS = ["1024", "2048", "400", "520", "1314"];
  const SUGGESTED_SEGMENTS = ["A", "B", "D", "F"];
  const POSITION_PATTERNS_STORAGE_KEY = "platego_position_patterns";
  const SELF_RULE_SELECTION_STORAGE_KEY = "platego_self_rule_selection";
  const POOL_SNAPSHOTS_STORAGE_KEY = "platego_pool_snapshots_v1";
  const NUMBER_TIPS_V2_STORAGE_KEY = "platego_number_tips_v2_initialized";
  const POSITION_PATTERNS_V2_STORAGE_KEY = "platego_position_patterns_v2_initialized";
  const MAX_POSITION_PATTERNS = 20;
  const MAX_RULE_SELECTION = 2000;
  const MAX_POOL_SNAPSHOTS = 3;
  const MAX_POOL_SNAPSHOT_TEXT = 1_500_000;
  const SHANGHAI_12123_HOME = "https://sh.122.gov.cn/";
  const SHANGHAI_12123_SELECT = "https://sh.122.gov.cn/veh1/netxh/main?gnid=1001";
  const SHANGHAI_12123_SEGMENT_PUB = "https://sh.122.gov.cn/m/pub/vehxhhdpub";

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
    apiBase: DEFAULT_API_BASE,
    dragging: false,
    ocrBusy: false,
    ocrLanguage: "chs",
    ocrChecked: false,
    regionTouched: false,
    vehicleRecords: { schemaVersion: 1, activeId: "", records: [] },
    vehicleDraft: { plateKind: "", brand: "", model: "", certificateNo: "", vin: "" },
    guide: { phase: "idle", hint: "" },
    searchOpen: false,
    searchOpenStickyUntil: 0,
    filledKeys: {},
    certificatePreview: { imageDataUrl: "", regions: {} },
    renderPaused: false,
    assistantScrollTop: 0,
    ruleResultsScrollTop: 0,
    presetRuleContext: "random",
    numberTips: { ...DEFAULT_NUMBER_TIPS },
    selfEntryQueue: structuredClone(DEFAULT_SELF_ENTRY_QUEUE),
    selfEntryDraft: "",
    positionPatterns: [],
    selfRuleSelected: [],
    selfRuleVisibleLimit: 40,
    selfRuleMatchCache: { key: "", values: [] },
    capturedPool: null,
    poolSnapshots: [],
    selfBatchPending: false,
    selfBatchValues: [],
    selfBatchRemainingBefore: null,
    selfBatchAdvanceBusy: false,
    officialPoolScanStarted: false,
    scanHold: false,
    ruleSnapshotFailure: ""
  };

  const styles = `
    *{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer}.shell{width:370px;max-height:calc(100vh - 36px);overflow:auto;color:#1b2722;background:#fffefb;border:1px solid rgba(18,65,47,.2);border-radius:16px;box-shadow:0 18px 55px rgba(9,35,25,.22);font-size:12px}.head{position:sticky;top:0;z-index:3;height:58px;padding:0 14px;display:flex;align-items:center;gap:9px;color:white;background:#124f3c;border-radius:15px 15px 0 0;cursor:grab}.head:active{cursor:grabbing}.mark{width:31px;height:31px;display:grid;place-items:center;border-radius:9px;color:#124f3c;background:#c9f27b;font-weight:800}.brand{display:grid;line-height:1.2}.brand b{font-size:14px}.brand small{color:rgba(255,255,255,.68);font-size:8px;letter-spacing:.7px}.close{margin-left:auto;width:29px;height:29px;border:0;border-radius:8px;color:white;background:rgba(255,255,255,.12);font-size:16px;cursor:pointer}.body{position:relative;padding:13px}.status{display:flex;align-items:flex-start;gap:9px;padding:11px;border-radius:10px;background:#eff5ec}.status i{flex:none;width:8px;height:8px;margin-top:3px;border-radius:50%;background:#4ea476;box-shadow:0 0 0 4px rgba(78,164,118,.12)}.status.warn{background:#fff5e7}.status.warn i{background:#cf8a2d}.status.fail{background:#fbeeee}.status.fail i{background:#bd5c5c}.status div{display:grid;gap:2px}.status strong{font-size:11px}.status span{color:#68736d;font-size:9px;line-height:1.45}.safety{margin:10px 0;padding:8px 10px;border-left:3px solid #8db17b;background:#f4f7f1;color:#66716b;font-size:9px;line-height:1.5}.section{margin-top:11px;padding-top:11px;border-top:1px solid #e5e9e5}.title{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.title strong{font-size:11px}.tag{padding:3px 6px;border-radius:5px;color:#145c45;background:#eaf4e7;font-size:8px}.buttons{display:flex;flex-wrap:wrap;gap:6px}.buttons.spaced{margin-top:8px}.buttons button{min-height:33px;padding:0 10px;border:1px solid #d6dfd8;border-radius:8px;color:#145c45;background:white;font-weight:600;font-size:9px}.buttons button.primary{border-color:#145c45;color:white;background:#145c45}.buttons button:disabled{opacity:.4;cursor:not-allowed}.numbers{display:grid;grid-template-columns:1fr 1fr;gap:5px}.number{padding:7px 8px;border-radius:7px;background:#f1f4f0;display:flex;align-items:center;justify-content:space-between}.number b{letter-spacing:.6px}.number span{color:#59816e;font-size:8px}.progress{width:100%;height:6px;margin:7px 0;border:0;border-radius:8px;overflow:hidden;background:#e4e9e5}.progress::-webkit-progress-bar{background:#e4e9e5}.progress::-webkit-progress-value{background:#56a476;transition:width .2s}.scan-copy{color:#718079;font-size:9px;line-height:1.45}.diff{display:grid;grid-template-columns:1fr 1fr;gap:6px}.diff>div{min-height:70px;padding:8px;border-radius:8px;background:#f4f6f3}.diff strong{display:block;margin-bottom:5px;font-size:9px}.diff span{display:inline-block;margin:2px;padding:3px 4px;border-radius:4px;background:white;font-size:8px}.diff em{color:#98a09b;font-size:8px}.diff .remove strong{color:#a64b4b}.diff .add strong{color:#2e669e}.message{margin-top:8px;padding:8px;border-radius:8px;color:#626d67;background:#f1f3f1;font-size:9px;line-height:1.5}.message.success{color:#145c45;background:#eaf5e9}.message.error{color:#a14848;background:#fbecec}.config-warning{margin-top:8px;padding:8px;border-radius:8px;color:#8a5d24;background:#fff4e3;font-size:9px;line-height:1.5}.config-warning.compact{margin-top:6px;padding:6px}.privacy{margin-top:10px;color:#87908b;font-size:8px;line-height:1.5}.empty{padding:10px;text-align:center;color:#8a938e;background:#f5f6f4;border-radius:8px;font-size:9px}.empty.compact{padding:8px}.draft{display:grid;gap:6px}.draft-row{display:grid;grid-template-columns:72px 1fr 36px 36px;gap:5px;align-items:center}.draft-row span{color:#66716b;font-size:8px}.draft-row input,.draft-select{width:100%;min-height:28px;padding:0 7px;border:1px solid #d6dfd8;border-radius:7px;background:#fff}.draft-row input.invalid{background:#fdecec;border-color:#d37a7a;color:#8a3030}.draft-issue{grid-column:2/-1;color:#a14848;font-size:8px;line-height:1.35;margin-top:-2px}.dropzone{position:relative;display:grid;place-items:center;min-height:96px;padding:14px 12px;border:1.5px dashed #b7c9bc;border-radius:12px;background:#f6f8f5;color:#5f6f67;text-align:center;cursor:pointer;gap:3px}.dropzone strong{font-size:12px;color:#145c45}.dropzone small{font-size:8px;line-height:1.4}.dropzone.active{border-color:#145c45;background:#eaf4e7}.dropzone input{position:absolute;inset:0;opacity:0;cursor:pointer}.copy-hit,.check-hit{min-height:28px;padding:0;border:0;border-radius:7px;background:#eef3ee;color:#3d6b55;font-size:8px;font-weight:700}.copy-hit:hover,.check-hit:hover{background:#145c45;color:#fff}.check-pop{position:absolute;z-index:6;padding:6px;border:1px solid #d6dfd8;border-radius:10px;background:#fff;box-shadow:0 10px 28px rgba(9,35,25,.18)}.check-pop canvas{display:block;max-width:280px;border-radius:6px}.check-pop[hidden]{display:none}.archive{display:grid;gap:18px}.draft{display:grid;gap:8px}.draft-row input.grouped{letter-spacing:.15px;font-variant-numeric:tabular-nums}.group-rule{display:inline-flex;align-items:center;height:1em;margin:0 .05em;user-select:none;pointer-events:none;color:rgba(20,92,69,.4);font-style:normal;font-weight:500;line-height:1;vertical-align:middle}.group-rule::before{content:"-"}.search-card b.grouped{display:flex;align-items:center;flex-wrap:nowrap;font-variant-numeric:tabular-nums}.search-card b.grouped em,.search-card b .group-rule{display:inline-flex;align-items:center;height:1em;font-style:normal;font-weight:inherit;line-height:1}.tips{display:grid;gap:7px}.tip-row{display:flex;align-items:flex-start;gap:7px;color:#3d4a44;font-size:10px;line-height:1.4}.tip-row input{margin-top:2px}.tip-row small{display:block;color:#7a8680;font-size:8px}.tips .specifics{width:100%;min-height:28px;padding:0 7px;border:1px solid #d6dfd8;border-radius:7px}.tip-legend{display:flex;flex-wrap:wrap;gap:8px;color:#7a8680;font-size:8px}.tip-legend i{display:inline-block;width:8px;height:8px;margin-right:3px;border-radius:2px;vertical-align:-1px}.tip-legend .pair{background:#c9a227}.tip-legend .sequence{background:#3d8f68}.tip-legend .lucky{background:#3d6fbf}.guide{margin-top:10px;padding:9px 10px;border-radius:8px;background:#eaf4e7;color:#145c45;font-size:10px;font-weight:700;line-height:1.5}.guide.done{background:#eaf5e9;color:#145c45}.guide.blocked{background:#fbecec;color:#a14848}.search-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:stretch}.search-card{display:grid;grid-template-rows:14px 42px auto auto;gap:6px;min-width:0;padding:10px;border:1px solid #d6dfd8;border-radius:10px;background:#f6faf6}.search-card.invalid{background:#fdecec;border-color:#d37a7a}.search-card>span:first-child{color:#66716b;font-size:8px;line-height:14px}.search-card span{color:#66716b;font-size:8px}.search-card b{display:flex;align-items:center;align-content:center;min-height:42px;height:42px;overflow:hidden;color:#145c45;font-size:15px;line-height:1.2;word-break:break-all}.search-card-actions{display:flex;flex-wrap:wrap;gap:5px}.search-card-actions button{flex:1;min-height:28px}.footer-actions{margin-top:12px;padding-top:10px;border-top:1px solid #e5e9e5}.footer-actions button{width:100%}.entry-nav{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.entry-nav a{min-height:28px;padding:0 8px;border:1px solid #d6dfd8;border-radius:8px;color:#145c45;background:#fff;font-size:9px;font-weight:700;text-decoration:none;display:inline-flex;align-items:center}.entry-nav a:hover{background:#eaf4e7}.landing{display:grid;gap:10px}.landing-links{display:grid;gap:6px}.landing-links a{display:block;padding:9px 10px;border:1px solid #d6dfd8;border-radius:10px;color:#1b2722;background:#f6faf6;text-decoration:none}.landing-links a strong{display:block;color:#145c45;font-size:11px}.landing-links a span{color:#68736d;font-size:8px;line-height:1.4}.pref-grid{display:grid;gap:8px}.pref-card{padding:9px;border:1px solid #e5e9e5;border-radius:10px;background:#fff}.pref-card h3{margin:2px 0 6px;font-size:12px}.pref-card p{margin:0 0 8px;color:#68736d;font-size:8px;line-height:1.45}.chips{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}.chip{min-height:26px;padding:0 8px;border:1px solid #d6dfd8;border-radius:999px;color:#145c45;background:#f6f8f5;font-size:9px;font-weight:700}.chip.on{color:#fff;background:#145c45;border-color:#145c45}.chip:disabled{opacity:.4}.chip-add{display:grid;grid-template-columns:1fr auto;gap:5px;margin-top:6px}.chip-add input{min-height:28px;padding:0 7px;border:1px solid #d6dfd8;border-radius:7px}.self-pool-input{width:100%;min-height:78px;resize:vertical;padding:8px;border:1px solid #d6dfd8;border-radius:8px;background:#fff;line-height:1.45}.self-pool-meta{margin:6px 0;color:#718079;font-size:8px;line-height:1.45}.self-batch{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:7px 0}.self-batch span{padding:6px 7px;border-radius:7px;background:#f1f4f0;font-size:9px;font-weight:700}.self-batch span:first-child:nth-last-child(1){grid-column:1/-1}.rule-builder{margin:8px 0 10px;padding:10px;border:1px solid #dbe5dc;border-radius:12px;background:#f8fbf8}.rule-builder-title,.rule-head,.rule-match-head,.self-manual-title{display:flex;align-items:center;justify-content:space-between;gap:8px}.rule-builder-title>div{display:grid;gap:2px}.rule-builder-title strong,.rule-match-head strong{font-size:10px}.rule-builder-title span,.rule-match-head span,.self-manual-title span{color:#718079;font-size:8px}.rule-builder-title button{min-height:28px;padding:0 8px;border:1px solid #145c45;border-radius:7px;color:#145c45;background:#fff;font-size:8px;font-weight:700}.rule-help{margin:7px 0;color:#718079;font-size:8px;line-height:1.45}.rule-card{margin-top:7px;padding:8px;border:1px solid #e0e7e1;border-radius:9px;background:#fff}.rule-head>div{display:flex;align-items:center;gap:4px}.rule-head button{min-height:24px;padding:0 6px;border:0;border-radius:6px;background:#eef3ee;color:#4d6658;font-size:8px}.rule-head .rule-mode.on{color:#fff;background:#145c45}.rule-head .text-danger{color:#9a4f4f;background:#f9eeee}.rule-slots{display:grid;grid-template-columns:28px repeat(var(--slot-count),minmax(0,1fr));gap:4px;margin-top:7px;align-items:end}.rule-prefix{height:32px;display:grid;place-items:center;border-radius:7px;color:#fff;background:#145c45;font-weight:800}.rule-slot{display:grid;gap:2px;min-width:0;text-align:center}.rule-slot span{color:#8a938e;font-size:7px}.rule-slot input{width:100%;height:32px;padding:0;border:1px solid #d6dfd8;border-radius:7px;background:#fff;text-align:center;text-transform:uppercase;font-size:12px;font-weight:800}.rule-slot input:focus{outline:2px solid rgba(20,92,69,.22);border-color:#145c45}.rule-match-head{margin-top:9px}.rule-results{display:grid;grid-template-columns:1fr 1fr;gap:5px;max-height:230px;margin-top:6px;overflow:auto}.rule-result{min-height:34px;padding:5px 7px;border:1px solid #d6dfd8;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:space-between;color:#2a3731}.rule-result b{font-size:9px;letter-spacing:.4px}.rule-result span{color:#7a8680;font-size:7px}.rule-result.on{border-color:#56a476;color:#145c45;background:#eaf5e9;box-shadow:inset 3px 0 #56a476}.rule-result.on span{color:#2d7957}.rule-result.unavailable{border-color:#d9dedb;color:#8d9691;background:#ecefed;box-shadow:none;cursor:not-allowed;opacity:.72}.rule-result.unavailable span{color:#8d9691}.self-manual-title{margin:10px 0 6px}.self-manual-title strong{font-size:10px}@media(max-width:520px){.shell{width:calc(100vw - 20px)}}
  `;
  const ruleSwitchStyles = `
    .rule-head .rule-mode,.rule-head .rule-enabled{display:inline-flex;align-items:center;gap:5px;padding:0 7px 0 4px;color:#4d6658;background:#eef3ee}
    .rule-head .rule-mode i{position:relative;width:22px;height:13px;border-radius:999px;background:#bcc8c0;transition:background .16s}
    .rule-head .rule-mode i::after{content:"";position:absolute;top:2px;left:2px;width:9px;height:9px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(9,35,25,.2);transition:transform .16s}
    .rule-head .rule-mode.on,.rule-head .rule-enabled.on{color:#145c45;background:#eaf5e9}
    .rule-head .rule-mode.on i,.rule-head .rule-enabled.on i{background:#56a476}
    .rule-head .rule-mode.on i::after,.rule-head .rule-enabled.on i::after{transform:translateX(9px)}
    .rule-head .rule-enabled{padding-left:7px}.rule-head .rule-enabled i{display:none}
    .rule-head{align-items:flex-start}.rule-name{flex:1}.rule-actions{display:grid!important;grid-template-columns:58px 62px 32px;gap:4px!important;flex:none}.rule-actions button{width:100%;padding:0 3px!important;white-space:nowrap}.rule-actions .rule-enabled{justify-content:center;padding:0 3px!important}
    .rule-card.off{padding-bottom:8px;background:#f4f6f3}.rule-card.off .rule-head{opacity:.78}
    .rule-name{display:grid!important;gap:1px!important;min-width:0}.rule-name strong{max-width:116px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.rule-name small{color:#718079;font-size:7px}
    .rule-slots.ordered{grid-template-columns:repeat(var(--slot-count),minmax(0,1fr));align-items:center}.rule-slots.ordered .rule-slot span{display:none}
    .tip-legend .many{background:#dc7654}
    .tip-legend .position{background:#b257d6}
    .tip-filter{width:calc(100% - 23px);min-height:28px;margin:-2px 0 2px 23px;padding:0 7px;border:1px solid #d6dfd8;border-radius:7px;background:#fff;color:#26352e;font-size:9px}.tip-filter:disabled{opacity:.5;background:#f2f4f2}.tip-filter::placeholder{color:#98a19c}
    .rule-context-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:8px 0}.rule-context-tabs button{min-height:28px;border:1px solid #d6dfd8;border-radius:7px;color:#5a6d62;background:#fff;font-size:9px;font-weight:700}.rule-context-tabs button.on{border-color:#145c45;color:#fff;background:#145c45}
    .chip.removable{display:inline-flex;align-items:center;gap:5px}.chip.removable span{font-size:12px;line-height:1}
    .selected-order{display:grid;gap:7px;margin-top:10px;padding-top:9px;border-top:1px solid #dfe7e0}
    .selected-order-title,.selected-order-group-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .selected-order-title strong{font-size:10px}.selected-order-title span,.selected-order-group-head span{color:#718079;font-size:8px}
    .selected-order-group{padding:7px;border:1px solid #dbe5dc;border-radius:9px;background:#fff}
    .selected-order-group-head{margin-bottom:5px}.selected-order-group-head strong{color:#145c45;font-size:9px}
    .selected-order-cards{display:grid;grid-template-columns:1fr 1fr;gap:5px}
    .selected-order-card{min-width:0;min-height:34px;padding:5px 6px;border:1px solid #b9d3c1;border-radius:8px;color:#145c45;background:#eff7ee;display:grid;grid-template-columns:17px 1fr auto;align-items:center;gap:4px;text-align:left;cursor:grab}
    .selected-order-card:active{cursor:grabbing}.selected-order-card span{width:17px;height:17px;display:grid;place-items:center;border-radius:5px;color:#fff;background:#56a476;font-size:7px;font-weight:800}
    .selected-order-card b{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:8px;letter-spacing:.2px}.selected-order-card small{color:#6d8878;font-size:6px}
    .selected-order-card.dragging{opacity:.45}.selected-order-card.drag-over{outline:2px solid #56a476;outline-offset:1px}.selected-order-card.locked{opacity:.65;cursor:not-allowed}
    .selected-order-empty{margin-top:9px;padding:8px;border:1px dashed #cfdad1;border-radius:8px;color:#7f8c85;background:#fff;font-size:8px;line-height:1.45;text-align:center}
  `;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`${styles}${ruleSwitchStyles}`);
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

  function normalizeNumberTips(value) {
    if (!value || typeof value !== "object") return { ...DEFAULT_NUMBER_TIPS };
    return {
      pair: value.pair !== false,
      pairDigits: [...new Set((String(value.pairDigits || "").match(/\d/g) || []))].join(""),
      sequence: value.sequence !== false,
      many: value.many !== false,
      sequenceTargets: String(value.sequenceTargets || "").replace(/[^0-9,，、\s]/g, "").slice(0, 80),
      manyDigits: [...new Set((String(value.manyDigits || "").match(/\d/g) || []))].join("")
    };
  }

  function normalizeComposePrefs(value) {
    if (!value || typeof value !== "object") return { ...DEFAULT_COMPOSE_PREFS };
    const combinations = Array.isArray(value.combinations)
      ? [...new Set(value.combinations.map((item) => String(item || "").toUpperCase().replace(/[^A-Z0-9]/g, "")).filter((item) => item.length >= 2))].slice(0, 40)
      : [];
    const segments = Array.isArray(value.segments)
      ? [...new Set(value.segments.map((item) => String(item || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 1)).filter((item) => /^[A-HJ-NP-Z]$/.test(item)))].slice(0, 24)
      : [];
    return { combinations, segments };
  }

  function normalizeStoredPlate(value) {
    const normalized = String(value || "").toUpperCase().replace(/[·.\-\s]/g, "");
    return /^沪[A-HJ-NP-Z0-9]{5,8}$/.test(normalized) ? normalized : "";
  }

  function normalizeSelfEntryQueue(value) {
    if (!value || typeof value !== "object" || value.schemaVersion !== 1) {
      return structuredClone(DEFAULT_SELF_ENTRY_QUEUE);
    }
    const manualValues = Array.isArray(value.manualValues)
      ? [...new Set(value.manualValues.map(normalizeStoredPlate).filter(Boolean))].slice(0, 2000)
      : [];
    const consumedValues = Array.isArray(value.consumedValues)
      ? [...new Set(value.consumedValues.map(normalizeStoredPlate).filter(Boolean))].slice(0, 5000)
      : [];
    const lastConsumedValues = Array.isArray(value.lastConsumedValues)
      ? [...new Set(value.lastConsumedValues.map(normalizeStoredPlate).filter(Boolean))].slice(0, 5)
      : [];
    return {
      schemaVersion: 1,
      regionCode: String(value.regionCode || "310000").slice(0, 12),
      plateType: String(value.plateType || "").slice(0, 32),
      prefix: String(value.prefix || "").toUpperCase().replace(/[·.\-\s]/g, "").slice(0, 4),
      manualValues,
      consumedValues,
      lastConsumedValues,
      updatedAt: String(value.updatedAt || "").slice(0, 40)
    };
  }

  function positionPatternLength(plateType) {
    return plateType === "small_nev" ? 7 : 6;
  }

  function normalizePositionPatterns(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, MAX_POSITION_PATTERNS).flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const plateType = item.plateType === "small_nev" ? "small_nev" : "small_blue";
      const length = positionPatternLength(plateType);
      const rawSlots = Array.isArray(item.slots) ? item.slots : [];
      const slots = Array.from({ length }, (_, slotIndex) => {
        const token = String(rawSlots[slotIndex] || "").trim().toUpperCase().replace(/[^A-HJ-NP-Z0-9]/g, "");
        return token.slice(0, 1);
      });
      const id = String(item.id || `rule-${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80)
        || `rule-${index + 1}`;
      return [{
        id,
        plateType,
        mode: item.mode === "ordered" ? "ordered" : "fixed",
        slots,
        enabledRandom: item.enabledRandom !== false,
        enabledSelf: item.enabledSelf !== false
      }];
    });
  }

  function positionPatternFingerprint(pattern) {
    return `${pattern.plateType}:${pattern.mode}:${pattern.slots.join("")}`;
  }

  function defaultPositionPatterns() {
    return ["small_blue", "small_nev"].flatMap((plateType) => {
      const length = positionPatternLength(plateType);
      const ordered = (id, token) => ({
        id: `${id}-${plateType}`,
        plateType,
        mode: "ordered",
        slots: [...token, ...Array.from({ length: Math.max(0, length - token.length) }, () => "")],
        enabledRandom: true,
        enabledSelf: true
      });
      const fixedToken = "114514";
      return [
        ordered("example-520", "520"),
        ordered("example-2233", "2233"),
        {
          id: `example-114514-${plateType}`,
          plateType,
          mode: "fixed",
          slots: [...Array.from({ length: Math.max(0, length - fixedToken.length) }, () => ""), ...fixedToken],
          enabledRandom: true,
          enabledSelf: true
        }
      ];
    });
  }

  function legacySpecificPatterns(rawTips) {
    const tokens = [...new Set(String(rawTips?.specifics || "")
      .split(/[,，、\s]+/)
      .map((item) => item.toUpperCase().replace(/[^A-HJ-NP-Z0-9]/g, ""))
      .filter((item) => item.length >= 2 && item.length <= 7))];
    const includedEveryOldDefault = LEGACY_LUCKY_NUMBER_PATTERNS.every((item) => tokens.includes(item));
    const legacy = includedEveryOldDefault
      ? tokens.filter((item) => !LEGACY_LUCKY_NUMBER_PATTERNS.includes(item))
      : tokens;
    return legacy.flatMap((token, tokenIndex) => ["small_blue", "small_nev"].flatMap((plateType) => {
      const length = positionPatternLength(plateType);
      if (token.length > length) return [];
      return [{
        id: `legacy-${tokenIndex + 1}-${plateType}-${token.toLowerCase()}`,
        plateType,
        mode: "ordered",
        slots: [...token, ...Array.from({ length: length - token.length }, () => "")],
        enabledRandom: true,
        enabledSelf: true
      }];
    }));
  }

  function mergePositionPatternDefaults(existing, rawTips) {
    const merged = [];
    const fingerprints = new Set();
    for (const pattern of normalizePositionPatterns([
      ...existing,
      ...defaultPositionPatterns(),
      ...legacySpecificPatterns(rawTips)
    ])) {
      const fingerprint = positionPatternFingerprint(pattern);
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      merged.push(pattern);
    }
    return merged;
  }

  function normalizeSelfRuleSelection(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(normalizeStoredPlate).filter(Boolean))].slice(0, MAX_RULE_SELECTION);
  }

  function normalizeCapturedPool(value) {
    const namespace = value?.namespace === "live-local"
      ? "live-local"
      : (value?.namespace === "simulation" ? "simulation" : "");
    if (!value || typeof value !== "object" || value.schemaVersion !== 1 || !namespace) return null;
    const values = Array.isArray(value.values)
      ? [...new Set(value.values.map(normalizeStoredPlate).filter(Boolean))].slice(0, 80_000)
      : [];
    if (!values.length) return null;
    const declaredPlateType = value.plateType === "small_nev" ? "small_nev" : "small_blue";
    const inferredPlateType = values.some((item) => /^沪[A-Z][A-HJ-NP-Z0-9]{6}$/.test(item))
      ? "small_nev"
      : declaredPlateType;
    return {
      schemaVersion: 1,
      namespace,
      regionCode: String(value.regionCode || "310000").slice(0, 12),
      plateType: inferredPlateType,
      correctedFromPlateType: inferredPlateType !== declaredPlateType ? declaredPlateType : "",
      prefix: String(value.prefix || "沪").toUpperCase().replace(/[·.\-\s]/g, "").slice(0, 4),
      coverage: String(value.coverage || "unknown").slice(0, 32),
      observedAt: String(value.observedAt || "").slice(0, 40),
      values
    };
  }

  function normalizePoolSnapshots(value) {
    if (!value || typeof value !== "object" || value.schemaVersion !== 1 || !Array.isArray(value.snapshots)) return [];
    return value.snapshots.slice(0, MAX_POOL_SNAPSHOTS).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const valuesText = String(item.valuesText || "").slice(0, MAX_POOL_SNAPSHOT_TEXT);
      const count = Number(item.count || valuesText.split("\n").filter(Boolean).length);
      if (!valuesText || !Number.isFinite(count) || count < 1) return [];
      return [{
        id: String(item.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 120),
        regionCode: String(item.regionCode || "310000").slice(0, 12),
        plateType: item.plateType === "small_nev" ? "small_nev" : "small_blue",
        prefix: String(item.prefix || "沪").toUpperCase().replace(/[·.\-\s]/g, "").slice(0, 4),
        source: item.source === "live-local" ? "live-local" : "simulation",
        coverage: String(item.coverage || "unknown").slice(0, 32),
        observedAt: String(item.observedAt || "").slice(0, 40),
        count,
        valuesText
      }];
    });
  }

  function persistPositionPatterns() {
    void storageSet({
      [POSITION_PATTERNS_STORAGE_KEY]: state.positionPatterns,
      platego_position_patterns_updated_at: new Date().toISOString()
    }).catch(() => undefined);
  }

  function persistSelfRuleSelection() {
    void storageSet({ [SELF_RULE_SELECTION_STORAGE_KEY]: state.selfRuleSelected }).catch(() => undefined);
  }

  function persistSelfEntryQueue() {
    void storageSet({ platego_self_entry_queue: state.selfEntryQueue }).catch(() => undefined);
  }

  function normalizeConfig(value) {
    if (!value || value.schemaVersion !== 1 || !Array.isArray(value.rules)
      || !Array.isArray(value.favorites) || !Array.isArray(value.orderedCandidates)) {
      return structuredClone(DEFAULT_CONFIG);
    }
    return {
      ...value,
      highlightPrefs: normalizeNumberTips(value.highlightPrefs),
      composePrefs: normalizeComposePrefs(value.composePrefs)
    };
  }

  function persistNumberTips() {
    void storageGet(["platego_config"]).then((stored) => {
      const next = { ...normalizeConfig(stored.platego_config), highlightPrefs: { ...state.numberTips } };
      state.config = next;
      return storageSet({
        platego_number_tips: state.numberTips,
        platego_config: next,
        platego_config_updated_at: new Date().toISOString(),
        [NUMBER_TIPS_V2_STORAGE_KEY]: true
      });
    }).catch(() => {
      void storageSet({ platego_number_tips: state.numberTips, [NUMBER_TIPS_V2_STORAGE_KEY]: true });
    });
  }

  function persistComposePrefs(nextPrefs) {
    const composePrefs = normalizeComposePrefs(nextPrefs);
    state.config = { ...state.config, composePrefs };
    void storageGet(["platego_config"]).then((stored) => {
      const next = { ...normalizeConfig(stored.platego_config), composePrefs };
      state.config = next;
      return storageSet({ platego_config: next, platego_config_updated_at: new Date().toISOString() });
    }).catch(() => undefined);
  }

  function workbenchUrl(hash) {
    try {
      return `${chrome.runtime.getURL("index.html")}#${hash}`;
    } catch {
      return `/#${hash}`;
    }
  }

  function toggleListed(list, item) {
    return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
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

  function officialSimulationSearch() {
    return new URLSearchParams(location.search || "");
  }

  function isOfficialSimulationShell() {
    return isOfficialShanghaiLocation()
      && location.pathname === "/veh1/netxh/main"
      && officialSimulationSearch().get("gnid") === "1001";
  }

  function isOfficialLiveShell() {
    return isOfficialShanghaiLocation()
      && location.pathname === "/veh1/netxh"
      && officialSimulationSearch().get("gnid") === "1001";
  }

  function isOfficialSelectionPage(page) {
    return page?.kind === "official-simulation" || page?.kind === "official-live";
  }

  const VEHICLE_FIELD_LABELS = {
    plateKind: "号牌种类",
    brand: "品牌",
    model: "车辆型号",
    certificateNo: "合格证编号",
    vin: "车辆识别代号"
  };
  const VEHICLE_FIELD_ALIASES = [
    { key: "certificateNo", labels: ["整车出厂合格证编号", "整车合格证编号", "合格证编号", "合格证号", "凭证编号", "出厂合格证"] },
    { key: "vin", labels: ["车辆识别代号", "车辆识别代码", "识别代号", "车架号"] },
    { key: "model", labels: ["车辆型号"] },
    { key: "plateKind", labels: ["号牌种类", "号牌类型", "车辆类型", "车辆种类"] },
    { key: "brand", labels: ["中文品牌", "车辆品牌"] },
    { key: "model", labels: ["型号"] },
    { key: "brand", labels: ["品牌"] }
  ];
  const FLOW_STEPS = [
    { id: "LOGIN", label: "登录" },
    { id: "BASIC_INFO", label: "基本信息" },
    { id: "CONFIRM_INFO", label: "确认信息" },
    { id: "SERVICE_NOTICE", label: "服务说明" },
    { id: "PHONE_VERIFY", label: "手机验证" },
    { id: "SELECT", label: "预选号牌" },
    { id: "COMPLETE", label: "完成" }
  ];
  const REGION_OPTIONS = [
    ["110000", "北京"], ["120000", "天津"], ["130000", "河北"], ["140000", "山西"], ["150000", "内蒙古"],
    ["210000", "辽宁"], ["220000", "吉林"], ["230000", "黑龙江"], ["310000", "上海"], ["320000", "江苏"],
    ["330000", "浙江"], ["340000", "安徽"], ["350000", "福建"], ["360000", "江西"], ["370000", "山东"],
    ["410000", "河南"], ["420000", "湖北"], ["430000", "湖南"], ["440000", "广东"], ["450000", "广西"],
    ["460000", "海南"], ["500000", "重庆"], ["510000", "四川"], ["520000", "贵州"], ["530000", "云南"],
    ["540000", "西藏"], ["610000", "陕西"], ["620000", "甘肃"], ["630000", "青海"], ["640000", "宁夏"],
    ["650000", "新疆"]
  ];
  const VEHICLE_NAME_HINTS = [
    { key: "certificateNo", pattern: /hgzbh|zchgzbh|clhgz|wzhgz|hgzh|^hgz$|^zsbh$|pzhm/i },
    { key: "vin", pattern: /clsbdh|^vin$|cjh|clsbh/i },
    { key: "model", pattern: /clxh/i },
    { key: "brand", pattern: /ppmc|clppmc|clpp|^pp$/i },
    { key: "plateKind", pattern: /hpzl/i }
  ];

  function emptyVehicleDraft() {
    return { plateKind: "", brand: "", model: "", certificateNo: "", vin: "" };
  }

  function normalizeOcrLanguage(value) {
    return String(value || "").toLowerCase() === "cht" ? "cht" : "chs";
  }

  function selectedRegionCode(page) {
    if (state.regionTouched) return state.config.regionCode || "310000";
    return page.regionCode || state.config.regionCode || "310000";
  }

  function vehicleFieldIssue(key, value) {
    const required = state.ocrChecked && (key === "vin" || key === "certificateNo" || key === "model");
    if (self.PlateGoCertificate && typeof self.PlateGoCertificate.vehicleFieldIssue === "function") {
      return self.PlateGoCertificate.vehicleFieldIssue(key, value, { required });
    }
    return "";
  }

  function normalizeVehicleRecords(value) {
    const records = [];
    const sourceRecords = Array.isArray(value?.records) ? value.records : [];
    for (const item of sourceRecords.slice(0, 10)) {
      if (!item || typeof item !== "object") continue;
      records.push({
        id: String(item.id || "").slice(0, 40) || `veh-${Date.now().toString(36)}-${records.length}`,
        updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
        source: item.source === "ocr" ? "ocr" : "manual",
        plateKind: String(item.plateKind || "").trim().slice(0, 40),
        brand: String(item.brand || "").trim().slice(0, 40),
        model: String(item.model || "").trim().slice(0, 40),
        certificateNo: String(item.certificateNo || "").trim().slice(0, 40),
        vin: String(item.vin || "").trim().toUpperCase().slice(0, 20)
      });
    }
    const activeId = records.some((item) => item.id === value?.activeId) ? value.activeId : (records[0]?.id || "");
    return { schemaVersion: 1, activeId, records };
  }

  function draftFromRecord(record) {
    const draft = emptyVehicleDraft();
    if (!record) return draft;
    for (const key of Object.keys(draft)) draft[key] = String(record[key] || "");
    return draft;
  }

  function isGroupedVehicleField(key) {
    return key === "certificateNo" || key === "vin" || key === "model";
  }

  function rawVehicleValue(value) {
    return String(value || "").replace(/[\s\-－–—]+/g, "");
  }

  function groupedVehicleParts(value) {
    return rawVehicleValue(value).match(/.{1,4}/g) || [];
  }

  function groupedVehicleValue(value) {
    return groupedVehicleParts(value).join("-");
  }

  function groupedVehicleMarkup(value) {
    const parts = groupedVehicleParts(value);
    if (!parts.length) return "";
    return parts.map((part, index) => (
      `${index ? '<i class="group-rule" aria-hidden="true"></i>' : ""}<em>${escapeHtml(part)}</em>`
    )).join("");
  }

  function groupedCaretIndex(display, rawCount) {
    let index = 0;
    let seen = 0;
    while (index < display.length && seen < rawCount) {
      if (display[index] !== "-") seen += 1;
      index += 1;
    }
    return index;
  }

  function displayVehicleValue(key, value) {
    const raw = key === "vin" || key === "model"
      ? rawVehicleValue(value).toUpperCase()
      : rawVehicleValue(value);
    return isGroupedVehicleField(key) ? groupedVehicleValue(raw) : String(value || "");
  }

  function isEditingDraft() {
    const active = shadow.activeElement;
    return active instanceof HTMLInputElement && Boolean(active.dataset.draftField);
  }

  function isEditingAssistantField() {
    const active = shadow.activeElement;
    return isEditingDraft()
      || (active instanceof HTMLInputElement && active.dataset.action === "position-pattern-slot")
      || (active instanceof HTMLInputElement && ["pair-digits", "sequence-targets", "many-digits"].includes(active.dataset.action || ""))
      || (active instanceof HTMLTextAreaElement && active.dataset.action === "manual-self-pool");
  }

  function syncDraftFieldChrome(input, key) {
    const issue = vehicleFieldIssue(key, state.vehicleDraft[key]);
    input.classList.toggle("invalid", Boolean(issue));
    const row = input.closest(".draft-row");
    if (!(row instanceof HTMLElement)) return;
    const copy = row.querySelector(".copy-hit");
    if (copy) copy.textContent = issue ? "检查" : "复制";
    let note = row.querySelector(".draft-issue");
    if (issue) {
      if (!note) {
        note = document.createElement("div");
        note.className = "draft-issue";
        row.appendChild(note);
      }
      note.textContent = `请检查：${issue}`;
      return;
    }
    if (note) note.remove();
  }

  function inferredPlateType(plateKind) {
    const text = String(plateKind || "");
    if (/新能源|纯电动|燃料电池|插电/.test(text)) return "small_nev";
    if (/小型汽车|蓝牌/.test(text)) return "small_blue";
    return "";
  }

  function matchVehicleFieldLabel(text, nameHint) {
    const haystack = String(text || "").replace(/\s+/g, "");
    if (/所有人|身份证|手机|联系|发动机|住所/.test(haystack)) return "";
    if (haystack === "品牌型号" || /请点此查询|查询选择车辆品牌/.test(haystack)) return "";
    for (const alias of VEHICLE_FIELD_ALIASES) {
      if (alias.labels.some((label) => haystack.includes(label))) return alias.key;
    }
    const hint = String(nameHint || "");
    const hinted = VEHICLE_NAME_HINTS.find((item) => item.pattern.test(hint));
    return hinted?.key || "";
  }

  function fieldRow(element) {
    return element.closest("tr, li, dl, dd, .form-item, .el-form-item, .form-group, .layui-form-item, .weui-cell, .item, .row, .form-row, .clearfix, fieldset");
  }

  function controlLabel(element) {
    const doc = element.ownerDocument;
    if (element.id && doc?.querySelector) {
      try {
        const byFor = doc.querySelector(`label[for="${CSS.escape(element.id)}"]`);
        if (byFor) return String(byFor.textContent || "");
      } catch { /* invalid id */ }
    }
    const wrapped = element.closest("label");
    if (wrapped) return String(wrapped.textContent || "");
    const dd = element.closest("dd");
    if (dd?.previousElementSibling?.tagName === "DT") return String(dd.previousElementSibling.textContent || "");
    const cell = element.closest("td");
    if (cell?.previousElementSibling) return String(cell.previousElementSibling.textContent || "");
    const row = fieldRow(element);
    if (row) {
      const head = row.querySelector("th, dt, label, .label, .name, .tit, .form-label, .el-form-item__label, .layui-form-label");
      if (head && !head.contains(element)) return String(head.textContent || "");
      for (const child of row.children) {
        if (child.contains(element)) break;
        const text = String(child.textContent || "").replace(/\s+/g, "");
        if (text && text.length < 24 && !child.querySelector("input, select, textarea")) return String(child.textContent || "");
      }
    }
    let current = element;
    for (let index = 0; index < 4 && current; index += 1) {
      const prev = current.previousElementSibling;
      if (prev && !prev.querySelector("input, select, textarea")) {
        const text = String(prev.textContent || "").replace(/\s+/g, "");
        if (text && text.length < 24) return String(prev.textContent || "");
      }
      current = current.parentElement;
    }
    return "";
  }

  function pageView(node) {
    return node?.ownerDocument?.defaultView || window;
  }

  function isPageElement(node) {
    return Boolean(node) && node.nodeType === 1;
  }

  function pageTag(node) {
    return String(node?.tagName || "").toUpperCase();
  }

  function isSearchTextControl(element) {
    if (!isPageElement(element)) return false;
    if (pageTag(element) === "TEXTAREA") return true;
    if (pageTag(element) !== "INPUT") return false;
    const type = String(element.getAttribute("type") || "text").toLowerCase();
    return !["hidden", "checkbox", "radio", "file", "button", "submit", "reset", "password", "image"].includes(type);
  }

  function isVisiblyFillable(element) {
    if (!isSearchTextControl(element) && pageTag(element) !== "SELECT") return false;
    const type = String(element.getAttribute("type") || "text").toLowerCase();
    if (["hidden", "checkbox", "radio", "file", "button", "submit", "reset", "password"].includes(type)) return false;
    const style = pageView(element).getComputedStyle?.(element);
    if (style && (style.display === "none" || style.visibility === "hidden")) return false;
    if (element.classList.contains("textbox-text") || element.classList.contains("combo-text") || element.classList.contains("validatebox-text") || element.classList.contains("searchbox-text")) {
      return true;
    }
    const rect = element.getBoundingClientRect();
    return rect.width >= 8 && rect.height >= 8;
  }

  function isBetterField(next, current) {
    const nextVisible = isVisiblyFillable(next);
    const currentVisible = isVisiblyFillable(current);
    if (nextVisible !== currentVisible) return nextVisible;
    const nextEmpty = !String(next.value || "").trim();
    const currentEmpty = !String(current.value || "").trim();
    return nextEmpty && !currentEmpty;
  }

  function assignField(found, key, element) {
    if (!key || !isPageElement(element)) return;
    if (element.closest("#platego-extension-host")) return;
    if (!found[key] || isBetterField(element, found[key])) found[key] = element;
  }

  function firstFillableIn(node) {
    if (!node) return null;
    if (node.matches?.("input, select, textarea") && isVisiblyFillable(node)) return node;
    return [...(node.querySelectorAll?.("input, select, textarea") || [])].find((element) => isVisiblyFillable(element)) || null;
  }

  function nearestFieldInput(labelNode) {
    const cell = labelNode.closest("th, td, dt, dd");
    if (cell) {
      const inCell = firstFillableIn(cell);
      if (inCell) return inCell;
      let nextCell = cell.nextElementSibling;
      for (let index = 0; index < 3 && nextCell; index += 1) {
        const input = firstFillableIn(nextCell);
        if (input) return input;
        nextCell = nextCell.nextElementSibling;
      }
    }
    let sibling = labelNode.nextElementSibling;
    for (let index = 0; index < 6 && sibling; index += 1) {
      const input = firstFillableIn(sibling);
      if (input) return input;
      sibling = sibling.nextElementSibling;
    }
    const row = fieldRow(labelNode) || labelNode.parentElement;
    if (!row) return null;
    const inputs = [...row.querySelectorAll("input, select, textarea")].filter((element) => isVisiblyFillable(element));
    if (inputs.length === 1) return inputs[0];
    return inputs.find((element) => Boolean(labelNode.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)) || null;
  }

  function collectByLabelProximity(root, found) {
    const nodes = [...root.querySelectorAll("th, dt, label, span, b, strong, div, p, td, em, font, li")];
    for (const node of nodes) {
      if (node.closest("#platego-extension-host")) continue;
      if (node.querySelector("input, select, textarea, iframe, table")) continue;
      const compact = String(node.textContent || "").replace(/\s+/g, "");
      if (!compact || compact.length > 16) continue;
      const key = matchVehicleFieldLabel(compact, "");
      if (!key) continue;
      const input = nearestFieldInput(node);
      if (input) assignField(found, key, input);
    }
    return found;
  }

  function collectVehicleFields(root) {
    if (!root?.querySelectorAll) return {};
    const found = {};
    const controls = [...root.querySelectorAll("input, select, textarea")];
    for (const element of controls) {
      if (!isPageElement(element)) continue;
      if (element.closest("#platego-extension-host")) continue;
      const type = String(element.getAttribute("type") || "text").toLowerCase();
      if (["hidden", "checkbox", "radio", "file", "button", "submit", "reset", "password"].includes(type)) continue;
      const declared = element.getAttribute("data-platego-vehicle-field");
      const key = VEHICLE_FIELD_LABELS[declared] ? declared : matchVehicleFieldLabel(
        `${controlLabel(element)} ${element.getAttribute("placeholder") || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`,
        `${element.getAttribute("name") || ""} ${element.id || ""}`
      );
      if (key) assignField(found, key, element);
    }
    return collectByLabelProximity(root, found);
  }

  function collectReadableDocuments(rootDoc, seen) {
    const docs = [];
    if (!rootDoc || seen.has(rootDoc)) return docs;
    seen.add(rootDoc);
    docs.push(rootDoc);
    let iframes = [];
    try {
      iframes = [...rootDoc.querySelectorAll("iframe")];
    } catch {
      return docs;
    }
    for (const iframe of iframes) {
      const nested = frameDocument(iframe);
      if (nested) docs.push(...collectReadableDocuments(nested, seen));
    }
    return docs;
  }

  function readableDocuments() {
    return collectReadableDocuments(document, new Set());
  }

  function isDisplayedFrame(iframe) {
    if (pageTag(iframe) !== "IFRAME") return false;
    const rect = iframe.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 80) return false;
    const style = getComputedStyle(iframe);
    if (!style || style.display === "none" || style.visibility === "hidden") return false;
    return Number(style.opacity) !== 0;
  }

  function visibleOfficialFrames() {
    return [...document.querySelectorAll("iframe")]
      .filter((iframe) => isDisplayedFrame(iframe) && !isOverlaySearchFrame(iframe))
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return (b.width * b.height) - (a.width * a.height);
      });
  }

  function isOverlaySearchFrame(iframe) {
    return isQueryPpxhFrame(iframe);
  }

  function isQueryPpxhDocument(doc) {
    if (!doc || doc === document) return false;
    try {
      const frame = doc.defaultView?.frameElement;
      if (frame && isQueryPpxhFrame(frame)) return true;
    } catch {
      /* ignore */
    }
    return Boolean(doc.querySelector?.("#formsearch")) && !doc.querySelector?.("#vehForm, #round2, #zsbh, #clsbdh");
  }

  function activePageDocuments() {
    const docs = [];
    const seen = new Set();
    function addTree(iframe) {
      if (isOverlaySearchFrame(iframe)) return;
      const doc = frameDocument(iframe);
      if (!doc || seen.has(doc) || isQueryPpxhDocument(doc)) return;
      seen.add(doc);
      docs.push(doc);
      for (const nested of [...doc.querySelectorAll("iframe")].filter((item) => isDisplayedFrame(item) && !isOverlaySearchFrame(item))) {
        addTree(nested);
      }
    }
    for (const iframe of visibleOfficialFrames()) addTree(iframe);
    return docs.length ? docs : [document];
  }

  function parentConfirmFields() {
    return collectVehicleFields(document);
  }

  function allVehicleFields() {
    const found = {};
    function merge(doc) {
      if (!doc || isQueryPpxhDocument(doc)) return;
      for (const [key, element] of Object.entries(collectVehicleFields(doc))) {
        if (!found[key]) found[key] = element;
      }
    }
    merge(document);
    for (const doc of activePageDocuments()) merge(doc);
    if (hasConfirmForm(found) || Object.keys(found).length) return found;
    for (const doc of readableDocuments()) merge(doc);
    return found;
  }

  function collectScopedSignals() {
    const headings = [];
    const bodies = [];
    for (const doc of activePageDocuments()) {
      for (const element of doc.querySelectorAll("h1, h2, legend, .tit, .step-title")) {
        headings.push(String(element.textContent || ""));
      }
      if (doc.body) bodies.push(String(doc.body.innerText || doc.body.textContent || ""));
    }
    return {
      heading: headings.join("\n").replace(/\s+/g, ""),
      body: bodies.join("\n").replace(/\s+/g, "").slice(0, 8000)
    };
  }

  function hasConfirmForm(fields) {
    return Boolean(fields?.certificateNo || fields?.vin);
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
    if (/个人用户登录|请选择用户登录类型|模拟已登录/.test(compact)) return "LOGIN";
    return "";
  }

  function declaredFlowStep() {
    const value = document.querySelector("[data-platego-flow-step]")?.getAttribute("data-platego-flow-step") || "";
    if (value === "PLATE_SELECTION") return "SELECT";
    return FLOW_STEPS.some((item) => item.id === value) ? value : "";
  }

  function detectFlowStep(page) {
    if (page.mode === "random" || page.mode === "self") return "SELECT";
    const declared = declaredFlowStep();
    if (declared) return declared;
    if (hasConfirmForm(page.confirmFields) || hasConfirmForm(parentConfirmFields())) return "CONFIRM_INFO";
    if (state.searchOpen && document.querySelector("#vehForm, #round2, #btnPpxh, #zsbh, #clsbdh")) return "CONFIRM_INFO";
    const signals = collectScopedSignals();
    return matchFlowStepText(signals.heading)
      || matchFlowStepText(signals.body)
      || (page.gate === "IDENTITY_VERIFICATION_REQUIRED" ? "PHONE_VERIFY" : "")
      || (page.kind === "official-mock" && page.gate === "SELECTION_READY" ? "SELECT" : "")
      || (page.gate === "LOGIN_REQUIRED" ? "LOGIN" : "")
      || (page.kind === "official-unverified" ? "UNKNOWN" : "BASIC_INFO");
  }

  function attachFlowStep(page) {
    page.flowStep = detectFlowStep(page);
    return page;
  }

  function applyHostPosition(position) {
    if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) {
      host.style.left = "auto";
      host.style.top = "auto";
      host.style.right = "18px";
      host.style.bottom = "18px";
      return;
    }
    const left = Math.min(Math.max(8, position.left), Math.max(8, window.innerWidth - 48));
    const top = Math.min(Math.max(8, position.top), Math.max(8, window.innerHeight - 48));
    host.style.left = `${left}px`;
    host.style.top = `${top}px`;
    host.style.right = "auto";
    host.style.bottom = "auto";
  }

  function frameDocument(iframe) {
    if (pageTag(iframe) !== "IFRAME") return null;
    try {
      return iframe.contentDocument || iframe.contentWindow?.document || null;
    } catch {
      return null;
    }
  }

  function visibleOfficialFrame(pathSnippet) {
    return visibleOfficialFrames().find((iframe) => {
      const src = iframe.getAttribute("src") || iframe.getAttribute("id") || "";
      return src.includes(pathSnippet);
    }) || null;
  }

  function officialFramePath(iframe) {
    if (pageTag(iframe) !== "IFRAME") return "";
    try {
      return new URL(iframe.getAttribute("src") || "", location.origin).pathname;
    } catch {
      return "";
    }
  }

  function visibleOfficialSelectionFrame(mode, environment) {
    const path = environment === "live"
      ? (mode === "random" ? "/veh1/netxh/sjxh" : "/veh1/netxh/zbxh")
      : (mode === "random" ? "/veh1/netxh/sjxhTest" : "/veh1/netxh/zbxhTest");
    return visibleOfficialFrames().find((iframe) => officialFramePath(iframe) === path) || null;
  }

  function officialSelectionFrame(page, mode) {
    const environment = page?.kind === "official-live" ? "live" : "simulation";
    return visibleOfficialSelectionFrame(mode, environment);
  }

  function nativeElementClick(element) {
    if (!isPageElement(element)) return false;
    const view = pageView(element);
    if (view.HTMLElement?.prototype?.click) {
      view.HTMLElement.prototype.click.call(element);
      return true;
    }
    HTMLElement.prototype.click.call(element);
    return true;
  }

  function activateSimulationKey(element) {
    if (!isPageElement(element) || pageTag(element) !== "LI") return false;
    if (!element.classList.contains("active")) return false;
    if (element.id === "submit" || element.closest("#submit") || element.closest(".btns")) return false;
    if (element.id === "btnRand" || element.closest("#btnRand")) return false;
    if (/确认|提交|验证|选号|换一批|随机/.test(String(element.textContent || ""))) return false;
    return nativeElementClick(element);
  }

  function officialPlateType(values) {
    if (values.some((value) => /^沪[A-Z][A-HJ-NP-Z0-9]{6}$/.test(value))) return "small_nev";
    return "small_blue";
  }

  function compactPlateText(value) {
    return String(value || "").toUpperCase().replace(/[·.\s]/g, "");
  }

  function platesFromText(value) {
    return compactPlateText(value).match(/沪[A-Z][A-HJ-NP-Z0-9]{5,6}/g) || [];
  }

  function officialRandomDocuments() {
    const docs = [];
    const seen = new Set();
    function add(doc) {
      if (!doc || seen.has(doc)) return;
      seen.add(doc);
      docs.push(doc);
    }
    add(frameDocument(visibleOfficialSelectionFrame("random", "simulation")));
    add(frameDocument(visibleOfficialSelectionFrame("random", "live")));
    for (const doc of readableDocuments()) {
      if (doc.querySelector?.(".forShow .codes .code, .jx-body .codes .code, #btnRand")) add(doc);
    }
    return docs;
  }

  function readOfficialCodeValue(node) {
    if (!isPageElement(node)) return "";
    const num = node.querySelector?.(".num");
    const compact = compactPlateText(num ? `沪${num.textContent || ""}` : node.textContent);
    return /^沪[A-Z][A-HJ-NP-Z0-9]{5,6}$/.test(compact) ? compact : "";
  }

  function readOfficialRandomNumbers(frameDoc) {
    const docs = frameDoc ? [frameDoc, ...officialRandomDocuments()] : officialRandomDocuments();
    const values = [];
    for (const doc of docs) {
      const cards = [...(doc.querySelectorAll?.(".codes .code") || [])];
      if (cards.length) {
        for (const card of cards) {
          const value = readOfficialCodeValue(card);
          if (value) values.push(value);
        }
        continue;
      }
      values.push(...platesFromText([...(doc.querySelectorAll?.(".codes, .jx-body, .forShow") || [])].map((node) => node.textContent).join("")));
    }
    return [...new Set(values)].slice(0, 30);
  }

  function officialFixedPrefix() {
    return "沪";
  }

  const OFFICIAL_HD_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const OFFICIAL_HD_DIGITS = "0123456789";
  const OFFICIAL_HD_FORBIDDEN = /vin|clsbdh|cookie|validtoken|captcha|yzm|password|idcard|sfzmhm|token/i;

  function sanitizeOfficialHdToken(value) {
    const token = String(value || "").toUpperCase().trim();
    if (!/^[A-HJ-NP-Z0-9!@#*]{1,12}$/.test(token)) return "";
    return token;
  }

  function sanitizeOfficialHdArr(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(sanitizeOfficialHdToken).filter(Boolean))].slice(0, 64);
  }

  function officialCharAllowed(templateChar, actual) {
    // Official zbxhcomm.js grammar: ! is a digit slot; @ is a letter slot.
    if (templateChar === "!") return OFFICIAL_HD_DIGITS.includes(actual);
    if (templateChar === "@") return OFFICIAL_HD_LETTERS.includes(actual);
    if (templateChar === "#" || templateChar === "*") {
      return OFFICIAL_HD_LETTERS.includes(actual) || OFFICIAL_HD_DIGITS.includes(actual);
    }
    return templateChar === actual;
  }

  function officialTemplateMatches(template, prefix) {
    if (!template || prefix.length > template.length) return false;
    for (let index = 0; index < prefix.length; index += 1) {
      if (!officialCharAllowed(template[index], prefix[index])) return false;
    }
    return true;
  }

  function sanitizeOfficialHdRegexes(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 128).map((item) => {
      if (!item || typeof item !== "object") return null;
      const source = String(item.source || "").slice(0, 1000);
      const flags = String(item.flags || "").replace(/[^gimsuy]/g, "").slice(0, 6);
      return source ? { source, flags } : null;
    }).filter(Boolean);
  }

  function compileOfficialHdRegexes(value) {
    const compiled = [];
    for (const item of sanitizeOfficialHdRegexes(value)) {
      try { compiled.push(new RegExp(item.source, item.flags)); }
      catch { return []; }
    }
    return compiled;
  }

  function officialRegexMatches(regex, value) {
    try {
      regex.lastIndex = 0;
      const matched = regex.test(value);
      regex.lastIndex = 0;
      return matched;
    } catch {
      return true;
    }
  }

  function officialIsExcluded(prefix, regexes) {
    return (Array.isArray(regexes) ? regexes : []).some((regex) => officialRegexMatches(regex, prefix));
  }

  function officialNextHdKeys(hdArr, prefix, regexes = []) {
    const keys = new Set();
    for (const template of sanitizeOfficialHdArr(hdArr)) {
      if (!officialTemplateMatches(template, prefix) || prefix.length >= template.length) continue;
      const next = template[prefix.length];
      if (next === "!") [...OFFICIAL_HD_DIGITS].forEach((item) => keys.add(item));
      else if (next === "@") [...OFFICIAL_HD_LETTERS].forEach((item) => keys.add(item));
      else if (next === "#" || next === "*") {
        [...OFFICIAL_HD_LETTERS].forEach((item) => keys.add(item));
        [...OFFICIAL_HD_DIGITS].forEach((item) => keys.add(item));
      } else if (/^[A-HJ-NP-Z0-9]$/.test(next)) keys.add(next);
    }
    return [...keys]
      .filter((key) => !officialIsExcluded(prefix + key, regexes))
      .sort();
  }

  function expandOfficialHdArr(hdArr, regexes, limit = 80_000) {
    const templates = sanitizeOfficialHdArr(hdArr);
    const terminals = [];
    const queue = [""];
    const seen = new Set([""]);
    const max = Math.max(1, Number(limit) || 80_000);
    while (queue.length && terminals.length < max) {
      const prefix = queue.shift();
      const next = officialNextHdKeys(templates, prefix, regexes);
      if (!next.length) {
        if (prefix && templates.some((template) => template.length === prefix.length && officialTemplateMatches(template, prefix))) {
          if (!officialIsExcluded(prefix, regexes)) terminals.push(prefix);
        }
        continue;
      }
      for (const key of next) {
        const child = prefix + key;
        if (seen.has(child)) continue;
        seen.add(child);
        if (seen.size > 120_000) return { terminals, truncated: true, visited: seen.size };
        queue.push(child);
      }
    }
    return { terminals, truncated: terminals.length >= max || queue.length > 0, visited: seen.size };
  }

  function officialRuleFieldsSafe(value) {
    if (!value || typeof value !== "object") return null;
    try {
      if (OFFICIAL_HD_FORBIDDEN.test(JSON.stringify(value))) return null;
    } catch { return null; }
    const hdArr = sanitizeOfficialHdArr(value.hdArr);
    if (!hdArr.length) return null;
    const hphmLength = Number(value.hphmLength || hdArr[0].length);
    if (hphmLength < 4 || hphmLength > 8) return null;
    const hphmRegexes = sanitizeOfficialHdRegexes(value.hphmRegexes);
    const hphmRegexCount = Number(value.hphmRegexCount);
    const filterComplete = value.filterComplete === true
      && Number.isInteger(hphmRegexCount)
      && hphmRegexCount >= 0
      && hphmRegexCount <= 128
      && hphmRegexCount === hphmRegexes.length;
    return {
      hdArr,
      hphmRegexes,
      hphmRegexCount: Number.isInteger(hphmRegexCount) ? hphmRegexCount : -1,
      filterComplete,
      hphmLength,
      plateType: String(value.plateType || "").slice(0, 32),
      source: String(value.source || "runtime").slice(0, 32)
    };
  }

  function officialSameKeySet(left, right) {
    return [...left].sort().join("") === [...right].sort().join("");
  }

  function officialDisplayedPrefix() {
    return officialFixedPrefix();
  }

  function officialInputValue(input) {
    const raw = String(input?.value || input?.getAttribute?.("value") || "").toUpperCase().replace(/[·.\s]/g, "");
    return raw.startsWith("沪") ? raw.slice(1) : raw;
  }

  function officialSuffixText(value) {
    const raw = String(value || "").toUpperCase().replace(/[·.\s]/g, "");
    return raw.startsWith("沪") ? raw.slice(1) : raw;
  }

  function officialIntentSlotSuffixes(frameDoc) {
    if (!frameDoc) return [];
    const namedInputs = [...frameDoc.querySelectorAll("input[name='hphm'], input[id^='hphm']")];
    const namedSpans = [...frameDoc.querySelectorAll("span[name='shphm'], span[id^='shphm']")];
    const indexed = [];
    for (let index = 1; index <= 5; index += 1) {
      const input = frameDoc.querySelector(`#hphm${index}`) || namedInputs[index - 1];
      const span = frameDoc.querySelector(`#shphm${index}`) || namedSpans[index - 1];
      if (!input && !span) continue;
      const inputValue = officialInputValue(input);
      const spanValue = officialSuffixText(span?.textContent || "");
      indexed.push(spanValue.length >= inputValue.length ? spanValue : inputValue);
    }
    return indexed.length ? indexed : officialIntentInputs(frameDoc).map(officialInputValue);
  }

  function readSelfComposeRemaining(page) {
    const docs = [];
    const candidateDoc = page?.candidateInputs?.[0]?.ownerDocument;
    if (candidateDoc) docs.push(candidateDoc);
    const officialDoc = isOfficialSelectionPage(page)
      ? frameDocument(officialSelectionFrame(page, "self"))
      : null;
    if (officialDoc && !docs.includes(officialDoc)) docs.push(officialDoc);
    if (page?.kind === "official-mock") docs.push(document);
    for (const doc of docs) {
      const text = String(doc?.body?.innerText || doc?.body?.textContent || "").replace(/\s+/g, " ");
      const match = text.match(/(?:还可以|还可)自编\s*(\d+)\s*个(?:号牌)?/);
      const count = Number.parseInt(match?.[1] || "", 10);
      if (Number.isInteger(count) && count >= 0) return count;
    }
    return null;
  }

  function officialCompletedIntentSuffixes(frameDoc, expectedLength) {
    return officialIntentSlotSuffixes(frameDoc).filter((value) => value.length === expectedLength);
  }

  function officialLastKeyCompletions(frameDoc, boxSuffix) {
    if (!boxSuffix) return [];
    const labels = officialEnabledLabels(frameDoc);
    const signature = labels.join("");
    if (!labels.length || isOfficialKeyboardResetFlash(signature, boxSuffix)) return [];
    return labels.filter((label) => /^[A-HJ-NP-Z0-9]$/.test(label)).map((label) => boxSuffix + label);
  }

  function officialIntentInputs(frameDoc) {
    if (!frameDoc) return [];
    return [...frameDoc.querySelectorAll("input.text-width5")]
      .filter((input) => isPageElement(input) && pageTag(input) === "INPUT")
      .filter((input) => {
        const rect = input.getBoundingClientRect();
        const style = frameDoc.defaultView?.getComputedStyle(input);
        return rect.width > 8 && rect.height > 8 && style?.visibility !== "hidden" && style?.display !== "none";
      })
      .slice(0, 5);
  }

  function officialCustomInputs(frameDoc) {
    const intent = officialIntentInputs(frameDoc);
    if (intent.length) return intent;
    if (!frameDoc) return [];
    return [...frameDoc.querySelectorAll("input[type='text']")]
      .filter((input) => isPageElement(input) && pageTag(input) === "INPUT")
      .filter((input) => {
        const rect = input.getBoundingClientRect();
        const style = frameDoc.defaultView?.getComputedStyle(input);
        return rect.width > 8 && rect.height > 8 && style?.visibility !== "hidden" && style?.display !== "none";
      })
      .slice(0, 5);
  }

  function officialActiveIntentInput(frameDoc, expectedSuffix = "") {
    const inputs = officialIntentInputs(frameDoc);
    const matched = inputs.find((input) => officialInputValue(input) === expectedSuffix);
    if (matched) return matched;
    const focused = inputs.find((input) => input === frameDoc.activeElement);
    if (focused) return focused;
    return inputs.find((input) => officialInputValue(input).length < Number(input.maxLength || 5)) || inputs[0] || null;
  }

  function officialDisplayedSuffixes(frameDoc) {
    return officialIntentInputs(frameDoc).map(officialInputValue).filter(Boolean);
  }

  function officialKeyLabel(item) {
    if (!isPageElement(item) || item.classList.contains("delete")) return "";
    const data = String(item.dataset.key || item.dataset.value || "").trim().toUpperCase();
    if (/^[0-9A-Z]$/.test(data)) return data;
    const direct = [...item.childNodes].find((node) => node.nodeType === 3 && String(node.textContent || "").trim());
    const text = String((direct || item).textContent || "").trim().toUpperCase();
    return /^[0-9A-Z]$/.test(text) ? text : "";
  }

  function officialVisibleKeyboards(frameDoc) {
    if (!frameDoc) return [];
    return [...frameDoc.querySelectorAll(".keyboard")].filter((node) => {
      if (!isPageElement(node)) return false;
      const rect = node.getBoundingClientRect();
      const style = frameDoc.defaultView?.getComputedStyle(node);
      return rect.width > 80 && rect.height > 40
        && style?.display !== "none"
        && style?.visibility !== "hidden";
    });
  }

  function officialLabelsFromRoot(root) {
    if (!root) return [];
    return [...new Set([...root.querySelectorAll("li")]
      .filter((item) => item.classList.contains("active") && !item.classList.contains("delete"))
      .map(officialKeyLabel)
      .filter((label) => /^[0-9A-Z]$/.test(label)))].sort();
  }

  function officialKeyboardRoot(frameDoc) {
    const keyboards = officialVisibleKeyboards(frameDoc);
    if (keyboards.length <= 1) return keyboards[0] || null;
    const suffix = officialCurrentSuffix(frameDoc);
    if (suffix) {
      const live = keyboards.find((keyboard) => {
        const signature = officialLabelsFromRoot(keyboard).join("");
        return signature && !isOfficialKeyboardResetFlash(signature, suffix);
      });
      if (live) return live;
    }
    const inputs = officialCustomInputs(frameDoc);
    const focused = inputs.find((input) => input === frameDoc.activeElement) || inputs[0];
    if (!focused) return keyboards[0];
    const inputRect = focused.getBoundingClientRect();
    return keyboards.slice().sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftDist = Math.abs(leftRect.top - inputRect.bottom) + Math.abs(leftRect.left - inputRect.left);
      const rightDist = Math.abs(rightRect.top - inputRect.bottom) + Math.abs(rightRect.left - inputRect.left);
      return leftDist - rightDist;
    })[0];
  }

  function officialKeyboardKeys(frameDoc) {
    const root = officialKeyboardRoot(frameDoc);
    if (!root) return [];
    return [...root.querySelectorAll("li")].filter((item) => (
      item.classList.contains("delete") || /^[0-9A-Z]$/.test(officialKeyLabel(item))
    ));
  }

  function readOfficialSelectionPage() {
    const environment = isOfficialSimulationShell()
      ? "simulation"
      : (isOfficialLiveShell() ? "live" : "");
    if (!environment) return null;
    const randomFrame = visibleOfficialSelectionFrame("random", environment);
    const customFrame = visibleOfficialSelectionFrame("self", environment);
    if (environment === "live" && !randomFrame && !customFrame) return null;
    const randomDoc = frameDocument(randomFrame);
    const customDoc = frameDocument(customFrame);
    const mode = randomFrame ? "random" : customFrame ? "self" : "entry";
    const randomNumbers = mode === "random" ? readOfficialRandomNumbers(randomDoc) : [];
    const candidateInputs = officialCustomInputs(customDoc);
    const keyboardKeys = officialKeyboardKeys(customDoc);
    const declaredLength = Number(candidateInputs[0]?.maxLength || 0);
    const plateType = declaredLength >= 6 || officialPlateType(randomNumbers) === "small_nev"
      ? "small_nev"
      : "small_blue";
    const prefix = mode === "self"
      ? officialFixedPrefix()
      : (randomNumbers[0]?.slice(0, 2) || officialDisplayedPrefix(randomDoc) || officialFixedPrefix());
    const targetLength = declaredLength === 5 || declaredLength === 6 || declaredLength === 7
      ? declaredLength
      : (plateType === "small_nev" ? 6 : 5);
    const frameReadable = mode === "entry" || (mode === "random" ? Boolean(randomDoc) : Boolean(customDoc));
    const keyboardReady = keyboardKeys.some((item) => item.classList.contains("active"));
    return attachFlowStep({
      kind: environment === "live" ? "official-live" : "official-simulation",
      detail: frameReadable
        ? (environment === "live" ? "上海正式选号页" : "上海官方模拟选号页")
        : `已识别官方${environment === "live" ? "正式" : "模拟"}选号壳层，但选号 iframe 不可读`,
      officialHost: true,
      fixtureVerified: frameReadable,
      gate: "SELECTION_READY",
      mode,
      candidateInputs,
      keyboardKeys,
      randomNumbers,
      automationReady: mode === "self" && frameReadable && candidateInputs.length > 0 && keyboardReady,
      prefix,
      targetLength,
      regionCode: "310000",
      plateType,
      officialFrameReadable: frameReadable,
      simulationFrameReadable: environment === "simulation" && frameReadable,
      confirmFields: allVehicleFields()
    });
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
      plateType: "small_blue",
      officialFrameReadable: false,
      simulationFrameReadable: false,
      confirmFields: {},
      flowStep: "UNKNOWN"
    };
  }

  function pageState() {
    if (isOfficialShanghaiLocation()) {
      const official = readOfficialSelectionPage();
      if (official) return official;
      const unverified = emptyPage("official-unverified", "当前官方页面不在已验收的精确选号路由内");
      unverified.confirmFields = allVehicleFields();
      return attachFlowStep(unverified);
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
      plateType,
      confirmFields: collectVehicleFields(root)
    };
    page.randomNumbers = mode === "random" ? readRandomNumbers(root, page) : [];
    return attachFlowStep(page);
  }

  function readRandomNumbers(root, page) {
    const suffixLength = page.targetLength;
    const values = [...root.querySelectorAll("[data-platego-random-number]")]
      .map((element) => String(element.dataset.plategoRandomNumber || element.textContent || "").replace(/\s/g, "").toUpperCase())
      .filter((value) => value.startsWith(page.prefix))
      .filter((value) => new RegExp(`^[沪][A-Z][A-HJ-NP-Z0-9]{${suffixLength}}$`).test(value));
    return [...new Set(values)].slice(0, 30);
  }

  function plateBody(value) {
    return String(value || "").toUpperCase().replace(/^沪/, "").replace(/[·.\s]/g, "");
  }

  function plateDigits(value) {
    return plateBody(value).replace(/\D/g, "");
  }

  function matchingDigitCounts(value, minimum, wantedValue = "") {
    const counts = new Map();
    for (const digit of plateDigits(value)) counts.set(digit, (counts.get(digit) || 0) + 1);
    const wanted = new Set((String(wantedValue || "").match(/\d/g) || []));
    return [...counts.entries()].filter(([digit, count]) => count >= minimum && (!wanted.size || wanted.has(digit)));
  }

  function hasRepeatedDigit(value, minimum, wantedValue = "") {
    return matchingDigitCounts(value, minimum, wantedValue).length > 0;
  }

  function hasPairLike(value) {
    return hasRepeatedDigit(value, 2, state.numberTips.pairDigits);
  }

  function hasStrongPairLike(value) {
    const body = plateBody(value);
    const wanted = new Set((String(state.numberTips.pairDigits || "").match(/\d/g) || []));
    const allowed = (digit) => !wanted.size || wanted.has(digit);
    const hasTriple = [...body.matchAll(/(\d)\1{2,}/g)].some((match) => allowed(match[1]));
    const hasDoublePair = [...body.matchAll(/(\d)\1(\d)\2/g)]
      .some((match) => match[1] !== match[2] && (allowed(match[1]) || allowed(match[2])));
    return hasPairLike(value) && (hasTriple || hasDoublePair);
  }

  function isConsecutiveDigits(value) {
    const digits = String(value || "");
    if (digits.length < 3 || digits.includes("0")) return false;
    const numbers = digits.split("").map(Number);
    const step = numbers[1] - numbers[0];
    return (step === 1 || step === -1)
      && numbers.slice(1).every((number, index) => number - numbers[index] === step);
  }

  function sequenceTargets() {
    return [...new Set(String(state.numberTips.sequenceTargets || "")
      .split(/[\s,，、]+/)
      .map((item) => item.replace(/\D/g, ""))
      .filter((item) => item.length >= 3 && isConsecutiveDigits(item)))];
  }

  function hasSequence(value) {
    const digits = plateDigits(value);
    const targets = sequenceTargets();
    if (targets.length) return targets.some((target) => digits.includes(target));
    for (let index = 0; index <= digits.length - 3; index += 1) {
      if (isConsecutiveDigits(digits.slice(index, index + 3))) return true;
    }
    return false;
  }

  function hasConsecutiveRun(value, minimum) {
    const digits = plateDigits(value);
    for (let index = 0; index <= digits.length - minimum; index += 1) {
      if (isConsecutiveDigits(digits.slice(index, index + minimum))) return true;
    }
    return false;
  }

  function hasLoopSequence(value) {
    const digits = plateDigits(value);
    for (let length = 4; length <= digits.length; length += 1) {
      for (let index = 0; index <= digits.length - length; index += 1) {
        const candidate = digits.slice(index, index + length);
        if (new Set(candidate).size > 1 && candidate === [...candidate].reverse().join("")) return true;
      }
    }
    return false;
  }

  function hasStrongSequence(value) {
    const digits = plateDigits(value);
    const targets = sequenceTargets();
    const hasStrongTarget = targets.some((target) => target.length >= 4 && digits.includes(target));
    return hasStrongTarget || (!targets.length && hasConsecutiveRun(value, 4)) || hasLoopSequence(value);
  }

  function hasManySameDigit(value) {
    return hasRepeatedDigit(value, 3, state.numberTips.manyDigits);
  }

  function hasStrongManySameDigit(value) {
    const matches = matchingDigitCounts(value, 3, state.numberTips.manyDigits);
    return matches.some(([, count]) => count >= 4) || matches.length >= 2;
  }

  function classifyNumberTips(value, page = null) {
    const tips = [];
    if (state.numberTips.pair && hasPairLike(value)) tips.push("pair");
    if (state.numberTips.sequence && (hasSequence(value) || hasLoopSequence(value))) tips.push("sequence");
    if (state.numberTips.many && hasManySameDigit(value)) tips.push("many");
    if (page && activePositionPatterns(page, "random").some((pattern) => positionPatternMatches(value, pattern, page))) tips.push("position");
    return tips;
  }

  function classifyStrongNumberTips(value, page = null) {
    const tips = [];
    if (state.numberTips.pair && hasStrongPairLike(value)) tips.push("pair");
    if (state.numberTips.sequence && hasStrongSequence(value)) tips.push("sequence");
    if (state.numberTips.many && hasStrongManySameDigit(value)) tips.push("many");
    if (page && activePositionPatterns(page, "random").some((pattern) => positionPatternMatches(value, pattern, page))) tips.push("position");
    return tips;
  }

  function numberCardElement(node) {
    let current = node instanceof HTMLElement ? node : null;
    for (let index = 0; index < 5 && current; index += 1) {
      const rect = current.getBoundingClientRect();
      if (rect.width >= 70 && rect.height >= 28 && rect.width <= 280 && rect.height <= 96) return current;
      current = current.parentElement;
    }
    return node instanceof HTMLElement ? node : null;
  }

  function collectOfficialRandomNumberNodes(doc) {
    const found = [];
    const seen = new Set();
    const cards = [...(doc.querySelectorAll?.(".codes .code") || [])];
    for (const card of cards) {
      const value = readOfficialCodeValue(card);
      if (!value || seen.has(card)) continue;
      seen.add(card);
      found.push({ element: card, value });
    }
    if (found.length) return found;
    const containers = [...doc.querySelectorAll(".codes, .jx-body, .forShow")];
    const candidates = containers.flatMap((root) => [root, ...root.querySelectorAll("div, span")]);
    function addNode(node) {
      const match = compactPlateText(node.textContent).match(/^沪[A-Z][A-HJ-NP-Z0-9]{5,6}$/);
      if (!match) return;
      const card = numberCardElement(node);
      if (!card || seen.has(card)) return;
      seen.add(card);
      found.push({ element: card, value: match[0] });
    }
    for (const node of candidates) addNode(node);
    return found;
  }

  function collectRandomNumberNodes(page) {
    if (page.kind === "official-mock") {
      const root = document.querySelector("[data-platego-adapter-root='shanghai-v1']");
      if (!root) return [];
      return [...root.querySelectorAll("[data-platego-random-number]")].map((element) => ({
        element,
        value: String(element.dataset.plategoRandomNumber || "").replace(/\s/g, "").toUpperCase()
      })).filter((item) => item.value);
    }
    if (!isOfficialSelectionPage(page)) return [];
    return officialRandomDocuments().flatMap((doc) => collectOfficialRandomNumberNodes(doc));
  }

  function ensureNumberTipStyles(doc) {
    if (!doc?.head || doc.getElementById("platego-number-tip-style")) return;
    const style = doc.createElement("style");
    style.id = "platego-number-tip-style";
    style.textContent = "[data-platego-number-tip~=\"pair\"]{outline:2px solid #c9a227!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgba(201,162,39,.28)!important}[data-platego-number-tip~=\"sequence\"]{outline:2px solid #3d8f68!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgba(61,143,104,.22)!important}[data-platego-number-tip~=\"many\"]{outline:2px solid #dc7654!important;outline-offset:2px!important;box-shadow:0 0 0 4px rgba(220,118,84,.24)!important}[data-platego-number-tip~=\"position\"]{outline:3px solid #b257d6!important;outline-offset:2px!important;box-shadow:0 0 0 5px rgba(178,87,214,.24)!important}[data-platego-number-tip-strong~=\"pair\"]{outline:3px solid #c9a227!important;box-shadow:0 0 0 5px rgba(201,162,39,.34),0 0 18px 7px rgba(201,162,39,.4)!important}[data-platego-number-tip-strong~=\"sequence\"]{outline:3px solid #3d8f68!important;box-shadow:0 0 0 5px rgba(61,143,104,.3),0 0 18px 7px rgba(61,143,104,.36)!important}[data-platego-number-tip-strong~=\"many\"]{outline:3px solid #dc7654!important;box-shadow:0 0 0 5px rgba(220,118,84,.32),0 0 18px 7px rgba(220,118,84,.4)!important}[data-platego-number-tip-strong~=\"position\"]{outline:3px solid #b257d6!important;box-shadow:0 0 0 6px rgba(178,87,214,.34),0 0 20px 8px rgba(178,87,214,.44)!important}";
    doc.head.appendChild(style);
  }

  function clearNumberTips() {
    for (const doc of readableDocuments()) {
      for (const element of doc.querySelectorAll("[data-platego-number-tip], [data-platego-number-tip-strong]")) {
        element.removeAttribute("data-platego-number-tip");
        element.removeAttribute("data-platego-number-tip-strong");
      }
    }
  }

  function highlightRandomNumberFrames(page) {
    clearNumberTips();
    if (page.mode !== "random") return;
    const items = collectRandomNumberNodes(page);
    for (const item of items) ensureNumberTipStyles(item.element.ownerDocument);
    for (const item of items) {
      const tips = classifyNumberTips(item.value, page);
      const strongTips = classifyStrongNumberTips(item.value, page);
      if (tips.length) item.element.setAttribute("data-platego-number-tip", tips.join(" "));
      if (strongTips.length) item.element.setAttribute("data-platego-number-tip-strong", strongTips.join(" "));
    }
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

  function officialCompleteLength(page) {
    if (state.coverage === "segment-snapshot" && state.terminals[0]) return state.terminals[0].length;
    return isOfficialSelectionPage(page) && page.mode === "self"
      ? page.targetLength + 1
      : page.targetLength;
  }

  function relevantCandidates(page) {
    const suffixPattern = new RegExp(`^[A-HJ-NP-Z0-9]{${officialCompleteLength(page)}}$`);
    return (state.config.orderedCandidates || []).filter((item) => {
      const value = String(item?.value || "").toUpperCase();
      return value.startsWith(page.prefix) && suffixPattern.test(value.slice(page.prefix.length));
    });
  }

  function normalizeSelfEntryValue(value, page) {
    const token = String(value || "").toUpperCase().replace(/[·.\-\s]/g, "");
    const prefix = String(page.prefix || "").toUpperCase();
    const expectedLength = officialCompleteLength(page);
    if (!token || !prefix || !expectedLength) return "";
    let suffix = token;
    if (token.startsWith(prefix)) suffix = token.slice(prefix.length);
    else if (token.startsWith("沪")) return "";
    else if (prefix.length > 1 && token.startsWith(prefix.slice(1))) suffix = token.slice(prefix.length - 1);
    if (suffix.length !== expectedLength || !/^[A-HJ-NP-Z0-9]+$/.test(suffix)) return "";
    return `${prefix}${suffix}`;
  }

  function parseSelfEntryDraft(value, page) {
    const tokens = String(value || "").split(/[\s,，、;；|]+/).map((item) => item.trim()).filter(Boolean);
    const values = [];
    const rejected = [];
    for (const token of tokens) {
      const normalized = normalizeSelfEntryValue(token, page);
      if (!normalized) rejected.push(token);
      else if (!values.includes(normalized)) values.push(normalized);
    }
    return { values: values.slice(0, 2000), rejected };
  }

  function selfEntryManualValues(page) {
    return [...new Set((state.selfEntryQueue.manualValues || [])
      .map((value) => normalizeSelfEntryValue(value, page))
      .filter(Boolean))];
  }

  function positionPatternEnabled(pattern, context) {
    return context === "random" ? pattern.enabledRandom : pattern.enabledSelf;
  }

  function activePositionPatterns(page, context = page.mode === "random" ? "random" : "self") {
    return normalizePositionPatterns(state.positionPatterns)
      .filter((pattern) => pattern.plateType === page.plateType)
      .filter((pattern) => positionPatternEnabled(pattern, context))
      .filter((pattern) => pattern.slots.some(Boolean));
  }

  function positionPatternMatches(value, pattern, page) {
    const normalized = normalizeSelfEntryValue(value, page);
    if (!normalized) return false;
    const suffix = normalized.slice(String(page.prefix || "").length);
    let slots = pattern.slots || [];
    if (pattern.mode === "ordered") {
      const first = slots.findIndex(Boolean);
      if (first < 0) return false;
      let last = slots.length - 1;
      while (last > first && !slots[last]) last -= 1;
      const template = slots.slice(first, last + 1);
      if (template.length > suffix.length) return false;
      for (let offset = 0; offset <= suffix.length - template.length; offset += 1) {
        if (template.every((token, index) => !token || suffix[offset + index] === token)) return true;
      }
      return false;
    }
    if (suffix.length > slots.length) {
      slots = [...Array.from({ length: suffix.length - slots.length }, () => ""), ...slots];
    } else if (suffix.length < slots.length) {
      const removed = slots.slice(0, slots.length - suffix.length);
      if (removed.some(Boolean)) return false;
      slots = slots.slice(slots.length - suffix.length);
    }
    return slots.every((token, index) => !token || suffix[index] === token);
  }

  function selfRuleMatchedValues(page) {
    const patterns = activePositionPatterns(page, "self");
    const key = JSON.stringify([
      page.regionCode,
      page.plateType,
      state.scanning ? "saved" : state.coverage,
      state.scanning ? 0 : state.terminals.length,
      state.capturedPool?.observedAt || "",
      state.config.exportedAt || "",
      patterns
    ]);
    if (state.selfRuleMatchCache.key === key) return state.selfRuleMatchCache.values;
    const pool = currentPoolValues(page);
    const filtered = patterns.length
      ? pool.filter((value) => patterns.some((pattern) => positionPatternMatches(value, pattern, page)))
      : pool;
    const values = [...new Set(filtered)]
      .sort((left, right) => score(right) - score(left) || left.localeCompare(right));
    state.selfRuleMatchCache = { key, values };
    return values;
  }

  function selfEntryQueueMatchesPage(page) {
    if (!page) return false;
    return String(state.selfEntryQueue.regionCode || "310000") === String(page.regionCode || "310000")
      && String(state.selfEntryQueue.plateType || "") === String(page.plateType || "")
      && String(state.selfEntryQueue.prefix || "") === String(page.prefix || "");
  }

  function selfEntryConsumedValues(page) {
    if (!selfEntryQueueMatchesPage(page)) return new Set();
    return new Set((state.selfEntryQueue.consumedValues || [])
      .map((value) => normalizeSelfEntryValue(value, page))
      .filter(Boolean));
  }

  function selfRuleSelectedValues(page) {
    const available = new Set(selfRuleMatchedValues(page));
    const consumed = selfEntryConsumedValues(page);
    return normalizeSelfRuleSelection(state.selfRuleSelected)
      .map((value) => normalizeSelfEntryValue(value, page))
      .filter((value) => value && available.has(value) && !consumed.has(value));
  }

  function selfEntryFilteredValues(page) {
    const currentPool = currentPoolValues(page);
    if (currentPool.length) return selfRuleMatchedValues(page);
    if (!isConfigCompatible(page)) return [];
    return [...new Set(relevantCandidates(page).map((item) => normalizeSelfEntryValue(item?.value, page)).filter(Boolean))];
  }

  function selfEntryCombinedValues(page) {
    const consumed = selfEntryConsumedValues(page);
    const selected = selfRuleSelectedValues(page);
    const source = selected.length
      ? [...selected, ...selfEntryManualValues(page)]
      : [...selfEntryManualValues(page), ...selfEntryFilteredValues(page)];
    return [...new Set(source)]
      .filter((value) => !consumed.has(value));
  }

  function selfEntryBatchSize(page) {
    if (isOfficialSelectionPage(page)) {
      const frameDoc = page.candidateInputs[0]?.ownerDocument || frameDocument(officialSelectionFrame(page, "self"));
      const slots = officialIntentSlotSuffixes(frameDoc).length;
      return Math.max(1, Math.min(5, slots || 5));
    }
    return Math.max(1, Math.min(5, page.candidateInputs.length || 5));
  }

  function currentSelfEntryBatch(page) {
    return selfEntryCombinedValues(page).slice(0, selfEntryBatchSize(page));
  }

  function positionPatternTitle(pattern) {
    const fixed = pattern.mode !== "ordered";
    let body;
    if (fixed) {
      body = pattern.slots.map((token) => token || "·").join("");
    } else {
      const first = pattern.slots.findIndex(Boolean);
      let last = pattern.slots.length - 1;
      while (last > first && !pattern.slots[last]) last -= 1;
      body = first < 0 ? "" : pattern.slots.slice(first, last + 1).map((token) => token || "□").join("");
    }
    if (!body || /^·+$/.test(body)) return "新规则";
    return fixed ? `沪${body}` : body;
  }

  function positionPatternMarkup(pattern, index, context) {
    const fixed = pattern.mode !== "ordered";
    const enabled = positionPatternEnabled(pattern, context);
    const modeLabel = fixed ? "限定位置" : "匹配顺序";
    const contextLabel = context === "random" ? "随机高亮" : "自编筛选";
    const slots = pattern.slots.map((token, slotIndex) => `<label class="rule-slot">${fixed ? `<span>${slotIndex + 1}</span>` : ""}<input data-action="position-pattern-slot" data-pattern-id="${escapeHtml(pattern.id)}" data-slot-index="${slotIndex}" value="${escapeHtml(token)}" maxlength="1" inputmode="text" autocomplete="off" spellcheck="false" aria-label="规则 ${index + 1}${fixed ? ` 第 ${slotIndex + 1} 位` : ` 顺序字符 ${slotIndex + 1}`}，空白表示不限"></label>`).join("");
    return `<div class="rule-card ${enabled ? "" : "off"}">
      <div class="rule-head"><div class="rule-name"><strong>${escapeHtml(positionPatternTitle(pattern))}</strong><small>${fixed ? "限定位置" : "匹配顺序"}${enabled ? "" : " · 已折叠"}</small></div><div class="rule-actions"><button type="button" role="switch" class="rule-enabled ${enabled ? "on" : ""}" data-action="toggle-position-pattern-enabled" data-pattern-id="${escapeHtml(pattern.id)}" data-context="${context}" aria-checked="${enabled}"><span>${contextLabel}</span></button><button type="button" role="switch" class="rule-mode ${fixed ? "on" : ""}" data-action="toggle-position-pattern-mode" data-pattern-id="${escapeHtml(pattern.id)}" aria-checked="${fixed}"><i aria-hidden="true"></i><span>${modeLabel}</span></button><button type="button" class="text-danger" data-action="delete-position-pattern" data-pattern-id="${escapeHtml(pattern.id)}">删除</button></div></div>
      ${enabled ? `<div class="rule-slots ${fixed ? "fixed" : "ordered"}" style="--slot-count:${pattern.slots.length}">${fixed ? `<span class="rule-prefix">沪</span>` : ""}${slots}</div>` : ""}
    </div>`;
  }

  function poolSnapshotTime(value) {
    const time = Date.parse(String(value || ""));
    if (!Number.isFinite(time)) return "尚未保存";
    return new Date(time).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function selectedOrderMarkup(page) {
    const selected = selfRuleSelectedValues(page);
    if (!selected.length) {
      return `<div class="selected-order-empty">选择号码后，将在这里按每轮 5 个显示填入顺序。</div>`;
    }
    const locked = state.selfBatchPending;
    const groups = [];
    for (let index = 0; index < selected.length; index += 5) groups.push(selected.slice(index, index + 5));
    return `<div class="selected-order">
      <div class="selected-order-title"><strong>已选填入顺序</strong><span>${locked ? "本轮待提交，排序已锁定" : "拖动号码可排序"} · ${groups.length} 轮</span></div>
      ${groups.map((group, groupIndex) => `<section class="selected-order-group">
        <div class="selected-order-group-head"><strong>第 ${groupIndex + 1} 轮</strong><span>${group.length} / 5</span></div>
        <div class="selected-order-cards">${group.map((value, index) => `<button type="button" draggable="${locked ? "false" : "true"}" class="selected-order-card ${locked ? "locked" : ""}" data-selected-drag="${escapeHtml(value)}" title="${locked ? "请先处理当前批次" : "拖动调整填入顺序"}"><span>${groupIndex * 5 + index + 1}</span><b>${escapeHtml(value)}</b><small>${locked ? "已填" : "拖动"}</small></button>`).join("")}</div>
      </section>`).join("")}
    </div>`;
  }

  function selfRuleResultMarkup(value, selected, consumed) {
    const unavailable = consumed.has(value);
    const isSelected = !unavailable && selected.has(value);
    return `<button type="button" class="rule-result ${isSelected ? "on" : ""} ${unavailable ? "unavailable" : ""}" data-action="toggle-rule-result" data-value="${escapeHtml(value)}" aria-pressed="${isSelected}" ${unavailable ? 'disabled aria-disabled="true" title="已在上一轮提交且未选中，不会再次加入"' : ""}><b>${escapeHtml(value)}</b><span>${unavailable ? "已排除" : isSelected ? "已选" : "选择"}</span></button>`;
  }

  function selfRuleBuilderMarkup(page) {
    const patterns = normalizePositionPatterns(state.positionPatterns).filter((pattern) => pattern.plateType === page.plateType);
    const pool = currentPoolValues(page);
    const matches = selfRuleMatchedValues(page);
    const selected = new Set(selfRuleSelectedValues(page));
    const consumed = selfEntryConsumedValues(page);
    const unavailableCount = matches.filter((value) => consumed.has(value)).length;
    const selectableCount = matches.length - unavailableCount;
    const visible = matches.slice(0, state.selfRuleVisibleLimit);
    const saved = state.capturedPool
      && state.capturedPool.regionCode === page.regionCode
      && state.capturedPool.plateType === page.plateType;
    const sourceCopy = state.terminals.length && !state.scanning
      ? "本次读取"
      : saved ? `本机 ${poolSnapshotTime(state.capturedPool.observedAt)}` : "插件候选";
    const rulesMarkup = patterns.length
      ? patterns.map((pattern, index) => positionPatternMarkup(pattern, index, "self")).join("")
      : `<div class="empty compact">还没有规则；不创建规则时显示整个当前号池。</div>`;
    const matchesMarkup = visible.length
      ? `<div class="rule-results">${visible.map((value) => selfRuleResultMarkup(value, selected, consumed)).join("")}</div>`
      : `<div class="empty compact">当前规则没有命中号码。</div>`;
    return `<div class="rule-builder">
      <div class="rule-builder-title"><div><strong>特定号码筛选</strong><span>${sourceCopy} · ${pool.length} 个 · 自动保存 ${state.poolSnapshots.length} 份</span></div><button type="button" data-action="add-position-pattern" ${state.positionPatterns.length >= MAX_POSITION_PATTERNS ? "disabled" : ""}>新建规则</button></div>
      <div class="rule-help">随机与自编共用规则内容，但分别保存是否启用。限定位置逐位匹配；匹配顺序把首尾空格忽略、内部空格保留为单字符通配位，整段可出现在任意位置。每次输入与开关变化都会自动写入本机配置。</div>
      ${rulesMarkup}
      <div class="rule-match-head"><strong data-self-rule-match-count>满足规则 ${matches.length} 个</strong><span data-self-rule-selection-count>可选 ${selectableCount} · 已选 ${selected.size}</span></div>
      <div data-self-rule-match-warning>${matches.length > 500 ? `<div class="config-warning compact">结果较多，当前先显示前 ${Math.min(state.selfRuleVisibleLimit, matches.length)} 个；可继续显示或补充规则缩小范围。</div>` : ""}</div>
      <div data-self-rule-results>${matchesMarkup}</div>
      <div class="buttons spaced"><button type="button" data-action="select-rule-top-five" ${selectableCount ? "" : "disabled"}>选择前 5 个</button><button type="button" data-action="clear-rule-selection" ${selected.size ? "" : "disabled"}>清空选择</button>${matches.length > visible.length ? `<button type="button" data-action="show-more-rule-results">再显示 40 个</button>` : ""}</div>
      ${selectedOrderMarkup(page)}
      <div class="privacy">点击号码即可选择或取消；已选号码可拖动排序，并按每轮 5 个分组。上一轮已提交但未选中的号码会置灰排除，不能再次加入；仅“恢复上一轮备用”可人工撤销这次排除。</div>
    </div>`;
  }

  function refreshSelfRuleMatches(page) {
    if (page?.flowStep !== "SELECT" || page.mode !== "self") return;
    const countNode = mount.querySelector("[data-self-rule-match-count]");
    const selectionNode = mount.querySelector("[data-self-rule-selection-count]");
    const warningNode = mount.querySelector("[data-self-rule-match-warning]");
    const resultsNode = mount.querySelector("[data-self-rule-results]");
    if (!(countNode instanceof HTMLElement)
      || !(warningNode instanceof HTMLElement)
      || !(resultsNode instanceof HTMLElement)) return;
    const matches = selfRuleMatchedValues(page);
    const selected = new Set(selfRuleSelectedValues(page));
    const consumed = selfEntryConsumedValues(page);
    const unavailableCount = matches.filter((value) => consumed.has(value)).length;
    const selectableCount = matches.length - unavailableCount;
    const visible = matches.slice(0, state.selfRuleVisibleLimit);
    countNode.textContent = `满足规则 ${matches.length} 个`;
    if (selectionNode instanceof HTMLElement) selectionNode.textContent = `可选 ${selectableCount} · 已选 ${selected.size}`;
    warningNode.innerHTML = matches.length > 500
      ? `<div class="config-warning compact">结果较多，当前先显示前 ${Math.min(state.selfRuleVisibleLimit, matches.length)} 个；可继续显示或补充规则缩小范围。</div>`
      : "";
    resultsNode.innerHTML = visible.length
      ? `<div class="rule-results">${visible.map((value) => selfRuleResultMarkup(value, selected, consumed)).join("")}</div>`
      : `<div class="empty compact">当前规则没有命中号码。</div>`;
    const selectButton = mount.querySelector("[data-action='select-rule-top-five']");
    if (selectButton instanceof HTMLButtonElement) selectButton.disabled = selectableCount === 0;
  }

  function randomPositionRuleMarkup(page) {
    const patterns = normalizePositionPatterns(state.positionPatterns).filter((pattern) => pattern.plateType === page.plateType);
    const activePatterns = activePositionPatterns(page, "random");
    const matches = activePatterns.length
      ? page.randomNumbers.filter((value) => activePatterns.some((pattern) => positionPatternMatches(value, pattern, page)))
      : [];
    const rulesMarkup = patterns.length
      ? patterns.map((pattern, index) => positionPatternMarkup(pattern, index, "random")).join("")
      : `<div class="empty compact">还没有特定号码规则；新建后会高亮当前随机批次中的命中号码。</div>`;
    return `<div class="rule-builder">
      <div class="rule-builder-title"><div><strong>特定号码规则</strong><span>与自编共用内容 · 当前命中 ${matches.length} 个</span></div><button type="button" data-action="add-position-pattern" ${state.positionPatterns.length >= MAX_POSITION_PATTERNS ? "disabled" : ""}>新建规则</button></div>
      <div class="rule-help">这里只负责高亮，不会代你选择随机号码。停用的随机规则自动折叠，但仍可在自编页单独启用。</div>
      ${rulesMarkup}
    </div>`;
  }

  function setPositionPatterns(nextPatterns, page) {
    state.positionPatterns = normalizePositionPatterns(nextPatterns);
    state.selfRuleVisibleLimit = 40;
    state.selfRuleMatchCache = { key: "", values: [] };
    persistPositionPatterns();
    if (page) {
      state.selfRuleSelected = selfRuleSelectedValues(page);
      persistSelfRuleSelection();
    }
  }

  function migrateCorrectedPoolPatterns() {
    const corrected = state.capturedPool?.correctedFromPlateType;
    const targetType = state.capturedPool?.plateType;
    if (!corrected || !targetType || corrected === targetType) return false;
    const targetLength = positionPatternLength(targetType);
    const existing = normalizePositionPatterns(state.positionPatterns);
    const semantic = new Set(existing
      .filter((pattern) => pattern.plateType === targetType)
      .map((pattern) => `${pattern.mode}:${pattern.slots.join("")}`));
    const additions = [];
    for (const pattern of existing.filter((item) => item.plateType === corrected && item.slots.some(Boolean))) {
      const tokens = pattern.slots.filter(Boolean);
      let slots;
      if (pattern.mode === "ordered") {
        if (tokens.length > targetLength) continue;
        slots = [...tokens, ...Array.from({ length: targetLength - tokens.length }, () => "")];
      } else if (pattern.slots.length <= targetLength) {
        slots = [...Array.from({ length: targetLength - pattern.slots.length }, () => ""), ...pattern.slots];
      } else {
        const removed = pattern.slots.slice(0, pattern.slots.length - targetLength);
        if (removed.some(Boolean)) continue;
        slots = pattern.slots.slice(pattern.slots.length - targetLength);
      }
      const key = `${pattern.mode}:${slots.join("")}`;
      if (semantic.has(key)) continue;
      semantic.add(key);
      additions.push({
        ...pattern,
        id: `${pattern.id}-${targetType}`.slice(0, 80),
        plateType: targetType,
        slots
      });
    }
    if (!additions.length) return false;
    state.positionPatterns = normalizePositionPatterns([...existing, ...additions]);
    persistPositionPatterns();
    return true;
  }

  function addPositionPattern(page) {
    if (state.positionPatterns.length >= MAX_POSITION_PATTERNS) return;
    const plateType = page.plateType === "small_nev" ? "small_nev" : "small_blue";
    setPositionPatterns([...state.positionPatterns, {
      id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      plateType,
      mode: "fixed",
      slots: Array.from({ length: positionPatternLength(plateType) }, () => ""),
      enabledRandom: true,
      enabledSelf: true
    }], page);
  }

  function toggleRuleResult(value, page) {
    const normalized = normalizeSelfEntryValue(value, page);
    if (!normalized || !selfRuleMatchedValues(page).includes(normalized)) return;
    if (selfEntryConsumedValues(page).has(normalized)) return;
    const current = new Set(normalizeSelfRuleSelection(state.selfRuleSelected));
    if (current.has(normalized)) current.delete(normalized);
    else if (current.size < MAX_RULE_SELECTION) current.add(normalized);
    state.selfRuleSelected = [...current];
    persistSelfRuleSelection();
  }

  function selectFirstRuleResults(page) {
    const consumed = selfEntryConsumedValues(page);
    state.selfRuleSelected = selfRuleMatchedValues(page).filter((value) => !consumed.has(value)).slice(0, 5);
    persistSelfRuleSelection();
  }

  function reorderSelectedValues(draggedValue, targetValue, placeAfter, page) {
    if (state.selfBatchPending) return false;
    const dragged = normalizeSelfEntryValue(draggedValue, page);
    const target = normalizeSelfEntryValue(targetValue, page);
    if (!dragged || !target || dragged === target) return false;
    const selected = selfRuleSelectedValues(page);
    const fromIndex = selected.indexOf(dragged);
    if (fromIndex < 0 || !selected.includes(target)) return false;
    selected.splice(fromIndex, 1);
    const targetIndex = selected.indexOf(target);
    selected.splice(targetIndex + (placeAfter ? 1 : 0), 0, dragged);
    state.selfRuleSelected = selected;
    persistSelfRuleSelection();
    return true;
  }

  function selfEntryQueueMarkup(page, configCompatible) {
    const manualCount = selfEntryManualValues(page).length;
    const filteredCount = selfEntryFilteredValues(page).length;
    const remaining = selfEntryCombinedValues(page);
    const consumedCount = (state.selfEntryQueue.consumedValues || []).length;
    const restoreCount = (state.selfEntryQueue.lastConsumedValues || []).length;
    const batch = state.selfBatchPending ? state.selfBatchValues : currentSelfEntryBatch(page);
    const canFill = page.automationReady && !state.scanning && !state.selfBatchPending && batch.length > 0;
    const batchMarkup = batch.length
      ? `<div class="self-batch">${batch.map((value, index) => `<span>${index + 1}. ${escapeHtml(value)}</span>`).join("")}</div>`
      : `<div class="empty">当前没有待填号码</div>`;
    const hasCurrentPool = currentPoolValues(page).length > 0;
    return `<div class="section"><div class="title"><strong>自编顺序号池</strong><span class="tag">${state.selfBatchPending ? "等待你提交" : `下一组 ${batch.length} / 5`}</span></div>
      ${selfRuleBuilderMarkup(page)}
      <div class="self-manual-title"><strong>手动补充</strong><span>可选</span></div>
      <textarea class="self-pool-input" data-action="manual-self-pool" placeholder="每行或逗号分隔，可填完整号牌或当前前缀后的字符" autocomplete="off" spellcheck="false">${escapeHtml(state.selfEntryDraft)}</textarea>
      <div class="self-pool-meta">手动 ${manualCount} · 规则命中 ${filteredCount} · 待处理 ${remaining.length} · 已处理 ${consumedCount}<br>已选号码优先；没有选择时按规则命中顺序补齐，自动去重。</div>
      ${!configCompatible && !hasCurrentPool ? `<div class="config-warning">工作台地区或号牌类型与页面不一致，且没有当前页本机号池；本轮只使用手动号码。</div>` : ""}
      ${batchMarkup}
      <div class="buttons spaced"><button type="button" data-action="save-self-pool">保存并重新组合</button><button type="button" class="primary" data-action="fill-self-batch" ${canFill ? "" : "disabled"}>按顺序填入本轮（不提交）</button></div>
      <div class="buttons spaced"><button type="button" data-action="restore-self-batch" ${restoreCount && !state.selfBatchPending ? "" : "disabled"}>恢复上一轮备用${restoreCount ? `（${restoreCount} 个）` : ""}</button><button type="button" data-action="reset-self-batch" ${consumedCount ? "" : "disabled"}>重置队列进度</button></div>
      <div class="privacy">插件只点当前白色虚拟键盘并填入最多 5 个意向；验证、确认选号和提交始终由你完成。号池仅保存在本机插件配置中。</div>
    </div>`;
  }

  function statusCopy(page) {
    if (page.kind === "official-unverified") return null;
    if (isOfficialSelectionPage(page)) {
      const environmentLabel = page.kind === "official-live" ? "正式" : "模拟";
      if (hasConfirmForm(page.confirmFields) && page.mode === "entry") {
        return ["ready", "确认信息栏已识别", "可以核对并一键填入本机车辆档案；确认勾选与继续仍由你点击。"];
      }
      if (!page.officialFrameReadable) {
        return ["warn", `官方${environmentLabel}选号壳层已识别，选号 iframe 不可读`, "不填入选号、不采集、不上传。请确认页面已登录并停留在选号页，然后刷新。"];
      }
      if (state.scanning && (page.mode === "self" || page.mode === "random")) {
        return ["ready", "正在读取可编号段", "优先用号段规则快照；确认选号始终由你点击。"];
      }
      if (page.mode === "random") {
        const tipped = page.randomNumbers.filter((value) => classifyNumberTips(value, page).length).length;
        return ["ready", `官方${environmentLabel}随机页已识别`, `已读取 ${page.randomNumbers.length} 个号码，其中 ${tipped} 个符合当前高亮规则。切到自编后才会读取白色键盘；换批、确认选号仍由你点击。`];
      }
      if (page.automationReady) {
        return ["ready", `官方${environmentLabel}自编键盘已识别`, `默认读取可编号段快照；白键对不上才改回逐键。${page.kind === "official-live" ? "正式号池仅保存在本机。" : ""}验证与确认选号始终由你点击。`];
      }
      if (page.mode === "self") {
        return ["warn", `官方${environmentLabel}自编页已识别`, "正在等待你点击开始，并等待可见输入框与可按键盘。确认选号按钮不会被插件点击。"];
      }
      return ["warn", `官方${environmentLabel}选号壳层已识别`, "助手会保持你选择的随机或自编页面；进入自编后才读取可用号池。入口步骤和验证码仍由你完成。"];
    }
    if (page.kind === "official-mock") {
      if (hasConfirmForm(page.confirmFields)) return ["ready", "样机确认信息页已识别", "可以填入本机车辆档案；确认勾选与继续仍由你完成。"];
      if (page.gate !== "SELECTION_READY") return ["warn", "等待用户完成入口步骤", page.gate];
      if (page.mode === "random") return ["ready", "随机选号样机已就绪", `只读读取 ${page.randomNumbers.length} 个号码；勾选的推荐类型会标在页面号码外框上。页面按钮仍由用户点击。`];
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

  function entryNavMarkup() {
    return `<nav class="entry-nav" aria-label="PlateGo 导航">
      <a href="${SHANGHAI_12123_SELECT}" target="_blank" rel="noreferrer">12123 选号站</a>
      <a href="${SHANGHAI_12123_SEGMENT_PUB}" target="_blank" rel="noreferrer">号段公示</a>
      <a href="${workbenchUrl("prefs")}" target="_blank" rel="noreferrer">偏好预设</a>
      <a href="${workbenchUrl("pool")}" target="_blank" rel="noreferrer">号池筛选</a>
    </nav>`;
  }

  function numberTipsMarkup() {
    return `<div class="tips">
      <label class="tip-row"><input type="checkbox" data-action="toggle-number-tip" data-tip="pair" ${state.numberTips.pair ? "checked" : ""}><span>相同数字<small>2 次标框；三连或 AABB 形式增加泛光</small></span></label>
      <input class="tip-filter" data-action="pair-digits" value="${escapeHtml(state.numberTips.pairDigits)}" placeholder="可选：6、8、9；留空高亮全部相同数字" inputmode="numeric" autocomplete="off" ${state.numberTips.pair ? "" : "disabled"}>
      <label class="tip-row"><input type="checkbox" data-action="toggle-number-tip" data-tip="sequence" ${state.numberTips.sequence ? "checked" : ""}><span>顺序号<small>三位连续起；四位连续或 1221 / 12321 回环增加泛光</small></span></label>
      <input class="tip-filter" data-action="sequence-targets" value="${escapeHtml(state.numberTips.sequenceTargets)}" placeholder="可选：123、567、876；留空高亮全部顺序号" inputmode="numeric" autocomplete="off" ${state.numberTips.sequence ? "" : "disabled"}>
      <label class="tip-row"><input type="checkbox" data-action="toggle-number-tip" data-tip="many" ${state.numberTips.many ? "checked" : ""}><span>好多数<small>同一数字 3 次标框；4 次或多个数字同时命中增加泛光</small></span></label>
      <input class="tip-filter" data-action="many-digits" value="${escapeHtml(state.numberTips.manyDigits)}" placeholder="可选：6、8、9；留空高亮全部好多数" inputmode="numeric" autocomplete="off" ${state.numberTips.many ? "" : "disabled"}>
    </div>`;
  }

  function presetRulePage(page) {
    const plateType = page.flowStep === "SELECT" && page.plateType === "small_nev"
      ? "small_nev"
      : page.flowStep === "SELECT" && page.plateType === "small_blue"
        ? "small_blue"
        : state.config.plateType === "small_nev" ? "small_nev" : "small_blue";
    return {
      ...page,
      plateType,
      regionCode: page.regionCode || state.config.regionCode,
      prefix: page.prefix || (plateType === "small_nev" ? "沪" : "沪A"),
      mode: state.presetRuleContext
    };
  }

  function presetRuleBuilderMarkup(page, includeNumberTips = false) {
    const presetPage = presetRulePage(page);
    const context = state.presetRuleContext === "self" ? "self" : "random";
    const patterns = normalizePositionPatterns(state.positionPatterns)
      .filter((pattern) => pattern.plateType === presetPage.plateType);
    const rulesMarkup = patterns.length
      ? patterns.map((pattern, index) => positionPatternMarkup(pattern, index, context)).join("")
      : `<div class="empty compact">还没有规则；可先创建，进入正式选号后直接使用。</div>`;
    return `<div class="section"><div class="rule-builder">
      <div class="rule-builder-title"><div><strong>选号规则预置</strong><span>${presetPage.plateType === "small_nev" ? "新能源 7 位" : "传统燃油车 6 位"} · 本机自动保存</span></div><button type="button" data-action="add-position-pattern" ${state.positionPatterns.length >= MAX_POSITION_PATTERNS ? "disabled" : ""}>新建规则</button></div>
      <div class="rule-context-tabs"><button type="button" class="${context === "random" ? "on" : ""}" data-action="set-preset-rule-context" data-context="random">随机高亮</button><button type="button" class="${context === "self" ? "on" : ""}" data-action="set-preset-rule-context" data-context="self">自编筛选</button></div>
      <div class="rule-help">随机与自编共用规则内容，但分别保存是否启用。现在预置，进入选号页后无需重新设置。</div>
      ${includeNumberTips && context === "random" ? numberTipsMarkup() : ""}
      ${rulesMarkup}
    </div></div>`;
  }

  function landingMarkup() {
    const compose = normalizeComposePrefs(state.config.composePrefs);
    const combos = [...new Set([...SUGGESTED_COMPOSE_COMBINATIONS, ...compose.combinations])];
    const segments = [...new Set([...SUGGESTED_SEGMENTS, ...compose.segments])];
    return `<div class="landing">
      <div class="landing-links">
        <a href="${SHANGHAI_12123_SELECT}" target="_blank" rel="noreferrer"><strong>打开 12123 选号站</strong><span>上海互联网预选号牌模拟入口。登录和确认选号仍由你完成。</span></a>
        <a href="${SHANGHAI_12123_SEGMENT_PUB}" target="_blank" rel="noreferrer"><strong>12123 号段公示</strong><span>官方号池公布页，可能需要先登录。我们不会代你抓取号段。</span></a>
        <a href="${SHANGHAI_12123_HOME}" target="_blank" rel="noreferrer"><strong>上海 12123 首页</strong><span>回到交通安全综合服务管理平台。</span></a>
      </div>
      <div class="pref-grid">
        <div class="pref-card">
          <div class="title"><strong>随机高亮</strong><span class="tag">换批后自动标</span></div>
          <p>随机批次里按这些规则标外框。顺子里的 0 不参与。</p>
          ${numberTipsMarkup()}
        </div>
        <div class="pref-card">
          <div class="title"><strong>自编筛选</strong><span class="tag">带到号池</span></div>
          <p>点选要筛的组合和号段，再到号池创建自己的候选。</p>
          <div class="chips">${combos.map((item) => `<button type="button" class="chip ${compose.combinations.includes(item) ? "on" : ""}" data-action="toggle-compose-combo" data-combo="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>
          <div class="chip-add"><input data-action="compose-custom" placeholder="自定义如 886" autocomplete="off" spellcheck="false"><button type="button" data-action="add-compose-custom">加入</button></div>
          <div class="chips">${segments.map((item) => `<button type="button" class="chip ${compose.segments.includes(item) ? "on" : ""}" data-action="toggle-compose-segment" data-segment="${item}">沪${item}</button>`).join("")}</div>
          <div class="buttons spaced"><a class="primary" href="${workbenchUrl("pool")}" target="_blank" rel="noreferrer" style="display:inline-flex;align-items:center;justify-content:center;min-height:33px;padding:0 10px;border-radius:8px;color:#fff;background:#145c45;text-decoration:none;font-weight:600;font-size:9px">打开号池创建候选</a></div>
        </div>
      </div>
    </div>`;
  }

  function render() {
    const previousShell = mount.querySelector(".shell");
    const previousRuleResults = mount.querySelector(".rule-results");
    if (previousShell instanceof HTMLElement) state.assistantScrollTop = previousShell.scrollTop;
    if (previousRuleResults instanceof HTMLElement) state.ruleResultsScrollTop = previousRuleResults.scrollTop;
    const wasSearchOpen = state.searchOpen;
    syncSearchMode();
    refreshPageHints();
    watchOfficialFrames();
    const page = pageState();
    highlightRandomNumberFrames(page);
    if (isEditingAssistantField() && wasSearchOpen === state.searchOpen) {
      state.renderPaused = true;
      return;
    }
    state.renderPaused = false;
    const status = statusCopy(page);
    const regionCode = selectedRegionCode(page);
    const progress = state.scanning ? 0 : state.graph ? 100 : 0;
    const configCompatible = isConfigCompatible(page);
    const candidates = page.fixtureVerified ? relevantCandidates(page) : [];
    const uploadComplete = Boolean(state.observation && state.uploadedHash === state.observation.observationHash);
    const onConfirmStep = page.flowStep === "CONFIRM_INFO" || state.searchOpen;
    const onSelectStep = page.flowStep === "SELECT" && !state.searchOpen;
    const showVehicleArchive = onConfirmStep || state.searchOpen;
    const showEntryNav = !onSelectStep;
    const showLanding = !onSelectStep && !showVehicleArchive;
    const canFillVehicle = onConfirmStep
      && (page.kind === "official-mock" || isOfficialSelectionPage(page) || page.kind === "official-unverified");
    const regionName = (REGION_OPTIONS.find(([code]) => code === regionCode) || ["310000", "上海"])[1];
    const selectActions = [
      onSelectStep && isOfficialSelectionPage(page) && page.mode === "random"
        ? `<button type="button" class="primary" data-action="capture-random" ${page.randomNumbers.length && !state.scanning ? "" : "disabled"}>将当前随机号码加入本机候选</button>`
        : "",
      onSelectStep && page.mode === "self" && page.kind === "official-mock"
        ? `<button type="button" class="primary" data-action="scan" ${page.automationReady && !state.scanning ? "" : "disabled"}>${state.scanning ? "采集中…" : "开始完整采集"}</button>`
        : ""
    ].filter(Boolean).join("");

    mount.innerHTML = `<div class="shell">
      <div class="head"><span class="mark">P</span><span class="brand"><b>PlateGo 助手</b><small>${escapeHtml(regionName)}</small></span><button type="button" class="close" data-action="hide" title="隐藏" aria-label="隐藏页面助手">×</button></div>
      <div class="body">
        ${showEntryNav ? entryNavMarkup() : ""}
        ${showLanding ? landingMarkup() : ""}
        ${status && onSelectStep ? `<div class="status ${status[0]}" aria-live="polite"><i></i><div><strong>${escapeHtml(status[1])}</strong><span>${escapeHtml(status[2])}</span></div></div>` : ""}
        ${selectActions ? `<div class="buttons">${selectActions}</div>` : ""}

        ${onSelectStep && page.mode === "random" ? `<div class="section"><div class="title"><strong>号码推荐</strong><span class="tag">${page.randomNumbers.length ? `已读 ${page.randomNumbers.length}` : "换一批后自动读取"}</span></div>${numberTipsMarkup()}<div class="tip-legend"><span><i class="pair"></i>相同数字</span><span><i class="sequence"></i>顺序号</span><span><i class="many"></i>好多数</span><span><i class="position"></i>特定规则</span><span>泛光 = 强匹配</span></div>${randomPositionRuleMarkup(page)}</div>` : ""}

        ${onSelectStep && (state.scanning || state.graph) ? `<div class="section"><div class="title"><strong>自编键盘采集</strong><span class="tag">${escapeHtml(state.coverage)}</span></div>${state.scanning ? `<progress class="progress" aria-label="采集进行中"></progress>` : `<progress class="progress" max="100" value="${progress}" aria-label="采集进度"></progress>`}<div class="scan-copy">已走 ${state.scanVisited} 个前缀 · 收集 ${state.terminals.length} 个完整组合<br>${escapeHtml(state.scanReason)}</div>${state.scanning ? `<div class="buttons spaced"><button type="button" class="primary" data-action="pause-scan">暂停读取</button></div>` : ""}</div>` : ""}

        ${onSelectStep && state.diff ? `<div class="section"><div class="title"><strong>候选池变化</strong><span class="tag">${state.diffApplied ? "已确认" : "等待确认"}</span></div><div class="diff"><div><strong>保留 ${state.diff.retained.length}</strong>${list(state.diff.retained)}</div><div class="remove"><strong>移除 ${state.diff.invalid.length}</strong>${list(state.diff.invalid)}</div><div><strong>未知 ${state.diff.unknown.length}</strong>${list(state.diff.unknown)}</div><div class="add"><strong>新增 ${state.diff.added.length}</strong>${list(state.diff.added)}</div></div>${!configCompatible ? `<div class="config-warning">插件工作台当前选择的地区或号牌类型与页面不一致；候选更新和分组填入保持禁用${page.kind === "official-mock" ? "，公共模拟观察仍可单独确认上传" : ""}。</div>` : ""}<div class="buttons spaced"><button type="button" data-action="apply-diff" ${configCompatible && !state.diffApplied ? "" : "disabled"}>${state.diffApplied ? "已更新到插件本机" : "确认更新到插件本机"}</button>${page.kind === "official-mock" ? `<button type="button" class="primary" data-action="upload" ${state.observation && !state.uploadBusy && !uploadComplete ? "" : "disabled"}>${state.uploadBusy ? "上传中…" : uploadComplete ? "公共观察已上传" : "确认上传公共模拟观察"}</button>` : ""}</div></div>` : ""}

        ${onSelectStep && (state.terminals.length || candidates.length) ? `<div class="buttons spaced"><button type="button" data-action="export-pool">导出候选号池</button></div>` : ""}

        ${onSelectStep && page.mode === "self" && (page.candidateInputs.length || isOfficialSelectionPage(page)) ? selfEntryQueueMarkup(page, configCompatible) : ""}

        ${showVehicleArchive ? vehicleArchiveMarkup(page, canFillVehicle) : ""}

        ${!onSelectStep ? presetRuleBuilderMarkup(page, showVehicleArchive) : ""}

        ${state.message ? `<div class="message ${state.messageTone}" aria-live="polite">${escapeHtml(state.message)}</div>` : ""}
        ${state.guide.hint ? `<div class="guide ${state.guide.phase}" aria-live="polite">${escapeHtml(state.guide.hint)}</div>` : ""}
        <div class="check-pop" data-check-pop hidden><canvas></canvas></div>
        <div class="footer-actions"><button type="button" data-action="refresh">重新读取页面</button></div>
      </div>
    </div>`;
    const nextShell = mount.querySelector(".shell");
    const nextRuleResults = mount.querySelector(".rule-results");
    if (nextShell instanceof HTMLElement) nextShell.scrollTop = state.assistantScrollTop;
    if (nextRuleResults instanceof HTMLElement) nextRuleResults.scrollTop = state.ruleResultsScrollTop;
    window.clearTimeout(automationTimer);
    automationTimer = window.setTimeout(() => {
      maybeStartOfficialSelfScan();
    }, 160);
  }

  function canCheckField(key) {
    return Boolean(state.certificatePreview.imageDataUrl && String(state.vehicleDraft[key] || "").trim());
  }

  function searchFieldCard(key) {
    const label = VEHICLE_FIELD_LABELS[key];
    const raw = String(state.vehicleDraft[key] || "").trim();
    const issue = vehicleFieldIssue(key, raw);
    const display = isGroupedVehicleField(key)
      ? (groupedVehicleMarkup(raw) || "未填写")
      : escapeHtml(raw || "未填写");
    return `<div class="search-card ${issue ? "invalid" : ""}"><span>${escapeHtml(label)}</span><b class="${isGroupedVehicleField(key) ? "grouped" : ""}">${display}</b>${issue ? `<div class="draft-issue">请检查：${escapeHtml(issue)}</div>` : ""}<div class="search-card-actions"><button type="button" class="copy-hit" data-action="copy-vehicle" data-field="${key}">${issue ? "检查" : "复制"}</button></div></div>`;
  }

  function vehicleArchiveMarkup(page, canFillVehicle) {
    const records = state.vehicleRecords.records;
    const searchOpen = state.searchOpen;
    const keys = Object.keys(VEHICLE_FIELD_LABELS);
    const dropLabel = state.ocrBusy ? "识别中…" : "拖入合格证照片";
    if (searchOpen) {
      const canFillSearch = Boolean(String(state.vehicleDraft.brand || "").trim() || rawVehicleValue(state.vehicleDraft.model)) && !state.ocrBusy;
      return `<div class="archive">
      <div class="search-pair">${searchFieldCard("brand")}${searchFieldCard("model")}</div>
      <div class="buttons spaced">
        <button type="button" class="primary" data-action="fill-search-both" ${canFillSearch ? "" : "disabled"}>一键填入</button>
      </div>
      <div class="guide">查询窗口已打开。一点即可填入品牌和型号并查询；核对请回确认页看合格证位置。你点确定后，选中的品牌型号会写回本机记录。</div>
    </div>`;
    }
    return `<div class="archive">
      <label class="dropzone" data-dropzone><input type="file" accept="image/*" data-action="ocr-file" ${state.ocrBusy ? "disabled" : ""} aria-label="拖入或选择合格证照片"><strong>${dropLabel}</strong><small>也可点击选择，仅发往 OCR.space，不经过 PlateGo</small></label>
      ${records.length > 1 ? `<select class="draft-select" data-action="select-record">${records.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === state.vehicleRecords.activeId ? "selected" : ""}>${escapeHtml(item.brand || item.certificateNo || item.vin || item.id)}</option>`).join("")}</select>` : ""}
      <div class="draft">
        ${keys.map((key) => {
          const label = VEHICLE_FIELD_LABELS[key];
          const issue = vehicleFieldIssue(key, state.vehicleDraft[key]);
          const grouped = isGroupedVehicleField(key);
          const check = canCheckField(key);
          return `<div class="draft-row"><span>${escapeHtml(label)}</span><input data-draft-field="${key}" class="${issue ? "invalid" : ""} ${grouped ? "grouped" : ""}" value="${escapeHtml(displayVehicleValue(key, state.vehicleDraft[key]))}" autocomplete="off" spellcheck="false"><button type="button" class="copy-hit" data-action="copy-vehicle" data-field="${key}" title="复制">${issue ? "检查" : "复制"}</button>${check ? `<button type="button" class="check-hit" data-action="check-vehicle" data-field="${key}">核对</button>` : `<span></span>`}${issue ? `<div class="draft-issue">请检查：${escapeHtml(issue)}</div>` : ""}</div>`;
        }).join("")}
      </div>
      <div class="buttons spaced">
        <button type="button" class="primary" data-action="fill-vehicle" ${canFillVehicle && !state.ocrBusy ? "" : "disabled"}>一键填入确认页</button>
      </div>
      <div class="guide">品牌型号请先点页面上高亮的「请点此查询」开窗。开窗后一点即可填入品牌和型号。</div>
    </div>`;
  }

  function nativeSetValue(input, value) {
    const view = pageView(input);
    const proto = pageTag(input) === "TEXTAREA"
      ? (view.HTMLTextAreaElement?.prototype || HTMLTextAreaElement.prototype)
      : (view.HTMLInputElement?.prototype || HTMLInputElement.prototype);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    notifyOfficialInput(input);
  }

  function notifyOfficialInput(element) {
    const view = pageView(element);
    const EventCtor = view.Event || Event;
    for (const type of ["input", "change", "keyup", "blur"]) {
      element.dispatchEvent(new EventCtor(type, { bubbles: true }));
    }
    try {
      const jq = view.jQuery || view.$;
      if (typeof jq === "function") {
        const wrapped = jq(element);
        if (wrapped && typeof wrapped.val === "function") {
          wrapped.val(element.value);
          if (typeof wrapped.trigger === "function") {
            wrapped.trigger("input");
            wrapped.trigger("change");
            wrapped.trigger("blur");
          }
        }
      }
    } catch {
      /* ignore */
    }
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

  function officialEnabledKeys(frameDoc) {
    return officialKeyboardKeys(frameDoc).filter((item) => (
      item.classList.contains("active")
      && !item.classList.contains("delete")
      && /^[0-9A-Z]$/.test(officialKeyLabel(item))
    ));
  }

  function officialEnabledLabels(frameDoc) {
    return [...new Set(officialEnabledKeys(frameDoc).map(officialKeyLabel))].sort();
  }

  function officialActiveKeySignature(frameDoc) {
    return officialEnabledLabels(frameDoc).join("");
  }

  let officialIdleKeySignature = "";

  function isOfficialKeyboardResetFlash(signature, suffix) {
    if (!suffix || !signature) return false;
    if (officialIdleKeySignature && signature === officialIdleKeySignature) return true;
    return !/[0-9]/.test(signature) && signature.length >= 20;
  }

  function officialCurrentSuffix(frameDoc, input) {
    if (input && input.isConnected) return officialInputValue(input);
    const active = officialActiveIntentInput(frameDoc);
    return officialInputValue(active);
  }

  function officialInputReached(input, expectedSuffix) {
    const shown = officialInputValue(input);
    if (shown === expectedSuffix) return true;
    if (!expectedSuffix) return !shown;
    return shown.startsWith(expectedSuffix) && shown.length > expectedSuffix.length;
  }

  function officialHasInputSuffix(frameDoc, suffix, input) {
    if (input) return officialInputReached(input, suffix);
    return officialDisplayedSuffixes(frameDoc).includes(suffix);
  }

  const officialKeyWatch = { mutated: false, mutatedAt: 0, disconnect() {} };

  function armOfficialKeyWatch(frameDoc) {
    officialKeyWatch.disconnect();
    officialKeyWatch.mutated = false;
    officialKeyWatch.mutatedAt = 0;
    officialKeyWatch.disconnect = () => {};
    const root = officialKeyboardRoot(frameDoc);
    const view = frameDoc.defaultView || window;
    if (!root || typeof view.MutationObserver !== "function") return;
    const observer = new view.MutationObserver(() => {
      officialKeyWatch.mutated = true;
      officialKeyWatch.mutatedAt = Date.now();
    });
    observer.observe(root, { attributes: true, subtree: true, attributeFilter: ["class"] });
    officialKeyWatch.disconnect = () => observer.disconnect();
  }

  function officialNextFrame(frameDoc) {
    const view = frameDoc.defaultView || window;
    const raf = view.requestAnimationFrame?.bind(view);
    if (!raf) return new Promise((resolve) => window.setTimeout(resolve, 8));
    return new Promise((resolve) => raf(resolve));
  }

  async function officialPause(frameDoc, ms = 80) {
    const started = Date.now();
    while (Date.now() - started < ms) await officialNextFrame(frameDoc);
  }

  async function waitOfficialInputSuffix(frameDoc, expectedSuffix, input, timeout = 900) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (officialHasInputSuffix(frameDoc, expectedSuffix, input)) return true;
      await officialNextFrame(frameDoc);
    }
    return officialHasInputSuffix(frameDoc, expectedSuffix, input);
  }

  async function waitOfficialKeyboardStep(frameDoc, expectedSuffix, previousSignature, timeout = 700, input = null) {
    let lastSignature = "";
    let stableReads = 0;
    const started = Date.now();
    officialKeyWatch.mutated = false;
    officialKeyWatch.mutatedAt = 0;
    await officialNextFrame(frameDoc);
    while (Date.now() - started < timeout) {
      if (!officialHasInputSuffix(frameDoc, expectedSuffix, input)) {
        lastSignature = "";
        stableReads = 0;
        await officialNextFrame(frameDoc);
        continue;
      }
      const signature = officialActiveKeySignature(frameDoc);
      if (isOfficialKeyboardResetFlash(signature, expectedSuffix) && Date.now() - started < 360) {
        lastSignature = "";
        stableReads = 0;
        await officialNextFrame(frameDoc);
        continue;
      }
      if (signature === lastSignature) stableReads += 1;
      else {
        lastSignature = signature;
        stableReads = 0;
      }
      if (stableReads >= 1 && (signature !== previousSignature || officialKeyWatch.mutated || Date.now() - started >= 80)) {
        return true;
      }
      await officialNextFrame(frameDoc);
    }
    return officialHasInputSuffix(frameDoc, expectedSuffix, input);
  }

  async function captureOfficialIdleSignature(frameDoc) {
    const started = Date.now();
    while (Date.now() - started < 500) {
      if (!officialDisplayedSuffixes(frameDoc).some(Boolean)) {
        const signature = officialActiveKeySignature(frameDoc);
        if (signature && !/[0-9]/.test(signature) && signature.length >= 20) {
          officialIdleKeySignature = signature;
          return;
        }
      }
      await officialNextFrame(frameDoc);
    }
    officialIdleKeySignature = officialActiveKeySignature(frameDoc);
  }

  async function readOfficialSettledLabels(frameDoc, prefix, input) {
    await waitOfficialInputSuffix(frameDoc, prefix, input, 900);
    const started = Date.now();
    while (Date.now() - started < 360) {
      const signature = officialActiveKeySignature(frameDoc);
      if (!isOfficialKeyboardResetFlash(signature, prefix)) break;
      await officialNextFrame(frameDoc);
    }
    await officialPause(frameDoc, 80);
    return officialEnabledLabels(frameDoc);
  }

  function focusOfficialIntent(input) {
    if (!isPageElement(input) || input === input.ownerDocument?.activeElement) return;
    try { input.focus(); } catch { /* ignore */ }
  }

  async function pressOfficialCharacter(frameDoc, label, nextSuffix, input) {
    const target = input || officialActiveIntentInput(frameDoc, officialCurrentSuffix(frameDoc));
    focusOfficialIntent(target);
    const previousSignature = officialActiveKeySignature(frameDoc);
    const key = officialEnabledKeys(frameDoc).find((item) => officialKeyLabel(item) === label);
    officialKeyWatch.mutated = false;
    if (!key || !activateSimulationKey(key)) return false;
    if (!await waitOfficialInputSuffix(frameDoc, nextSuffix, target, 900)) return false;
    await officialPause(frameDoc, 80);
    await waitOfficialKeyboardStep(frameDoc, nextSuffix, previousSignature, 700, target);
    return officialHasInputSuffix(frameDoc, nextSuffix, target);
  }

  async function pressOfficialBackspace(frameDoc, previousSuffix, input) {
    const target = input || officialActiveIntentInput(frameDoc);
    focusOfficialIntent(target);
    const previousSignature = officialActiveKeySignature(frameDoc);
    const root = officialKeyboardRoot(frameDoc);
    const backspace = (root || frameDoc).querySelector("li.delete.active");
    officialKeyWatch.mutated = false;
    if (!isPageElement(backspace) || !activateSimulationKey(backspace)) return false;
    if (!await waitOfficialInputSuffix(frameDoc, previousSuffix, target, 900)) return false;
    await officialPause(frameDoc, 80);
    await waitOfficialKeyboardStep(frameDoc, previousSuffix, previousSignature, 700, target);
    return officialHasInputSuffix(frameDoc, previousSuffix, target);
  }

  function looksLikeStartSelection(element) {
    if (!isPageElement(element)) return false;
    if (element.closest("#platego-extension-host, #submit")) return false;
    const text = String(element.getAttribute?.("value") || element.textContent || "").replace(/\s+/g, "");
    if (/确认选号|验证|提交/.test(text)) return false;
    return /开始(?:选号|自编|随机)/.test(text) && text.length <= 8;
  }

  function watchStartSelection() {
    for (const doc of readableDocuments()) {
      const root = doc.documentElement;
      if (!isPageElement(root) || root.dataset.plategoStartWatch) continue;
      root.dataset.plategoStartWatch = "1";
      doc.addEventListener("click", (event) => {
        const target = event.target instanceof Element
          ? event.target.closest("a, button, input, span, div, li")
          : null;
        if (!looksLikeStartSelection(target)) return;
        state.officialPoolScanStarted = false;
      }, true);
    }
  }

  function maybeStartOfficialSelfScan() {
    if (state.scanning || state.searchOpen || state.ocrBusy) return;
    const page = pageState();
    if (!isOfficialSelectionPage(page)) {
      if (page.flowStep !== "SELECT") state.officialPoolScanStarted = false;
      return;
    }
    if (page.flowStep !== "SELECT") {
      state.officialPoolScanStarted = false;
      return;
    }
    if (page.mode !== "self") return;
    if (state.officialPoolScanStarted || !page.automationReady) return;
    state.officialPoolScanStarted = true;
    void scanOfficialSelectionKeyboard();
  }

  function officialSimulationHdArrFromDom(frameDoc) {
    const fzjg = String(frameDoc?.querySelector?.("#fzjg")?.value || "").trim().toUpperCase();
    const stem = fzjg.startsWith("沪") ? fzjg.slice(1) : fzjg.slice(1);
    return sanitizeOfficialHdArr([`${stem}A!@!!`, `${stem}B!@!!`]);
  }

  function probeOfficialRuleSnapshot(frameDoc) {
    const view = frameDoc?.defaultView;
    if (!view) return Promise.resolve(null);
    const nonce = `pg${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    return new Promise((resolve) => {
      const retryTimers = [];
      const cleanup = () => {
        window.clearTimeout(timer);
        retryTimers.forEach((retryTimer) => window.clearTimeout(retryTimer));
        window.removeEventListener("message", onMessage);
      };
      const finish = (value) => {
        cleanup();
        resolve(value);
      };
      const requestSnapshot = () => {
        try {
          view.postMessage({ source: "platego-rule-snapshot-request", nonce }, window.location.origin);
        } catch { /* the timeout keeps this fail-closed */ }
      };
      const timer = window.setTimeout(() => finish(null), 1400);
      function onMessage(event) {
        if (event.source !== view || event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data || data.source !== "platego-rule-snapshot" || data.nonce !== nonce) return;
        finish(officialRuleFieldsSafe(data.payload));
      }
      window.addEventListener("message", onMessage);
      requestSnapshot();
      for (const delay of [120, 360, 760]) retryTimers.push(window.setTimeout(requestSnapshot, delay));
    });
  }

  async function readOfficialRuleSnapshot(frameDoc) {
    const probed = await probeOfficialRuleSnapshot(frameDoc);
    if (probed?.hdArr?.length) return probed;
    const fallback = officialSimulationHdArrFromDom(frameDoc);
    return officialRuleFieldsSafe({
      hdArr: fallback,
      hphmRegexes: [],
      hphmRegexCount: 0,
      filterComplete: false,
      hphmLength: fallback[0]?.length || 0,
      source: "simulation-template-incomplete"
    });
  }

  async function verifyOfficialHdKeys(frameDoc, hdArr, regexes, input) {
    const computed = officialNextHdKeys(hdArr, officialInputValue(input) || "", regexes);
    if (!computed.length) return false;
    const started = Date.now();
    while (Date.now() - started < 1500) {
      if (officialSameKeySet(officialEnabledLabels(frameDoc), computed)) return true;
      await officialPause(frameDoc, 40);
    }
    return officialSameKeySet(officialEnabledLabels(frameDoc), computed);
  }

  async function tryOfficialRuleSnapshotScan(initialPage, frameDoc, scanInput) {
    const snapshot = await readOfficialRuleSnapshot(frameDoc);
    if (!snapshot) {
      state.ruleSnapshotFailure = "未取得官方运行时号段规则";
      return false;
    }
    if (!snapshot.filterComplete) {
      state.ruleSnapshotFailure = "未取得完整灰键过滤规则，默认号段模板不会写入号池";
      return false;
    }
    const regexes = compileOfficialHdRegexes(snapshot.hphmRegexes);
    if (regexes.length !== snapshot.hphmRegexCount) {
      state.ruleSnapshotFailure = "灰键过滤规则无法完整解析，默认号段模板不会写入号池";
      return false;
    }
    if (!await verifyOfficialHdKeys(frameDoc, snapshot.hdArr, regexes, scanInput)) {
      state.ruleSnapshotFailure = "运行时规则与当前白键不一致";
      return false;
    }
    const expanded = expandOfficialHdArr(snapshot.hdArr, regexes, 80_000);
    const terminals = [...new Set(expanded.terminals.filter((item) => /^[A-HJ-NP-Z0-9]+$/.test(item)))].sort();
    if (!terminals.length) return false;
    state.graph = { "": officialNextHdKeys(snapshot.hdArr, "", regexes) };
    state.terminals = terminals;
    state.scanVisited = expanded.visited;
    state.coverage = "segment-snapshot";
    state.scanReason = expanded.truncated
      ? "可编号段快照（已截断）；不是已确认实时可用。确认选号未点击"
      : "可编号段快照；不是已确认实时可用。确认选号未点击";
    state.scanning = false;
    state.scanHold = false;
    try {
      await storageSet({
        platego_official_rule_snapshot: {
          schemaVersion: 2,
          kind: "segment-snapshot",
          regionCode: initialPage.regionCode,
          prefix: officialFixedPrefix(),
          hdArr: snapshot.hdArr,
          hphmRegexes: snapshot.hphmRegexes,
          hphmRegexCount: snapshot.hphmRegexCount,
          filterComplete: true,
          hphmLength: snapshot.hphmLength,
          plateType: snapshot.plateType || initialPage.plateType,
          source: snapshot.source,
          observedAt: new Date().toISOString()
        }
      });
    } catch { /* keep the in-memory snapshot usable */ }
    if (terminals.length > 0) {
      await replaceOfficialLocalPool(initialPage);
      return true;
    }
    state.message = `已生成 ${terminals.length} 个可编号段候选。确认选号未点击。`;
    state.messageTone = "success";
    render();
    return true;
  }

  async function scanOfficialSelectionKeyboard() {
    if (state.scanning) return;
    const initialPage = pageState();
    if (!isOfficialSelectionPage(initialPage) || initialPage.mode !== "self" || !initialPage.automationReady) {
      state.officialPoolScanStarted = false;
      setMessage("官方自编键盘尚未就绪，无法遍历可用号池。", "error");
      return;
    }
    const frameDoc = frameDocument(officialSelectionFrame(initialPage, "self")) || initialPage.candidateInputs[0]?.ownerDocument;
    if (!frameDoc) {
      state.officialPoolScanStarted = false;
      setMessage("自编 iframe 不可读，已停止。", "error");
      return;
    }
    const scanInput = officialActiveIntentInput(frameDoc, "") || officialIntentInputs(frameDoc)[0];
    if (!scanInput) {
      state.officialPoolScanStarted = false;
      setMessage("自编输入框不可读，已停止。", "error");
      return;
    }
    state.scanning = true;
    state.scanHold = false;
    state.scanVisited = 0;
    state.scanReason = "正在读取可编号段规则快照…";
    state.ruleSnapshotFailure = "";
    state.graph = null;
    state.terminals = [];
    state.coverage = "unknown";
    state.observation = null;
    state.message = "正在读取可编号段快照；不是实时占用校验。确认选号不会被点击。";
    state.messageTone = "neutral";
    render();
    try {
      if (await tryOfficialRuleSnapshotScan(initialPage, frameDoc, scanInput)) return;
    } catch { /* fall back to DOM traversal */ }
    if (initialPage.kind === "official-live") {
      state.scanning = false;
      state.scanHold = false;
      state.coverage = "unknown";
      state.scanReason = state.ruleSnapshotFailure || "正式页运行时号段快照不可用";
      state.message = `${state.scanReason}；为避免占用正式选号时间，本次不会逐键遍历。你仍可使用已保存号池或手动号码。`;
      state.messageTone = "error";
      render();
      return;
    }
    state.scanning = true;

    const seen = new Set();
    const transitions = {};
    const terminals = [];
    let hitLimit = false;
    let interrupted = false;
    let failure = "";
    state.scanning = true;
    state.scanHold = false;
    state.scanVisited = 0;
    state.scanReason = `${state.ruleSnapshotFailure || "号段快照与当前白键不一致"}，改回逐键读取。确认选号不会被点击`;
    state.graph = null;
    state.terminals = [];
    state.coverage = "unknown";
    state.observation = null;
    state.uploadedHash = "";
    state.diff = null;
    state.diffApplied = false;
    state.message = `正在遍历官方${initialPage.kind === "official-live" ? "正式" : "模拟"}自编号池；只记录输入框里出现的号码，不点确认选号。`;
    state.messageTone = "neutral";
    render();

    const resolveScanInput = (liveDoc, suffix) => (
      officialIntentInputs(liveDoc).find((item) => officialInputValue(item) === suffix)
      || (scanInput?.isConnected && officialInputValue(scanInput) === suffix ? scanInput : null)
      || officialActiveIntentInput(liveDoc, suffix)
    );

    const harvestOfficialLastKeys = async (liveDoc, boxSuffix, input, targetLength) => {
      if (boxSuffix.length !== targetLength || !/^[A-HJ-NP-Z0-9]+$/.test(boxSuffix)) return;
      await readOfficialSettledLabels(liveDoc, boxSuffix, input);
      for (const complete of officialLastKeyCompletions(liveDoc, boxSuffix)) terminals.push(complete);
    };

    const harvestDisplayed = async (liveDoc, targetLength, input) => {
      const values = [];
      if (input) values.push(officialInputValue(input));
      else values.push(...officialDisplayedSuffixes(liveDoc));
      for (const suffix of values) await harvestOfficialLastKeys(liveDoc, suffix, input, targetLength);
    };

    const visit = async (prefix) => {
      if (state.scanHold) return;
      if (seen.size >= MAX_OFFICIAL_SCAN_NODES) {
        hitLimit = true;
        return;
      }
      const currentPage = pageState();
      if (!isOfficialSelectionPage(currentPage) || currentPage.kind !== initialPage.kind || currentPage.mode !== "self") {
        interrupted = true;
        return;
      }
      const liveDoc = frameDocument(officialSelectionFrame(currentPage, "self")) || frameDoc;
      const input = resolveScanInput(liveDoc, prefix);
      const shown = input ? officialInputValue(input) : "";
      if (!liveDoc || !input) {
        interrupted = true;
        return;
      }
      if (shown !== prefix && !officialHasInputSuffix(liveDoc, prefix, input)) {
        if (shown.startsWith(prefix) && shown.length > prefix.length) {
          const targetLength = currentPage.targetLength || initialPage.targetLength;
          if (shown.length === targetLength) await harvestOfficialLastKeys(liveDoc, shown, input, targetLength);
          return;
        }
        interrupted = true;
        return;
      }
      if (seen.has(prefix)) return;
      seen.add(prefix);
      state.scanVisited = seen.size;
      const targetLength = currentPage.targetLength || initialPage.targetLength;
      await harvestDisplayed(liveDoc, targetLength, input);
      if (prefix.length === targetLength) {
        await harvestOfficialLastKeys(liveDoc, officialInputValue(input) || prefix, input, targetLength);
        return;
      }

      const labels = await readOfficialSettledLabels(liveDoc, prefix, input);
      transitions[prefix] = labels;
      if (!labels.length) return;
      for (const label of labels) {
        if (hitLimit || interrupted || state.scanHold) break;
        const liveKeys = officialEnabledLabels(liveDoc);
        if (!liveKeys.includes(label)) continue;
        const next = prefix + label;
        if (!await pressOfficialCharacter(liveDoc, label, next, input)) {
          if (officialHasInputSuffix(liveDoc, next, input)) {
            if (!await pressOfficialBackspace(liveDoc, prefix, input)) {
              interrupted = true;
              break;
            }
          }
          continue;
        }
        await harvestDisplayed(liveDoc, targetLength, input);
        const accepted = officialInputValue(input);
        if (accepted.length === targetLength) {
          await harvestOfficialLastKeys(liveDoc, accepted, input, targetLength);
        } else if (accepted === next || accepted.startsWith(next)) {
          await visit(accepted || next);
        } else {
          await visit(next);
        }
        const filled = resolveScanInput(liveDoc, next);
        if (filled && officialInputValue(filled) === next) {
          if (!await pressOfficialBackspace(liveDoc, prefix, filled)) {
            interrupted = true;
            break;
          }
        } else if (officialInputValue(input) !== prefix && !officialHasInputSuffix(liveDoc, prefix, input)) {
          interrupted = true;
          break;
        }
      }
      if (seen.size % 32 === 0) render();
    };

    try {
      armOfficialKeyWatch(frameDoc);
      await clearOfficialIntent(frameDoc);
      await officialPause(frameDoc, 72);
      await captureOfficialIdleSignature(frameDoc);
      await officialPause(frameDoc, 72);
      await visit("");
      await harvestDisplayed(frameDoc, initialPage.targetLength, scanInput);
    } catch (error) {
      failure = error instanceof Error ? error.message : "采集异常";
    } finally {
      officialKeyWatch.disconnect();
      officialIdleKeySignature = "";
    }

    const held = state.scanHold;
    state.scanning = false;
    state.scanHold = false;
    state.graph = transitions;
    state.terminals = [...new Set(terminals)].sort();
    if (held && state.terminals.length > 0) {
      state.coverage = "partial";
      state.scanReason = "已暂停读取；已保存当前读到的号码";
    } else if (!failure && !hitLimit && !interrupted && state.terminals.length > 0) {
      state.coverage = "complete";
      state.scanReason = "白色按键已走完；确认选号未点击";
    } else if (state.terminals.length > 0) {
      state.coverage = "partial";
      state.scanReason = failure || (hitLimit ? `达到防死循环上限 ${MAX_OFFICIAL_SCAN_NODES} 个前缀` : "页面状态在采集中发生变化");
    } else {
      state.coverage = "unknown";
      state.scanReason = failure || (held ? "已暂停读取，尚未形成完整号码" : (interrupted ? "页面状态在采集中发生变化" : "未形成可确认的完整组合"));
    }
    state.observation = null;
    if (state.terminals.length > 0) {
      await replaceOfficialLocalPool(initialPage);
      return;
    }
    state.message = "自编号池未形成可保存的完整号码。确认选号未点击。";
    state.messageTone = failure ? "error" : "neutral";
    render();
  }

  async function scanKeyboard() {
    if (state.scanning) return;
    const initialPage = pageState();
    if (isOfficialSelectionPage(initialPage)) {
      void scanOfficialSelectionKeyboard();
      return;
    }
    if (initialPage.kind !== "official-mock" || !initialPage.automationReady) {
      setMessage("完整键盘采集只开放给本地样机和已验收的官方自编页。", "error");
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
    state.scanHold = false;
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
      if (state.scanHold) return;
      if (seen.size >= MAX_MOCK_SCAN_NODES) {
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
        if (hitLimit || interrupted || state.scanHold) break;
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

    const held = state.scanHold;
    state.scanning = false;
    state.scanHold = false;
    state.graph = transitions;
    state.terminals = [...new Set(terminals)].sort();
    if (held && state.terminals.length > 0) {
      state.coverage = "partial";
      state.scanReason = "已暂停读取；已保存当前读到的号码";
    } else if (!failure && !hitLimit && !interrupted && state.terminals.length > 0) {
      state.coverage = "complete";
      state.scanReason = "全部可达前缀已遍历，原输入值已恢复";
    } else if (state.terminals.length > 0) {
      state.coverage = "partial";
      state.scanReason = failure || (hitLimit ? `达到 ${MAX_MOCK_SCAN_NODES} 个前缀上限` : "页面状态在采集中发生变化");
    } else {
      state.coverage = "unknown";
      state.scanReason = failure || (held ? "已暂停读取，尚未形成完整号码" : (interrupted ? "页面状态在采集中发生变化" : "未形成可确认的完整组合"));
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
      setMessage("候选更新条件不满足；请确认页面识别以及工作台地区和号牌类型。", "error");
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

  async function replaceOfficialLocalPool(page) {
    const now = new Date().toISOString();
    const observed = [...new Set(state.terminals.map((suffix) => `${page.prefix}${suffix}`))]
      .sort((left, right) => score(right) - score(left) || left.localeCompare(right));
    const previous = [...new Set((state.config.orderedCandidates || []).map((item) => String(item.value).toUpperCase()))];
    const observedSet = new Set(observed);
    const nextConfig = {
      ...state.config,
      regionCode: page.regionCode || state.config.regionCode,
      plateType: page.plateType || state.config.plateType,
      orderedCandidates: observed.map((value, index) => ({
        id: `capture-${Date.now().toString(36)}-${index}`,
        value,
        source: "capture",
        score: score(value),
        createdAt: now
      })),
      exportedAt: now
    };
    const capturedPool = {
      schemaVersion: 1,
      namespace: page.kind === "official-live" ? "live-local" : "simulation",
      regionCode: nextConfig.regionCode,
      plateType: nextConfig.plateType,
      prefix: page.prefix,
      coverage: state.coverage,
      observedAt: now,
      values: observed
    };
    const valuesText = observed.join("\n").slice(0, MAX_POOL_SNAPSHOT_TEXT);
    const snapshotId = `${capturedPool.regionCode}-${capturedPool.plateType}-${fnv1a(`${capturedPool.namespace}|${capturedPool.prefix}|${valuesText}`).toString(16)}`;
    const nextSnapshots = normalizePoolSnapshots({
      schemaVersion: 1,
      snapshots: [{
        id: snapshotId,
        regionCode: capturedPool.regionCode,
        plateType: capturedPool.plateType,
        prefix: capturedPool.prefix,
        source: capturedPool.namespace,
        coverage: capturedPool.coverage,
        observedAt: now,
        count: observed.length,
        valuesText
      }, ...state.poolSnapshots.filter((item) => item.id !== snapshotId)]
    });
    try {
      await storageSet({
        platego_config: nextConfig,
        platego_config_updated_at: now,
        platego_captured_pool: capturedPool
      });
      state.config = nextConfig;
      state.capturedPool = capturedPool;
      state.selfRuleMatchCache = { key: "", values: [] };
      let archiveSaved = false;
      try {
        await storageSet({
          [POOL_SNAPSHOTS_STORAGE_KEY]: { schemaVersion: 1, snapshots: nextSnapshots }
        });
        state.poolSnapshots = nextSnapshots;
        archiveSaved = true;
      } catch {
        /* The newest pool remains available even if rolling history exceeds the browser quota. */
      }
      state.diff = {
        retained: previous.filter((value) => observedSet.has(value)),
        invalid: previous.filter((value) => !observedSet.has(value)),
        unknown: [],
        added: observed.filter((value) => !previous.includes(value))
      };
      state.diffApplied = true;
      state.message = state.coverage === "segment-snapshot"
        ? `已用 ${observed.length} 个可编号段候选刷新本机号池。这不是已确认实时可用。${archiveSaved ? `最近 ${nextSnapshots.length} 份读取已保存在本机。` : "最新一份已保存在本机。"}`
        : `已用本次读取的 ${observed.length} 个号码刷新本机号池${state.coverage === "complete" ? "（完整）" : "（尚未走完）"}。${archiveSaved ? `最近 ${nextSnapshots.length} 份读取已保存在本机。` : "最新一份已保存在本机。"}`;
      state.messageTone = "success";
    } catch (error) {
      state.message = `本机号池刷新失败：${error instanceof Error ? error.message : "未知错误"}`;
      state.messageTone = "error";
    }
    render();
  }

  function currentPoolValues(page) {
    if (state.terminals.length && !state.scanning) {
      return [...new Set(state.terminals.map((suffix) => `${page.prefix}${suffix}`))];
    }
    if (state.capturedPool
      && state.capturedPool.regionCode === page.regionCode
      && state.capturedPool.plateType === page.plateType) {
      return state.capturedPool.values;
    }
    if (!isConfigCompatible(page)) return [];
    return relevantCandidates(page).map((item) => String(item.value || "").toUpperCase()).filter(Boolean);
  }

  function exportCandidatePool() {
    const page = pageState();
    const values = currentPoolValues(page);
    if (!values.length) {
      setMessage("还没有可导出的候选号池。", "error");
      return;
    }
    const payload = {
      kind: "platego-candidate-pool",
      regionCode: page.regionCode || state.config.regionCode,
      plateType: page.plateType || state.config.plateType,
      prefix: page.prefix,
      coverage: state.coverage,
      availability: state.coverage === "segment-snapshot" ? "segment-snapshot" : state.coverage,
      disclaimer: state.coverage === "segment-snapshot" ? "可编号段快照/候选组合，不是已确认实时可用" : "",
      exportedAt: new Date().toISOString(),
      count: values.length,
      values
    };
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `PlateGo-pool-${payload.regionCode}-${values.length}.json`;
    anchor.rel = "noopener";
    nativeElementClick(anchor);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    state.message = `已导出 ${values.length} 个候选号码。`;
    state.messageTone = "success";
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
    if (page.kind !== "official-mock") {
      setMessage("官方主机禁止上传公共观察。", "error");
      return;
    }
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

  async function clearOfficialIntent(frameDoc) {
    for (let step = 0; step < 24; step += 1) {
      const input = officialIntentInputs(frameDoc).find((item) => officialInputValue(item))
        || officialActiveIntentInput(frameDoc);
      const current = officialInputValue(input);
      if (!current) return;
      if (!await pressOfficialBackspace(frameDoc, current.slice(0, -1), input)) break;
    }
  }

  async function fillOfficialSuffix(frameDoc, suffix) {
    await clearOfficialIntent(frameDoc);
    const input = officialActiveIntentInput(frameDoc, "") || officialIntentInputs(frameDoc)[0];
    let written = "";
    for (const character of suffix) {
      written += character;
      if (!await pressOfficialCharacter(frameDoc, character, written, input)) {
        throw new Error(`当前键盘未开放 ${character}，已停止以免误点确认`);
      }
    }
  }

  async function saveSelfEntryPool() {
    const page = pageState();
    if (page.flowStep !== "SELECT" || page.mode !== "self") {
      setMessage("请先进入自编选号页，再保存自选号池。", "error");
      return;
    }
    const parsed = parseSelfEntryDraft(state.selfEntryDraft, page);
    if (state.selfEntryDraft.trim() && !parsed.values.length) {
      setMessage(`没有识别到符合当前号牌长度的号码；请填完整号牌或 ${officialCompleteLength(page)} 位后缀。`, "error");
      return;
    }
    const now = new Date().toISOString();
    const preserveProgress = selfEntryQueueMatchesPage(page);
    state.selfEntryQueue = {
      schemaVersion: 1,
      regionCode: page.regionCode || "310000",
      plateType: page.plateType || "",
      prefix: page.prefix || "",
      manualValues: parsed.values,
      consumedValues: preserveProgress ? state.selfEntryQueue.consumedValues : [],
      lastConsumedValues: preserveProgress ? state.selfEntryQueue.lastConsumedValues : [],
      updatedAt: now
    };
    state.selfEntryDraft = parsed.values.join("\n");
    state.selfBatchPending = false;
    state.selfBatchValues = [];
    state.selfBatchRemainingBefore = null;
    try {
      await storageSet({ platego_self_entry_queue: state.selfEntryQueue });
      const filteredCount = selfEntryFilteredValues(page).length;
      const rejectedCopy = parsed.rejected.length ? `；忽略 ${parsed.rejected.length} 项格式不符内容` : "";
      state.message = `已在本机保存 ${parsed.values.length} 个手动号码，并与 ${filteredCount} 个筛选候选重新组合、去重${rejectedCopy}。`;
      state.messageTone = "success";
    } catch (error) {
      state.message = `自选号池保存失败：${error instanceof Error ? error.message : "未知错误"}`;
      state.messageTone = "error";
    }
    render();
  }

  async function appendOfficialIntentSuffix(frameDoc, suffix) {
    let input = officialActiveIntentInput(frameDoc) || officialIntentInputs(frameDoc)[0];
    if (!input) throw new Error("当前意向输入框不可读，已停止");
    let current = officialInputValue(input);
    if (current && !suffix.startsWith(current)) {
      await clearOfficialIntent(frameDoc);
      input = officialActiveIntentInput(frameDoc, "") || officialIntentInputs(frameDoc)[0];
      current = officialInputValue(input);
    }
    if (!input || !suffix.startsWith(current)) {
      throw new Error("当前意向已有不同内容，请先由你清空或提交后再试");
    }
    for (const character of suffix.slice(current.length)) {
      current += character;
      if (!await pressOfficialCharacter(frameDoc, character, current, input)) {
        throw new Error(`当前键盘未开放 ${character}，已停止；不会点击确认选号`);
      }
    }
  }

  async function waitOfficialIntentBatch(frameDoc, suffixes, timeout = 1600) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const shown = officialIntentSlotSuffixes(frameDoc);
      if (suffixes.every((suffix, index) => shown[index] === suffix)) return true;
      await officialNextFrame(frameDoc);
    }
    const shown = officialIntentSlotSuffixes(frameDoc);
    return suffixes.every((suffix, index) => shown[index] === suffix);
  }

  async function fillOfficialSelfEntryBatch(page, batch) {
    const frameDoc = page.candidateInputs[0]?.ownerDocument || frameDocument(officialSelectionFrame(page, "self"));
    if (!frameDoc) throw new Error("自编 iframe 在填入前消失");
    const expectedLength = officialCompleteLength(page);
    const suffixes = batch.map((value) => value.slice(page.prefix.length));
    if (suffixes.some((value) => value.length !== expectedLength)) {
      throw new Error("本轮号码长度与当前号牌类型不一致");
    }
    const existing = officialIntentSlotSuffixes(frameDoc);
    let completed = 0;
    for (let index = 0; index < existing.length && index < batch.length; index += 1) {
      if (existing[index].length !== expectedLength) break;
      if (existing[index] !== suffixes[index]) {
        throw new Error("页面已有的完整意向与本轮队列不同，请先由你提交或重新开始本轮");
      }
      completed += 1;
    }
    for (let index = completed; index < suffixes.length; index += 1) {
      await appendOfficialIntentSuffix(frameDoc, suffixes[index]);
      if (!await waitOfficialIntentBatch(frameDoc, suffixes.slice(0, index + 1))) {
        throw new Error(`第 ${index + 1} 个意向未稳定写入，已停止；不会点击确认选号`);
      }
    }
  }

  async function fillSelfEntryBatch() {
    const page = pageState();
    if (state.selfBatchPending) {
      setMessage("本轮已填完，请由你提交；检测到剩余自编次数变化后会自动准备下一组。", "error");
      return;
    }
    if (page.flowStep !== "SELECT" || page.mode !== "self" || !page.automationReady || state.scanning) {
      setMessage("当前自编键盘尚未通过本地填入门，操作已安全停止。", "error");
      return;
    }
    const batch = currentSelfEntryBatch(page);
    if (!batch.length) {
      setMessage("当前队列为空，请先手动输入号码或在工作台生成筛选候选。", "error");
      return;
    }
    try {
      if (isOfficialSelectionPage(page)) {
        await fillOfficialSelfEntryBatch(page, batch);
      } else if (page.kind === "official-mock") {
        for (let index = 0; index < batch.length; index += 1) {
          const suffix = batch[index].slice(page.prefix.length);
          const input = page.candidateInputs[index];
          if (!input?.isConnected) throw new Error(`第 ${index + 1} 个样机输入框在填入前消失`);
          await writeProbe(input, suffix);
        }
      } else {
        throw new Error("当前页面不是已验收的官方自编页");
      }
      state.selfBatchPending = true;
      state.selfBatchValues = batch;
      state.selfBatchRemainingBefore = readSelfComposeRemaining(page);
      state.message = `已按顺序填入本轮 ${batch.length} 个意向。请由你亲自提交；检测到提交回执后会自动准备下一组，插件不会点击验证、确认选号或提交。`;
      state.messageTone = "success";
    } catch (error) {
      state.message = error instanceof Error ? error.message : "本轮填入已安全停止";
      state.messageTone = "error";
    }
    render();
  }

  async function advanceSelfEntryBatch(automatic = false) {
    if (!state.selfBatchPending || !state.selfBatchValues.length) {
      if (!automatic) setMessage("当前没有等待处理的自编批次。", "error");
      return false;
    }
    const completedBatch = [...state.selfBatchValues];
    const processed = new Set(state.selfBatchValues.map(normalizeStoredPlate).filter(Boolean));
    state.selfEntryQueue = {
      ...state.selfEntryQueue,
      consumedValues: [...new Set([...(state.selfEntryQueue.consumedValues || []), ...state.selfBatchValues])],
      lastConsumedValues: completedBatch,
      updatedAt: new Date().toISOString()
    };
    state.selfRuleSelected = state.selfRuleSelected.filter((value) => !processed.has(normalizeStoredPlate(value)));
    state.selfBatchPending = false;
    state.selfBatchValues = [];
    state.selfBatchRemainingBefore = null;
    persistSelfEntryQueue();
    persistSelfRuleSelection();
    const nextCount = currentSelfEntryBatch(pageState()).length;
    state.message = nextCount
      ? `${automatic ? "已检测到你的提交回执；" : ""}本轮已从本机队列划走，下一组已重新组合（${nextCount} 个）。`
      : `${automatic ? "已检测到你的提交回执；" : ""}本轮已从本机队列划走，当前没有更多待填号码。`;
    state.messageTone = "success";
    render();
    return true;
  }

  async function maybeAdvanceSubmittedSelfBatch() {
    if (!state.selfBatchPending || !state.selfBatchValues.length || state.selfBatchAdvanceBusy) return;
    const page = pageState();
    if (page.flowStep !== "SELECT" || page.mode !== "self") return;
    const remaining = readSelfComposeRemaining(page);
    if (!Number.isInteger(remaining)) return;
    if (!Number.isInteger(state.selfBatchRemainingBefore)) {
      state.selfBatchRemainingBefore = remaining;
      return;
    }
    if (remaining >= state.selfBatchRemainingBefore) return;
    state.selfBatchAdvanceBusy = true;
    try {
      await advanceSelfEntryBatch(true);
    } finally {
      state.selfBatchAdvanceBusy = false;
    }
  }

  function restorePreviousSelfEntryBatch() {
    if (state.selfBatchPending) {
      setMessage("当前一轮仍等待你提交，暂时不能恢复上一轮。", "error");
      return;
    }
    const restored = [...new Set((state.selfEntryQueue.lastConsumedValues || []).map(normalizeStoredPlate).filter(Boolean))];
    if (!restored.length) {
      setMessage("当前没有可恢复的上一轮。", "error");
      return;
    }
    const restoredSet = new Set(restored);
    state.selfEntryQueue = {
      ...state.selfEntryQueue,
      consumedValues: (state.selfEntryQueue.consumedValues || []).filter((value) => !restoredSet.has(normalizeStoredPlate(value))),
      lastConsumedValues: [],
      updatedAt: new Date().toISOString()
    };
    const page = pageState();
    const available = new Set(selfRuleMatchedValues(page));
    state.selfRuleSelected = [...new Set([
      ...restored.filter((value) => available.has(value)),
      ...state.selfRuleSelected
    ])];
    state.selfBatchRemainingBefore = null;
    persistSelfEntryQueue();
    persistSelfRuleSelection();
    state.message = `已恢复上一轮 ${restored.length} 个号码到待处理队列，可重新调整或作为备用。`;
    state.messageTone = "success";
    render();
  }

  function resetSelfEntryBatch() {
    state.selfEntryQueue = {
      ...state.selfEntryQueue,
      consumedValues: [],
      lastConsumedValues: [],
      updatedAt: new Date().toISOString()
    };
    state.selfBatchPending = false;
    state.selfBatchValues = [];
    state.selfBatchRemainingBefore = null;
    persistSelfEntryQueue();
    state.message = "已重置本机自选号池进度，并按“手动优先、筛选随后”重新组合。";
    state.messageTone = "success";
    render();
  }

  async function captureRandomCandidates() {
    const page = pageState();
    if (!isOfficialSelectionPage(page) || page.mode !== "random" || !page.randomNumbers.length) {
      setMessage("当前没有可加入的官方随机号码。", "error");
      return;
    }
    const observed = page.randomNumbers.map((value) => value.toUpperCase());
    const previous = [...new Set(relevantCandidates(page).map((item) => String(item.value).toUpperCase()))];
    state.diff = {
      retained: previous.filter((value) => observed.includes(value)),
      invalid: [],
      unknown: [],
      added: observed.filter((value) => !previous.includes(value))
    };
    state.diffApplied = false;
    state.observation = null;
    state.message = `已读取 ${observed.length} 个官方${page.kind === "official-live" ? "正式" : "模拟"}随机号码。请确认是否更新到插件本机候选；不会上传，也不会点击页面按钮。`;
    state.messageTone = "success";
    render();
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
    try {
      if (isOfficialSelectionPage(page)) {
        const frameDoc = page.candidateInputs[0]?.ownerDocument;
        if (!frameDoc) throw new Error("自编 iframe 在填入前消失");
        const full = String(group[0]?.value || "").toUpperCase();
        const suffix = full.startsWith(page.prefix) ? full.slice(page.prefix.length) : "";
        if (suffix.length !== officialCompleteLength(page)) {
          throw new Error("候选后缀长度与当前号牌类型不一致");
        }
        const boxed = suffix.slice(0, page.targetLength);
        const extra = suffix.slice(page.targetLength);
        await fillOfficialSuffix(frameDoc, boxed);
        for (const character of extra) {
          const key = officialEnabledKeys(frameDoc).find((item) => officialKeyLabel(item) === character);
          if (!key || !activateSimulationKey(key)) {
            throw new Error(`当前键盘未开放末位 ${character}，已停止以免误点确认`);
          }
          await officialPause(frameDoc, 80);
        }
        state.message = `已按可按键填入当前意向 ${full}。请由你切换下一意向或亲自确认选号；插件不会点击验证或提交。`;
      } else {
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
      }
      state.messageTone = "success";
    } catch (error) {
      state.message = error instanceof Error ? error.message : "填入已安全停止";
      state.messageTone = "error";
    }
    render();
  }

  function canWriteVehicle(page) {
    if (page.flowStep !== "CONFIRM_INFO") return false;
    if (!(page.kind === "official-mock" || isOfficialSelectionPage(page) || page.kind === "official-unverified")) {
      return false;
    }
    return hasConfirmForm(page.confirmFields) || hasConfirmForm(allVehicleFields());
  }

  function selectClosestOption(select, value, key) {
    const normalized = String(value || "").trim();
    if (!normalized) return false;
    const options = [...select.options];
    const exact = options.find((option) => option.value === normalized || option.text.trim() === normalized);
    if (exact) {
      select.value = exact.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    const fuzzy = options.find((option) => option.text.includes(normalized) || normalized.includes(option.text.trim()));
    if (fuzzy) {
      select.value = fuzzy.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    if (key === "plateKind") {
      const nev = /新能源|纯电动|燃料电池|插电/.test(normalized);
      const match = options.find((option) => nev ? /新能源|纯电动/.test(option.text) : /小型汽车/.test(option.text) && !/新能源/.test(option.text));
      if (match) {
        select.value = match.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  async function saveVehicleDraft(source) {
    const now = new Date().toISOString();
    const current = state.vehicleRecords.records.find((item) => item.id === state.vehicleRecords.activeId);
    const record = {
      id: current?.id || `veh-${Date.now().toString(36)}`,
      updatedAt: now,
      source: source || current?.source || "manual",
      plateKind: String(state.vehicleDraft.plateKind || "").trim().slice(0, 40),
      brand: String(state.vehicleDraft.brand || "").trim().slice(0, 40),
      model: rawVehicleValue(state.vehicleDraft.model).toUpperCase().slice(0, 40),
      certificateNo: rawVehicleValue(state.vehicleDraft.certificateNo).slice(0, 40),
      vin: rawVehicleValue(state.vehicleDraft.vin).toUpperCase().slice(0, 20)
    };
    if (!isEditingDraft()) state.vehicleDraft = draftFromRecord(record);
    const records = [record, ...state.vehicleRecords.records.filter((item) => item.id !== record.id)].slice(0, 10);
    state.vehicleRecords = { schemaVersion: 1, activeId: record.id, records };
    await storageSet({ platego_vehicle_records: state.vehicleRecords });
    const plateType = inferredPlateType(record.plateKind);
    if (plateType && plateType !== state.config.plateType) {
      const nextConfig = { ...state.config, plateType, exportedAt: now };
      await storageSet({ platego_config: nextConfig, platego_config_updated_at: now });
      state.config = nextConfig;
    }
  }

  let vehicleSaveTimer = 0;
  function queueVehicleSave(source) {
    window.clearTimeout(vehicleSaveTimer);
    vehicleSaveTimer = window.setTimeout(() => {
      void saveVehicleDraft(source);
    }, 280);
  }

  async function copyVehicleField(key, button) {
    const value = isGroupedVehicleField(key)
      ? rawVehicleValue(state.vehicleDraft[key])
      : String(state.vehicleDraft[key] || "").trim();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      if (button instanceof HTMLButtonElement) {
        const original = button.textContent;
        button.textContent = "已复制";
        window.setTimeout(() => {
          if (button.isConnected) button.textContent = original;
        }, 800);
      }
    } catch {
      setMessage("复制失败，请手动选择文本。", "error");
    }
  }

  function compactNodeText(element) {
    return String(element?.textContent || element?.value || "").replace(/\s+/g, "");
  }

  function isForbiddenPageAction(element) {
    if (!isPageElement(element)) return true;
    const text = compactNodeText(element);
    const hint = `${element.id} ${element.className} ${element.getAttribute("name") || ""}`;
    return element.id === "submit"
      || Boolean(element.closest("#submit, .btns"))
      || /提交|确认选号|验证|开始选号|阅读并同意/.test(text)
      || /submit|confirmSelection|validate/i.test(hint);
  }

  function isBrandSearchOpener(element) {
    if (element?.id === "btnPpxh" || element?.getAttribute?.("data-label") === "请点此查询选择车辆品牌型号") {
      return !isForbiddenPageAction(element);
    }
    const text = compactNodeText(element);
    return /请点此查询|查询选择车辆品牌型号|选择车辆品牌型号/.test(text) && !isForbiddenPageAction(element);
  }

  function isBrandQueryButton(element) {
    const text = compactNodeText(element);
    if (/条件|结果|列表|确认|提交|请点此|选择车辆|关闭/.test(text)) return false;
    return /^(查询|搜索)$/.test(text);
  }

  function findBrandSearchOpener(docs) {
    const hits = [];
    for (const doc of docs) {
      if (!doc?.querySelectorAll) continue;
      const named = doc.querySelector("#btnPpxh");
      if (named && isBrandSearchOpener(named)) hits.push(named);
      for (const element of doc.querySelectorAll("a, button, input[type=button], span, em, u, font, td, div")) {
        if (isBrandSearchOpener(element)) hits.push(element);
      }
    }
    hits.sort((left, right) => compactNodeText(left).length - compactNodeText(right).length);
    return hits[0] || null;
  }

  function searchRootText(root) {
    return String(root.innerText || root.textContent || "");
  }

  function looksLikeConfirmPage(root) {
    const compact = searchRootText(root).replace(/\s+/g, "");
    return /确认信息/.test(compact) && /请点此查询/.test(compact);
  }

  function looksLikeBrandSearchChrome(root) {
    if (!root?.querySelectorAll || looksLikeConfirmPage(root)) return false;
    const compact = searchRootText(root).replace(/\s+/g, "");
    if (!compact || /404NotFound/i.test(compact) || /请点此查询/.test(compact)) return false;
    if (root.querySelector("#formsearch") || root.querySelector("iframe[src*='queryPpxh']") || findDirectSearchInput(root, "brand") || findDirectSearchInput(root, "model")) {
      return true;
    }
    return /选择车辆品牌型号|查询选择车辆品牌/.test(compact)
      || (/车辆品牌|中文品牌/.test(compact) && /车辆型号/.test(compact))
      || (/请输入车辆品牌/.test(compact) && /请输入车辆型号/.test(compact));
  }

  function isBrandSearchWorkspace(root) {
    if (!root?.querySelectorAll || looksLikeConfirmPage(root)) return false;
    const compact = searchRootText(root).replace(/\s+/g, "");
    if (/404NotFound/i.test(compact)) return false;
    if (!findBrandQueryButton(root)) return false;
    return Boolean(findSearchInput(root, "brand") || findSearchInput(root, "model"));
  }

  function brandSearchRoots() {
    const roots = [];
    const seen = new Set();
    function add(root) {
      if (!root || seen.has(root) || !isBrandSearchWorkspace(root)) return;
      seen.add(root);
      roots.push(root);
    }
    for (const doc of readableDocuments()) {
      add(doc.body);
      for (const layer of doc.querySelectorAll(".window, .dialog, .layui-layer, .modal, .easyui-dialog, [role='dialog'], .window-body, .aui_dialog, .aui_content, .aui_outer")) {
        add(layer);
      }
    }
    return roots.sort((left, right) => {
      const score = (root) => Number(Boolean(findSearchInput(root, "brand"))) + Number(Boolean(findSearchInput(root, "model")));
      return score(right) - score(left);
    });
  }

  function brandSearchChromeRoots() {
    const roots = [];
    const seen = new Set();
    function add(root) {
      if (!root || seen.has(root) || !looksLikeBrandSearchChrome(root)) return;
      seen.add(root);
      roots.push(root);
    }
    for (const doc of readableDocuments()) {
      add(doc.body);
      for (const layer of doc.querySelectorAll(".window, .dialog, .layui-layer, .modal, .easyui-dialog, [role='dialog'], .window-body, .window-header, .aui_dialog, .aui_content, .aui_outer")) {
        add(layer);
      }
    }
    return roots;
  }

  function searchUiRoots() {
    const roots = [];
    const seen = new Set();
    function add(root) {
      if (!root || seen.has(root)) return;
      seen.add(root);
      roots.push(root);
    }
    for (const doc of queryPpxhDocuments()) add(doc.body || doc.documentElement);
    for (const root of [...brandSearchRoots(), ...brandSearchChromeRoots()]) add(root);
    return roots;
  }

  function clearPageHints() {
    for (const doc of readableDocuments()) {
      for (const element of doc.querySelectorAll("[data-platego-next-action]")) {
        element.removeAttribute("data-platego-next-action");
      }
    }
  }

  function hintPageElement(element) {
    if (!isPageElement(element) || isForbiddenPageAction(element)) return;
    const text = compactNodeText(element);
    if (/^(查询|搜索|确定|关闭|提交)$/.test(text) || isBrandQueryButton(element)) return;
    element.setAttribute("data-platego-next-action", "1");
  }

  function refreshPageHints() {
    clearPageHints();
    if (state.searchOpen) {
      for (const root of searchUiRoots()) {
        for (const scope of searchFormScopes(root)) {
          hintPageElement(findSearchInput(scope, "brand"));
          hintPageElement(findSearchInput(scope, "model"));
        }
      }
      return;
    }
    hintPageElement(findBrandSearchOpener(readableDocuments()));
  }

  const SEARCH_FIELD_HINTS = {
    brand: {
      labels: ["中文品牌", "车辆品牌", "品牌名称"],
      name: /ppmc|clppmc|clpp|^pp$|cpmc/i,
      prompts: ["请输入车辆品牌", "请输入中文品牌", "请输入品牌", "输入车辆品牌", "车辆品牌"]
    },
    model: {
      labels: ["车辆型号"],
      name: /clxh|cpxh/i,
      prompts: ["请输入车辆型号", "请输入型号", "输入车辆型号", "车辆型号"]
    }
  };

  function findLabeledInput(root, labels) {
    if (!root?.querySelectorAll) return null;
    for (const node of root.querySelectorAll("label, dt, span, b, strong, td, div, em, font, li")) {
      if (pageTag(node) === "TH" || node.closest?.("thead, tbody")) continue;
      const compact = String(node.textContent || "").replace(/\s+/g, "");
      if (!compact || compact.length > 16) continue;
      if (/^选择|请点此查询|选择车辆品牌型号/.test(compact)) continue;
      if (!labels.some((label) => compact === label || compact.includes(label))) continue;
      const input = nearestFieldInput(node);
      if (input && isSearchTextControl(input)) return input;
    }
    return null;
  }

  function isConfirmHiddenBrandModel(element) {
    if (!isPageElement(element)) return false;
    const name = `${element.id || ""} ${element.getAttribute("name") || ""}`;
    if (!/\bclpp\b|\bclxh\b/i.test(name)) return false;
    return String(element.getAttribute("type") || "").toLowerCase() === "hidden"
      || Boolean(element.closest?.("#vehForm"));
  }

  function isQueryPpxhFrame(iframe) {
    const src = `${iframe?.getAttribute?.("src") || ""} ${iframe?.src || ""} ${iframe?.name || ""}`;
    return /queryPpxh|mdlPpxh/i.test(src);
  }

  function isVisibleElement(element) {
    if (!isPageElement(element)) return false;
    const style = pageView(element).getComputedStyle?.(element);
    if (style && (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 24 && rect.height >= 24;
  }

  function isBrandSearchDialogOpen() {
    for (const iframe of document.querySelectorAll("iframe")) {
      if (!isQueryPpxhFrame(iframe)) continue;
      if (isVisibleElement(iframe) || isDisplayedFrame(iframe)) return true;
      if (frameDocument(iframe)?.querySelector("#formsearch, input#clpp:not([type='hidden'])")) return true;
    }
    for (const dialog of document.querySelectorAll(".aui_outer, .aui_state_focus, .aui_dialog, .window, [role='dialog']")) {
      if (!isVisibleElement(dialog)) continue;
      const title = compactNodeText(dialog.querySelector?.(".aui_title, .window-header, .title") || null);
      if (/选择车辆品牌型号/.test(title)) return true;
      if (dialog.querySelector?.("iframe[src*='queryPpxh'], iframe[src*='mdlPpxh'], #formsearch")) return true;
    }
    return queryPpxhDocuments().some((doc) => Boolean(doc.querySelector("#formsearch, input#clpp:not([type='hidden'])")));
  }

  function queryPpxhDocuments() {
    const docs = [];
    const seen = new Set();
    for (const doc of readableDocuments()) {
      for (const iframe of [...(doc.querySelectorAll?.("iframe") || [])]) {
        if (!isQueryPpxhFrame(iframe)) continue;
        const nested = frameDocument(iframe);
        if (!nested || seen.has(nested)) continue;
        seen.add(nested);
        docs.push(nested);
      }
    }
    return docs;
  }

  function findDirectSearchInput(root, key) {
    const id = key === "brand" ? "clpp" : key === "model" ? "clxh" : "";
    if (!id || !root?.querySelector) return null;
    const form = root.querySelector("#formsearch") || root;
    const hits = [
      form.querySelector?.(`#${id}`),
      form.querySelector?.(`input[name="${id}"]`),
      root.querySelector(`#${id}`),
      root.querySelector(`input[name="${id}"]`)
    ];
    return hits.find((item) => item && isSearchTextControl(item) && !isConfirmHiddenBrandModel(item)) || null;
  }

  function findNamedSearchInput(root, key) {
    const hint = SEARCH_FIELD_HINTS[key];
    if (!hint || !root?.querySelectorAll) return null;
    for (const element of root.querySelectorAll("input, textarea, select")) {
      if (!hint.name.test(`${element.getAttribute("name") || ""} ${element.id || ""}`)) continue;
      const wrap = searchWidgetWrap(element)
        || (element.nextElementSibling instanceof HTMLElement ? element.nextElementSibling : element.parentElement);
      const visible = visibleSearchControl(element) || firstFillableIn(wrap);
      if (visible) return visible;
    }
    return null;
  }

  function searchWidgetWrap(element) {
    return element?.closest?.(".searchbox, .textbox, .combo, .easyui-fluid") || null;
  }

  function controlPromptText(element) {
    const wrap = searchWidgetWrap(element);
    const original = wrap?.previousElementSibling;
    const prompts = wrap
      ? [...wrap.querySelectorAll(".textbox-prompt, .searchbox-prompt, .combo-prompt")]
      : [];
    return [
      element.getAttribute?.("placeholder") || "",
      element.getAttribute?.("data-prompt") || "",
      element.getAttribute?.("aria-label") || "",
      element.getAttribute?.("title") || "",
      element.getAttribute?.("data-options") || "",
      wrap?.getAttribute?.("data-options") || "",
      original instanceof HTMLElement ? original.getAttribute("placeholder") || "" : "",
      original instanceof HTMLElement ? original.getAttribute("data-options") || "" : "",
      ...prompts.map((node) => String(node.textContent || ""))
    ].join(" ");
  }

  function visibleSearchControl(element) {
    if (isVisiblyFillable(element)) return element;
    const wrap = searchWidgetWrap(element) || element.parentElement;
    return firstFillableIn(wrap) || null;
  }

  function leafPromptText(node) {
    if (!node || node.querySelector?.("input, textarea, iframe, table, .datagrid, .window")) return "";
    const text = String(node.textContent || "").replace(/\s+/g, "");
    return text.length > 0 && text.length <= 20 ? text : "";
  }

  function findInputByPromptNodes(root, key) {
    const hint = SEARCH_FIELD_HINTS[key];
    if (!hint || !root?.querySelectorAll) return null;
    for (const node of root.querySelectorAll("input, textarea, span, em, font, label, div, p, i, b")) {
      if (node.querySelector?.("iframe, table, .window, .datagrid")) continue;
      const haystack = [
        node.getAttribute?.("placeholder") || "",
        node.getAttribute?.("data-prompt") || "",
        node.getAttribute?.("data-options") || "",
        node.classList?.contains("textbox-prompt")
          || node.classList?.contains("searchbox-prompt")
          || node.classList?.contains("combo-prompt")
          || node.classList?.contains("validatebox-prompt")
          ? String(node.textContent || "")
          : "",
        leafPromptText(node)
      ].join(" ");
      if (!hint.prompts.some((prompt) => haystack.includes(prompt))) continue;
      if (node.matches?.("input, textarea")) {
        const input = visibleSearchControl(node);
        if (input) return input;
      }
      const wrap = searchWidgetWrap(node) || node.parentElement;
      const input = firstFillableIn(wrap) || nearestFieldInput(node);
      if (input) return input;
    }
    return null;
  }

  function findPromptedSearchInput(root, key) {
    const hint = SEARCH_FIELD_HINTS[key];
    if (!hint || !root?.querySelectorAll) return null;
    return [...root.querySelectorAll("input, textarea")].find((element) => (
      hint.prompts.some((prompt) => controlPromptText(element).includes(prompt))
      && isVisiblyFillable(element)
    )) || findInputByPromptNodes(root, key);
  }

  function collectToolbarSearchInputs(root) {
    if (!root?.querySelectorAll) return [];
    const inputs = [...root.querySelectorAll("input.textbox-text, input.searchbox-text, input.combo-text, input.validatebox-text, input[type='text']")]
      .filter((element) => isVisiblyFillable(element))
      .filter((element) => !/查询|确定|提交|页/.test(String(element.value || "")))
      .filter((element) => !/page|rows|size|pager/i.test(`${element.getAttribute("name") || ""} ${element.id || ""} ${element.getAttribute("aria-label") || ""}`));
    inputs.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      if (Math.abs(leftRect.top - rightRect.top) > 16) return leftRect.top - rightRect.top;
      return leftRect.left - rightRect.left;
    });
    return inputs;
  }

  function findToolbarSearchInput(root, key) {
    const inputs = collectToolbarSearchInputs(root);
    if (inputs.length < 2) return null;
    return key === "brand" ? inputs[0] : inputs[1];
  }

  function findSearchInput(root, key) {
    const hint = SEARCH_FIELD_HINTS[key];
    if (!hint) return null;
    return findDirectSearchInput(root, key)
      || findPromptedSearchInput(root, key)
      || findLabeledInput(root, hint.labels)
      || findNamedSearchInput(root, key)
      || findToolbarSearchInput(root, key);
  }

  function companionHiddenInputs(element) {
    const wrap = searchWidgetWrap(element);
    if (!wrap) return [];
    const extras = [...wrap.querySelectorAll("input.textbox-value, input.combo-value, input[type='hidden']")]
      .filter((item) => item !== element);
    const previous = wrap.previousElementSibling;
    if (pageTag(previous) === "INPUT" && previous !== element) extras.push(previous);
    return extras;
  }

  function writeNamedSearchCompanions(element, key, value) {
    const hint = SEARCH_FIELD_HINTS[key];
    const doc = element.ownerDocument;
    if (!hint || !doc?.querySelectorAll) return;
    for (const item of doc.querySelectorAll("input, textarea")) {
      if (item === element) continue;
      const type = String(item.getAttribute("type") || "text").toLowerCase();
      if (type === "radio" || type === "checkbox" || type === "button" || type === "submit") continue;
      if (!hint.name.test(`${item.getAttribute("name") || ""} ${item.id || ""}`)) continue;
      nativeSetValue(item, value);
    }
  }

  function writeOfficialValue(element, value, key) {
    if (!isPageElement(element) || (!isSearchTextControl(element) && pageTag(element) !== "SELECT")) return false;
    if (pageTag(element) === "SELECT") {
      selectClosestOption(element, value, "");
      return true;
    }
    try {
      element.removeAttribute("readonly");
    } catch {
      /* ignore */
    }
    const view = pageView(element);
    element.dispatchEvent(new (view.Event || Event)("focus", { bubbles: true }));
    nativeSetValue(element, value);
    for (const hidden of companionHiddenInputs(element)) {
      nativeSetValue(hidden, value);
    }
    if (key) writeNamedSearchCompanions(element, key, value);
    const wrap = searchWidgetWrap(element);
    if (wrap) {
      for (const prompt of wrap.querySelectorAll(".textbox-prompt, .searchbox-prompt, .combo-prompt, .validatebox-prompt")) {
        prompt.hidden = true;
        prompt.style.display = "none";
      }
    }
    return true;
  }

  function searchFormScopes(root) {
    const scopes = [];
    const seen = new Set();
    function walk(node) {
      if (!node || seen.has(node)) return;
      seen.add(node);
      scopes.push(node);
      if (!node.querySelectorAll) return;
      for (const iframe of node.querySelectorAll("iframe")) {
        const doc = frameDocument(iframe);
        if (doc?.body) walk(doc.body);
      }
    }
    walk(root);
    return scopes;
  }

  function collectSearchInputs(key) {
    const found = [];
    const seen = new Set();
    function add(input) {
      if (input && isSearchTextControl(input) && !isConfirmHiddenBrandModel(input) && !seen.has(input)) {
        seen.add(input);
        found.push(input);
      }
    }
    for (const doc of queryPpxhDocuments()) {
      add(findDirectSearchInput(doc, key));
      add(findDirectSearchInput(doc.body, key));
    }
    for (const doc of readableDocuments()) {
      add(findDirectSearchInput(doc, key));
      add(findDirectSearchInput(doc.body, key));
    }
    for (const root of searchUiRoots()) {
      for (const scope of searchFormScopes(root)) add(findSearchInput(scope, key));
    }
    for (const doc of readableDocuments()) add(findSearchInput(doc.body, key));
    return found;
  }

  function describeSearchFillFailure() {
    const docs = readableDocuments();
    let blocked = 0;
    try {
      blocked = [...document.querySelectorAll("iframe")].filter((iframe) => !frameDocument(iframe)).length;
    } catch {
      blocked = 0;
    }
    const seen = [];
    for (const doc of docs) {
      if (doc.getElementById?.("formsearch") && !seen.includes("#formsearch")) seen.push("#formsearch");
      if (doc.querySelector?.("#formsearch #clpp, input#clpp[type='text']") && !seen.includes("#clpp")) seen.push("#clpp");
      if (doc.querySelector?.("#formsearch #clxh, input#clxh[type='text']") && !seen.includes("#clxh")) seen.push("#clxh");
      if (doc.querySelector?.("iframe[src*='queryPpxh']") && !seen.includes("queryPpxh")) seen.push("queryPpxh");
    }
    return `可读页面 ${docs.length} 个，读不到的 iframe ${blocked} 个${seen.length ? `，看到 ${seen.join("、")}` : "，没有看到 #formsearch/#clpp/#clxh"}。`;
  }

  function fillSearchFields() {
    const brand = String(state.vehicleDraft.brand || "").trim();
    const model = rawVehicleValue(state.vehicleDraft.model).toUpperCase();
    if (!brand && !model) {
      setMessage("请先识别或填写品牌和型号。", "error");
      return;
    }
    const wrote = fillBrandSearchForm(searchUiRoots()[0] || document, brand, model);
    if (!wrote) {
      setMessage(`没有写入品牌或型号。${describeSearchFillFailure()}请点「重新读取页面」后再试。`, "error");
      return;
    }
    markFilledKeys([...(brand ? ["brand"] : []), ...(model ? ["model"] : [])]);
    const queried = clickOfficialSearchQuery();
    state.message = queried ? "已填入品牌和型号，并已查询。" : "已填入品牌和型号。";
    state.messageTone = "success";
    refreshPageHints();
    render();
  }

  function fillOneSearchField(key) {
    const value = key === "model"
      ? rawVehicleValue(state.vehicleDraft.model).toUpperCase()
      : String(state.vehicleDraft[key] || "").trim();
    if (!value) return 0;
    for (const input of collectSearchInputs(key)) {
      if (writeOfficialValue(input, value, key)) {
        hintPageElement(input);
        return 1;
      }
    }
    return 0;
  }

  function fillBrandSearchForm(root, brand, model) {
    let wrote = 0;
    if (brand && fillOneSearchField("brand")) wrote += 1;
    if (model && fillOneSearchField("model")) wrote += 1;
    if (wrote) return wrote;
    for (const scope of searchFormScopes(root)) {
      const brandInput = findSearchInput(scope, "brand");
      const modelInput = findSearchInput(scope, "model");
      if (brand && brandInput && writeOfficialValue(brandInput, brand, "brand")) wrote += 1;
      if (model && modelInput && writeOfficialValue(modelInput, model, "model")) wrote += 1;
      if (wrote) break;
    }
    return wrote;
  }

  function findBrandQueryButton(root) {
    if (!root?.querySelectorAll) return null;
    const hits = [...root.querySelectorAll("a, button, input[type=button], .l-btn, span")].filter((element) => isBrandQueryButton(element));
    return hits.find((element) => /^(A|BUTTON|INPUT)$/.test(element.tagName)) || hits[0] || null;
  }

  function clickOfficialSearchQuery() {
    const roots = [...searchUiRoots()];
    for (const doc of queryPpxhDocuments()) {
      if (doc?.body) roots.push(doc.body);
    }
    for (const root of roots) {
      const button = findBrandQueryButton(root);
      if (!button || isForbiddenPageAction(button) || !isBrandQueryButton(button)) continue;
      if (nativeElementClick(button)) return true;
    }
    return false;
  }

  function markFilledKeys(keys) {
    for (const key of keys) state.filledKeys[key] = true;
  }

  function scrapeSelectedBrandModel() {
    const result = { brand: "", model: "" };
    for (const doc of readableDocuments()) {
      const parentBrand = doc.querySelector?.("#vehForm input#clpp, input#clpp[type='hidden']");
      const parentModel = doc.querySelector?.("#vehForm input#clxh, input#clxh[type='hidden']");
      const hiddenBrand = String(parentBrand?.value || "").trim();
      const hiddenModel = rawVehicleValue(parentModel?.value || "");
      if (hiddenBrand) result.brand = hiddenBrand.slice(0, 40);
      if (hiddenModel) result.model = hiddenModel.slice(0, 40);
      if (result.brand && result.model) return result;
      const selected = doc.querySelector?.('input[type="radio"][name="ppxh"]:checked');
      if (selected) {
        const brand = String(selected.getAttribute("val-clpp") || "").trim();
        const model = String(selected.getAttribute("val-clxh") || "").trim();
        if (brand) result.brand = brand.slice(0, 40);
        if (model) result.model = rawVehicleValue(model).slice(0, 40);
        if (result.brand || result.model) return result;
      }
      for (const node of doc.querySelectorAll("input, textarea, td, dd, span, font, a")) {
        if (node.closest("#platego-extension-host")) continue;
        const compact = String(node.value || node.textContent || "").replace(/\s+/g, "");
        if (!compact || compact.length < 4 || compact.length > 48) continue;
        if (/请点此|请选择|请输入|查询|确定|提交|所有人|身份证/.test(compact)) continue;
        const label = `${controlLabel(node)}${node.getAttribute("placeholder") || ""}${node.getAttribute("aria-label") || ""}`.replace(/\s+/g, "");
        if (!/品牌型号/.test(label)) continue;
        const brand = (compact.match(/[\u4e00-\u9fffA-Za-z0-9]{1,12}牌/) || [""])[0];
        const model = compact.replace(brand, "");
        if (brand) result.brand = brand.slice(0, 40);
        if (model && /[A-Z0-9]/i.test(model)) result.model = model.slice(0, 40);
      }
    }
    return result;
  }

  function syncSelectedVehicleRecord() {
    const scraped = scrapeSelectedBrandModel();
    if (!scraped.brand && !scraped.model) return;
    if (scraped.brand) state.vehicleDraft.brand = scraped.brand;
    if (scraped.model) state.vehicleDraft.model = scraped.model;
    queueVehicleSave("confirm");
  }

  function syncSearchMode() {
    const detected = isBrandSearchDialogOpen() || searchUiRoots().length > 0;
    const searchOpen = detected || Date.now() < Number(state.searchOpenStickyUntil || 0);
    if (state.searchOpen && !searchOpen) syncSelectedVehicleRecord();
    state.searchOpen = searchOpen;
    if (searchOpen) {
      state.guide = { phase: "search", hint: "" };
      return;
    }
    if (state.guide.phase === "search") state.guide = { phase: "idle", hint: "" };
  }

  async function writeDirectVehicleFields(fields, skipKeys) {
    let filled = 0;
    for (const [key, element] of Object.entries(fields)) {
      if (skipKeys.has(key)) continue;
      const value = isGroupedVehicleField(key)
        ? rawVehicleValue(state.vehicleDraft[key])
        : String(state.vehicleDraft[key] || "").trim();
      if (!value || !element.isConnected) continue;
      if (pageTag(element) === "SELECT") {
        if (selectClosestOption(element, value, key)) filled += 1;
        continue;
      }
      if (writeOfficialValue(element, value)) filled += 1;
    }
    return filled;
  }

  async function fillVehicleFields() {
    const page = pageState();
    if (!Object.values(state.vehicleDraft).some((value) => String(value || "").trim())) {
      setMessage("请先识别或填写车辆档案。", "error");
      return;
    }
    syncSearchMode();
    if (state.searchOpen) {
      const root = searchUiRoots()[0];
      if (!root) {
        setMessage("还没有查询窗口。", "error");
        return;
      }
      const wrote = fillBrandSearchForm(
        root,
        String(state.vehicleDraft.brand || "").trim(),
        String(state.vehicleDraft.model || "").trim()
      );
      if (!wrote) {
        setMessage("没有写入查询窗。", "error");
        return;
      }
      markFilledKeys(["brand", "model"]);
      clickOfficialSearchQuery();
      state.message = "";
      render();
      return;
    }
    const fields = { ...page.confirmFields, ...allVehicleFields() };
    page.confirmFields = fields;
    if (page.flowStep !== "CONFIRM_INFO" && !hasConfirmForm(fields)) {
      setMessage("还没到确认信息页。", "error");
      return;
    }
    if (!canWriteVehicle({ ...page, confirmFields: fields, flowStep: "CONFIRM_INFO" })) {
      setMessage("当前页没有可填的确认信息栏。", "error");
      return;
    }
    const skipKeys = new Set(["brand", "model"]);
    const filled = await writeDirectVehicleFields(fields, skipKeys);
    if (!filled) {
      setMessage("没有写入对应栏。", "error");
      return;
    }
    markFilledKeys(Object.keys(fields).filter((key) => !skipKeys.has(key) && String(state.vehicleDraft[key] || "").trim()));
    state.message = "";
    render();
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("无法读取合格证图片"));
      reader.readAsDataURL(blob);
    });
  }

  async function compactCertificateImage(file) {
    if (!(file instanceof Blob) || !String(file.type || "").startsWith("image/")) {
      throw new Error("请选择合格证照片");
    }
    const bitmap = await createImageBitmap(file);
    let maxEdge = 1400;
    let quality = 0.78;
    let blob;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("无法压缩合格证图片");
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvas.convertToBlob({ type: "image/jpeg", quality });
      if (blob.size <= 900_000) break;
      maxEdge = Math.round(maxEdge * 0.72);
      quality = Math.max(0.45, quality - 0.12);
    }
    if (!blob || blob.size > 1_000_000) throw new Error("图片仍然过大，请换一张更小的照片");
    return blobToDataUrl(blob);
  }

  async function recognizeCertificate(file) {
    if (state.ocrBusy) return;
    if (!isLocalFixtureLocation() && !isOfficialShanghaiLocation()) {
      setMessage("当前页不允许识别合格证。", "error");
      return;
    }
    state.ocrBusy = true;
    state.message = "";
    render();
    try {
      const imageDataUrl = await compactCertificateImage(file);
      const response = await runtimeMessage({
        type: "PLATEGO_OCR_CERTIFICATE",
        imageDataUrl,
        language: state.ocrLanguage
      });
      if (!response?.ok) throw new Error(response?.error || "识别失败，请改手填");
      const fields = response.fields && typeof response.fields === "object" ? response.fields : {};
      state.vehicleDraft = {
        plateKind: String(fields.plateKind || "").trim().slice(0, 40),
        brand: String(fields.brand || "").trim().slice(0, 40),
        model: String(fields.model || "").trim().slice(0, 40),
        certificateNo: String(fields.certificateNo || "").trim().slice(0, 40),
        vin: String(fields.vin || "").trim().toUpperCase().slice(0, 20)
      };
      state.ocrChecked = true;
      state.certificatePreview = {
        imageDataUrl,
        regions: response.regions && typeof response.regions === "object" ? response.regions : {}
      };
      state.filledKeys = Object.fromEntries(
        Object.keys(VEHICLE_FIELD_LABELS)
          .filter((key) => String(state.vehicleDraft[key] || "").trim())
          .map((key) => [key, true])
      );
      await saveVehicleDraft("ocr");
      const issues = Object.keys(VEHICLE_FIELD_LABELS).filter((key) => vehicleFieldIssue(key, state.vehicleDraft[key]));
      state.message = issues.length ? "部分栏位不符合规则，请检查标红项。" : "";
      state.messageTone = issues.length ? "error" : "neutral";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "识别失败，请改手填", "error");
    } finally {
      state.ocrBusy = false;
      render();
    }
  }

  function setMessage(message, tone) {
    state.message = message;
    state.messageTone = tone;
    render();
  }

  function hideCheckPreview() {
    const pop = shadow.querySelector("[data-check-pop]");
    if (pop) pop.hidden = true;
  }

  function hintOfficialSearchField(key) {
    if (key !== "brand" && key !== "model") return;
    for (const root of searchUiRoots()) {
      for (const scope of searchFormScopes(root)) {
        const input = findSearchInput(scope, key);
        if (!input) continue;
        hintPageElement(input);
        if (typeof input.scrollIntoView === "function") input.scrollIntoView({ block: "center", inline: "nearest" });
        return;
      }
    }
    if (key === "brand" || key === "model") hintPageElement(findBrandSearchOpener(readableDocuments()));
  }

  async function showCheckPreview(key, anchor) {
    hintOfficialSearchField(key);
    const pop = shadow.querySelector("[data-check-pop]");
    const canvas = pop?.querySelector("canvas");
    const imageDataUrl = state.certificatePreview.imageDataUrl;
    if (!(anchor instanceof HTMLElement) || !pop || !canvas || !imageDataUrl) return;
    try {
      const response = await fetch(imageDataUrl);
      const bitmap = await createImageBitmap(await response.blob());
      const region = state.certificatePreview.regions?.[key];
      const box = region && Number(region.width) > 4
        ? {
          left: Math.max(0, Number(region.left) || 0),
          top: Math.max(0, Number(region.top) || 0),
          width: Math.min(bitmap.width, Number(region.width) || bitmap.width),
          height: Math.min(bitmap.height, Number(region.height) || 80)
        }
        : { left: 0, top: 0, width: bitmap.width, height: Math.min(bitmap.height, 220) };
      const scale = 2.6;
      canvas.width = Math.min(320, Math.max(160, Math.round(box.width * scale)));
      canvas.height = Math.min(200, Math.max(88, Math.round(box.height * scale)));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = true;
      context.drawImage(bitmap, box.left, box.top, box.width, box.height, 0, 0, canvas.width, canvas.height);
      const frame = shadow.querySelector(".body") || host;
      const frameRect = frame.getBoundingClientRect();
      const rect = anchor.getBoundingClientRect();
      pop.style.left = `${Math.max(8, Math.min(rect.left - frameRect.left - canvas.width + rect.width, frameRect.width - canvas.width - 12))}px`;
      pop.style.top = `${Math.max(8, rect.top - frameRect.top - canvas.height - 10)}px`;
      pop.hidden = false;
    } catch {
      hideCheckPreview();
    }
  }

  function setDropActive(active) {
    const zone = shadow.querySelector("[data-dropzone]");
    if (zone) zone.classList.toggle("active", active);
  }

  let selectedDragValue = "";
  function clearSelectedDragChrome() {
    for (const card of shadow.querySelectorAll(".selected-order-card")) {
      card.classList.remove("dragging", "drag-over");
    }
  }

  shadow.addEventListener("scroll", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains("shell")) state.assistantScrollTop = target.scrollTop;
    if (target.classList.contains("rule-results")) state.ruleResultsScrollTop = target.scrollTop;
  }, { capture: true, passive: true });

  shadow.addEventListener("dragstart", (event) => {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest("[data-selected-drag]");
    if (!(card instanceof HTMLButtonElement) || card.draggable !== true || state.selfBatchPending) return;
    selectedDragValue = String(card.dataset.selectedDrag || "");
    if (!selectedDragValue) return;
    card.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", selectedDragValue);
    }
  });

  shadow.addEventListener("dragover", (event) => {
    if (!(event.target instanceof Element) || !selectedDragValue) return;
    const card = event.target.closest("[data-selected-drag]");
    if (!(card instanceof HTMLButtonElement) || card.dataset.selectedDrag === selectedDragValue) return;
    event.preventDefault();
    clearSelectedDragChrome();
    card.classList.add("drag-over");
    const source = shadow.querySelector(`[data-selected-drag="${selectedDragValue}"]`);
    if (source) source.classList.add("dragging");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });

  shadow.addEventListener("drop", (event) => {
    if (!(event.target instanceof Element) || !selectedDragValue) return;
    const card = event.target.closest("[data-selected-drag]");
    if (!(card instanceof HTMLButtonElement)) return;
    event.preventDefault();
    const rect = card.getBoundingClientRect();
    const nearSameRow = Math.abs(event.clientY - (rect.top + rect.height / 2)) < rect.height / 3;
    const placeAfter = nearSameRow
      ? event.clientX > rect.left + rect.width / 2
      : event.clientY > rect.top + rect.height / 2;
    const moved = reorderSelectedValues(selectedDragValue, card.dataset.selectedDrag, placeAfter, pageState());
    selectedDragValue = "";
    clearSelectedDragChrome();
    if (moved) render();
  });

  shadow.addEventListener("dragend", () => {
    selectedDragValue = "";
    clearSelectedDragChrome();
  });

  shadow.addEventListener("dragover", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-dropzone]")) return;
    event.preventDefault();
    setDropActive(true);
  });
  shadow.addEventListener("dragleave", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-dropzone]")) return;
    setDropActive(false);
  });
  shadow.addEventListener("drop", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-dropzone]")) return;
    event.preventDefault();
    setDropActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void recognizeCertificate(file);
  });

  shadow.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("button[data-action]");
    if (!(button instanceof HTMLButtonElement) || button.disabled) return;
    const action = button.dataset.action;
    if (action === "hide") {
      state.visible = false;
      host.hidden = true;
    } else if (action === "refresh") {
      if (!state.scanning) {
        state.officialPoolScanStarted = false;
      }
      render();
    } else if (action === "capture-random") {
      void captureRandomCandidates();
    } else if (action === "scan") {
      void scanKeyboard();
    } else if (action === "pause-scan") {
      if (state.scanning) {
        state.scanHold = true;
        state.scanReason = "正在暂停，先收下当前已读到的号码…";
        render();
      }
    } else if (action === "apply-diff") {
      void applyDiff();
    } else if (action === "export-pool") {
      exportCandidatePool();
    } else if (action === "upload") {
      void uploadObservation();
    } else if (action === "save-self-pool") {
      void saveSelfEntryPool();
    } else if (action === "set-preset-rule-context") {
      state.presetRuleContext = button.dataset.context === "self" ? "self" : "random";
      render();
    } else if (action === "add-position-pattern") {
      const page = pageState();
      addPositionPattern(page.flowStep === "SELECT" ? page : presetRulePage(page));
      render();
    } else if (action === "toggle-position-pattern-enabled") {
      const currentPage = pageState();
      const page = currentPage.flowStep === "SELECT" ? currentPage : presetRulePage(currentPage);
      const patternId = String(button.dataset.patternId || "");
      const context = button.dataset.context === "random" ? "random" : "self";
      setPositionPatterns(state.positionPatterns.map((pattern) => {
        if (pattern.id !== patternId) return pattern;
        return context === "random"
          ? { ...pattern, enabledRandom: !pattern.enabledRandom }
          : { ...pattern, enabledSelf: !pattern.enabledSelf };
      }), page);
      render();
    } else if (action === "toggle-position-pattern-mode") {
      const currentPage = pageState();
      const page = currentPage.flowStep === "SELECT" ? currentPage : presetRulePage(currentPage);
      const patternId = String(button.dataset.patternId || "");
      setPositionPatterns(state.positionPatterns.map((pattern) => (
        pattern.id === patternId
          ? {
            ...pattern,
            mode: pattern.mode === "fixed" ? "ordered" : "fixed",
            slots: pattern.mode === "fixed"
              ? [...pattern.slots.filter(Boolean), ...pattern.slots.filter((token) => !token)]
              : [...pattern.slots]
          }
          : pattern
      )), page);
      render();
    } else if (action === "delete-position-pattern") {
      const currentPage = pageState();
      const page = currentPage.flowStep === "SELECT" ? currentPage : presetRulePage(currentPage);
      const patternId = String(button.dataset.patternId || "");
      setPositionPatterns(state.positionPatterns.filter((pattern) => pattern.id !== patternId), page);
      render();
    } else if (action === "toggle-rule-result") {
      toggleRuleResult(button.dataset.value, pageState());
      render();
    } else if (action === "select-rule-top-five") {
      selectFirstRuleResults(pageState());
      render();
    } else if (action === "clear-rule-selection") {
      state.selfRuleSelected = [];
      persistSelfRuleSelection();
      render();
    } else if (action === "show-more-rule-results") {
      state.selfRuleVisibleLimit += 40;
      render();
    } else if (action === "fill-self-batch") {
      void fillSelfEntryBatch();
    } else if (action === "restore-self-batch") {
      restorePreviousSelfEntryBatch();
    } else if (action === "reset-self-batch") {
      resetSelfEntryBatch();
    } else if (action === "fill-group") {
      void fillGroup();
    } else if (action === "previous-group") {
      state.groupIndex = Math.max(0, state.groupIndex - 1);
      render();
    } else if (action === "next-group") {
      state.groupIndex += 1;
      render();
    } else if (action === "fill-vehicle") {
      void fillVehicleFields();
    } else if (action === "copy-vehicle") {
      void copyVehicleField(button.dataset.field, button);
    } else if (action === "fill-search-both") {
      fillSearchFields();
    } else if (action === "toggle-compose-combo") {
      const combo = String(button.dataset.combo || "").toUpperCase();
      const current = normalizeComposePrefs(state.config.composePrefs);
      persistComposePrefs({ ...current, combinations: toggleListed(current.combinations, combo) });
      render();
    } else if (action === "toggle-compose-segment") {
      const segment = String(button.dataset.segment || "").toUpperCase();
      const current = normalizeComposePrefs(state.config.composePrefs);
      persistComposePrefs({ ...current, segments: toggleListed(current.segments, segment) });
      render();
    } else if (action === "add-compose-custom") {
      const input = shadow.querySelector("input[data-action='compose-custom']");
      const combo = String(input instanceof HTMLInputElement ? input.value : "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (combo.length >= 2) {
        const current = normalizeComposePrefs(state.config.composePrefs);
        persistComposePrefs({ ...current, combinations: toggleListed(current.combinations, combo) });
        render();
      }
    }
  });

  shadow.addEventListener("copy", (event) => {
    if (!event.clipboardData) return;
    if (event.target instanceof HTMLInputElement && isGroupedVehicleField(event.target.dataset.draftField)) {
      const start = event.target.selectionStart ?? 0;
      const end = event.target.selectionEnd ?? 0;
      const selected = rawVehicleValue(event.target.value.slice(start, end));
      if (!selected) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", selected);
      return;
    }
    const grouped = event.target instanceof Element ? event.target.closest("b.grouped") : null;
    if (!grouped) return;
    const selected = rawVehicleValue((shadow.getSelection?.() || document.getSelection())?.toString() || grouped.textContent || "");
    if (!selected) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", selected);
  });

  shadow.addEventListener("cut", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const key = event.target.dataset.draftField;
    if (!isGroupedVehicleField(key) || !event.clipboardData) return;
    const start = event.target.selectionStart ?? 0;
    const end = event.target.selectionEnd ?? 0;
    const selected = rawVehicleValue(event.target.value.slice(start, end));
    if (!selected) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", selected);
    const raw = rawVehicleValue(event.target.value.slice(0, start) + event.target.value.slice(end));
    state.vehicleDraft[key] = key === "vin" || key === "model" ? raw.toUpperCase() : raw;
    event.target.value = displayVehicleValue(key, state.vehicleDraft[key]);
    queueVehicleSave("manual");
  });

  shadow.addEventListener("pointerover", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-action='check-vehicle']");
    if (button) void showCheckPreview(button.dataset.field, button);
  });
  shadow.addEventListener("pointerout", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("[data-action='check-vehicle']");
    if (!button) return;
    const next = event.relatedTarget;
    if (next instanceof Node && button.contains(next)) return;
    hideCheckPreview();
  });

  shadow.addEventListener("focusout", (event) => {
    const vehicleDraft = event.target instanceof HTMLInputElement && Boolean(event.target.dataset.draftField);
    const selfPoolDraft = event.target instanceof HTMLTextAreaElement && event.target.dataset.action === "manual-self-pool";
    const positionPatternDraft = event.target instanceof HTMLInputElement && event.target.dataset.action === "position-pattern-slot";
    const numberTipDraft = event.target instanceof HTMLInputElement
      && ["sequence-targets", "many-digits"].includes(event.target.dataset.action || "");
    if (positionPatternDraft) {
      const next = event.relatedTarget;
      if (next instanceof HTMLInputElement
        && next.dataset.action === "position-pattern-slot"
        && next.dataset.patternId === event.target.dataset.patternId) {
        persistPositionPatterns();
        return;
      }
      const currentPage = pageState();
      setPositionPatterns(
        state.positionPatterns,
        currentPage.flowStep === "SELECT" ? currentPage : presetRulePage(currentPage)
      );
      window.setTimeout(() => {
        if (state.visible && !state.scanning && !state.dragging && !state.ocrBusy) render();
      }, 0);
      return;
    }
    if ((vehicleDraft || selfPoolDraft || numberTipDraft) && state.renderPaused) render();
  });

  shadow.addEventListener("keydown", (event) => {
    if (!(event.target instanceof HTMLInputElement)
      || event.target.dataset.action !== "position-pattern-slot"
      || event.key !== "Backspace"
      || event.target.value) return;
    const patternId = String(event.target.dataset.patternId || "");
    const slotIndex = Number.parseInt(event.target.dataset.slotIndex || "-1", 10);
    const previous = [...shadow.querySelectorAll("input[data-action='position-pattern-slot']")]
      .find((input) => input.dataset.patternId === patternId && Number.parseInt(input.dataset.slotIndex || "-1", 10) === slotIndex - 1);
    if (previous instanceof HTMLInputElement) {
      event.preventDefault();
      previous.focus();
      previous.select();
    }
  });

  shadow.addEventListener("input", (event) => {
    if (event.target instanceof HTMLTextAreaElement && event.target.dataset.action === "manual-self-pool") {
      state.selfEntryDraft = event.target.value.slice(0, 60_000);
      return;
    }
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.dataset.action === "pair-digits") {
      const value = [...new Set((event.target.value.match(/\d/g) || []))].join("");
      event.target.value = value;
      state.numberTips.pairDigits = value;
      persistNumberTips();
      highlightRandomNumberFrames(pageState());
      return;
    }
    if (event.target.dataset.action === "sequence-targets") {
      const value = event.target.value.replace(/[^0-9,，、\s]/g, "").slice(0, 80);
      event.target.value = value;
      state.numberTips.sequenceTargets = value;
      persistNumberTips();
      highlightRandomNumberFrames(pageState());
      return;
    }
    if (event.target.dataset.action === "many-digits") {
      const value = [...new Set((event.target.value.match(/\d/g) || []))].join("");
      event.target.value = value;
      state.numberTips.manyDigits = value;
      persistNumberTips();
      highlightRandomNumberFrames(pageState());
      return;
    }
    if (event.target.dataset.action === "position-pattern-slot") {
      const patternId = String(event.target.dataset.patternId || "");
      const slotIndex = Number.parseInt(event.target.dataset.slotIndex || "-1", 10);
      const token = event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z0-9]/g, "").slice(0, 1);
      event.target.value = token;
      state.positionPatterns = normalizePositionPatterns(state.positionPatterns.map((pattern) => {
        if (pattern.id !== patternId || slotIndex < 0 || slotIndex >= pattern.slots.length) return pattern;
        const slots = [...pattern.slots];
        slots[slotIndex] = token;
        return { ...pattern, slots };
      }));
      state.selfRuleMatchCache = { key: "", values: [] };
      persistPositionPatterns();
      const currentPage = pageState();
      if (currentPage.mode === "self") refreshSelfRuleMatches(currentPage);
      if (currentPage.mode === "random") highlightRandomNumberFrames(currentPage);
      if (token) {
        const next = [...shadow.querySelectorAll("input[data-action='position-pattern-slot']")]
          .find((input) => input.dataset.patternId === patternId && Number.parseInt(input.dataset.slotIndex || "-1", 10) === slotIndex + 1);
        if (next instanceof HTMLInputElement) {
          queueMicrotask(() => {
            if (!next.isConnected) return;
            next.focus();
            next.select();
          });
        }
      }
      return;
    }
    const key = event.target.dataset.draftField;
    if (!key || !(key in state.vehicleDraft)) return;
    if (isGroupedVehicleField(key)) {
      const caretRaw = rawVehicleValue(event.target.value.slice(0, event.target.selectionStart || 0)).length;
      const raw = key === "vin" || key === "model"
        ? rawVehicleValue(event.target.value).toUpperCase()
        : rawVehicleValue(event.target.value);
      state.vehicleDraft[key] = raw;
      event.target.value = groupedVehicleValue(raw);
      const index = groupedCaretIndex(event.target.value, caretRaw);
      event.target.setSelectionRange(index, index);
    } else {
      state.vehicleDraft[key] = event.target.value;
    }
    syncDraftFieldChrome(event.target, key);
    queueVehicleSave("manual");
  });

  shadow.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    if (event.target.matches("input[data-action='toggle-number-tip']") && event.target instanceof HTMLInputElement) {
      const tip = event.target.dataset.tip;
      if (tip && tip in state.numberTips) {
        state.numberTips[tip] = event.target.checked;
        persistNumberTips();
        highlightRandomNumberFrames(pageState());
        render();
      }
      return;
    }
    if (event.target.matches("select[data-action='select-record']") && event.target instanceof HTMLSelectElement) {
      state.vehicleRecords.activeId = event.target.value;
      const record = state.vehicleRecords.records.find((item) => item.id === state.vehicleRecords.activeId);
      state.vehicleDraft = draftFromRecord(record);
      void storageSet({ platego_vehicle_records: state.vehicleRecords });
      render();
      return;
    }
    if (event.target.matches("input[data-action='ocr-file']") && event.target instanceof HTMLInputElement) {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (file) void recognizeCertificate(file);
      return;
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
        realAdapterApproved: page.kind === "official-live" && page.fixtureVerified === true,
        officialFrameReadable: page.officialFrameReadable === true,
        simulationFrameReadable: page.simulationFrameReadable === true,
        confirmFieldCount: Object.keys(page.confirmFields || {}).length,
        confirmReady: hasConfirmForm(page.confirmFields),
        flowStep: page.flowStep || "UNKNOWN"
      });
    }
    return undefined;
  });

  let refreshTimer;
  let automationTimer;
  const observedFrameDocs = new WeakSet();
  const observer = new MutationObserver(() => {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      watchOfficialFrames();
      syncSearchMode();
      const page = pageState();
      highlightRandomNumberFrames(page);
      void maybeAdvanceSubmittedSelfBatch();
      if (state.visible && !state.scanning && !state.dragging && !state.ocrBusy) render();
    }, 140);
  });
  function watchOfficialFrames() {
    for (const doc of readableDocuments()) {
      let iframes = [];
      try {
        iframes = [...doc.querySelectorAll("iframe")];
      } catch {
        continue;
      }
      for (const iframe of iframes) {
        if (!iframe.dataset.plategoFrameWatch) {
          iframe.dataset.plategoFrameWatch = "1";
          iframe.addEventListener("load", () => {
            watchOfficialFrames();
            syncSearchMode();
            const page = pageState();
            highlightRandomNumberFrames(page);
            void maybeAdvanceSubmittedSelfBatch();
            if (state.visible && !state.scanning && !state.dragging && !state.ocrBusy) render();
          });
        }
        const frameDoc = frameDocument(iframe);
        if (!frameDoc || observedFrameDocs.has(frameDoc)) continue;
        observedFrameDocs.add(frameDoc);
        observer.observe(frameDoc, {
          attributes: true,
          childList: true,
          subtree: true,
          characterData: true,
          attributeFilter: ["class", "src", "style", "disabled"]
        });
      }
    }
    watchRandomBatchChanges();
    watchBrandSearchOpener();
    watchStartSelection();
  }

  function watchBrandSearchOpener() {
    const openers = [];
    const named = document.getElementById("btnPpxh");
    if (named) openers.push(named);
    const found = findBrandSearchOpener([document, ...readableDocuments()]);
    if (found) openers.push(found);
    for (const opener of openers) {
      if (!isPageElement(opener) || opener.dataset.plategoSearchWatch) continue;
      opener.dataset.plategoSearchWatch = "1";
      opener.addEventListener("click", () => {
        state.searchOpen = true;
        state.searchOpenStickyUntil = Date.now() + 2500;
        if (state.visible && !state.scanning && !state.dragging && !state.ocrBusy) render();
        window.setTimeout(() => {
          syncSearchMode();
          if (state.visible && !state.scanning && !state.dragging && !state.ocrBusy) render();
        }, 240);
        window.setTimeout(() => {
          syncSearchMode();
          if (state.visible && !state.scanning && !state.dragging && !state.ocrBusy) render();
        }, 900);
      }, true);
    }
  }

  function watchRandomBatchChanges() {
    for (const doc of officialRandomDocuments()) {
      const button = doc.getElementById("btnRand");
      if (button && !button.dataset.plategoRandWatch) {
        button.dataset.plategoRandWatch = "1";
        button.addEventListener("click", () => {
          window.setTimeout(() => {
            highlightRandomNumberFrames(pageState());
            if (state.visible && !state.scanning && !state.dragging && !state.ocrBusy) render();
          }, 280);
          window.setTimeout(() => {
            highlightRandomNumberFrames(pageState());
            if (state.visible && !state.scanning && !state.dragging && !state.ocrBusy) render();
          }, 1200);
        }, true);
      }
    }
  }

  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: [
      "data-platego-entry-gate", "data-platego-selection-mode", "data-platego-official-mock",
      "data-platego-adapter-root", "data-platego-flow-step", "disabled", "class", "src", "style"
    ]
  });
  watchOfficialFrames();

  let dragOffset = null;
  shadow.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-action='hide']")) return;
    if (!event.target.closest(".head")) return;
    const rect = host.getBoundingClientRect();
    dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    state.dragging = true;
    event.preventDefault();
  });
  window.addEventListener("pointermove", (event) => {
    if (!dragOffset) return;
    applyHostPosition({
      left: event.clientX - dragOffset.x,
      top: event.clientY - dragOffset.y
    });
  });
  window.addEventListener("pointerup", () => {
    if (!dragOffset) return;
    dragOffset = null;
    state.dragging = false;
    const rect = host.getBoundingClientRect();
    void storageSet({ platego_assistant_position: { left: Math.round(rect.left), top: Math.round(rect.top) } });
  });
  window.addEventListener("resize", () => {
    const left = Number.parseFloat(host.style.left);
    const top = Number.parseFloat(host.style.top);
    if (Number.isFinite(left) && Number.isFinite(top)) applyHostPosition({ left, top });
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes.platego_config?.newValue) {
      state.config = normalizeConfig(changes.platego_config.newValue);
      if (!changes.platego_number_tips) state.numberTips = normalizeNumberTips(state.config.highlightPrefs);
    }
    if (typeof changes.platego_api_base?.newValue === "string") state.apiBase = changes.platego_api_base.newValue;
    if (changes.platego_vehicle_records) {
      state.vehicleRecords = normalizeVehicleRecords(changes.platego_vehicle_records.newValue);
      if (!isEditingDraft()) {
        const active = state.vehicleRecords.records.find((item) => item.id === state.vehicleRecords.activeId);
        if (active) state.vehicleDraft = draftFromRecord(active);
      }
    }
    if (typeof changes.platego_ocr_space_language?.newValue === "string") {
      state.ocrLanguage = normalizeOcrLanguage(changes.platego_ocr_space_language.newValue);
    }
    if (changes.platego_number_tips?.newValue) state.numberTips = normalizeNumberTips(changes.platego_number_tips.newValue);
    if (changes.platego_self_entry_queue) {
      state.selfEntryQueue = normalizeSelfEntryQueue(changes.platego_self_entry_queue.newValue);
      const active = shadow.activeElement;
      if (!(active instanceof HTMLTextAreaElement && active.dataset.action === "manual-self-pool")) {
        state.selfEntryDraft = state.selfEntryQueue.manualValues.join("\n");
      }
    }
    if (changes[POSITION_PATTERNS_STORAGE_KEY]) {
      state.positionPatterns = normalizePositionPatterns(changes[POSITION_PATTERNS_STORAGE_KEY].newValue);
      state.selfRuleMatchCache = { key: "", values: [] };
    }
    if (changes[SELF_RULE_SELECTION_STORAGE_KEY]) {
      state.selfRuleSelected = normalizeSelfRuleSelection(changes[SELF_RULE_SELECTION_STORAGE_KEY].newValue);
    }
    if (changes.platego_captured_pool) {
      state.capturedPool = normalizeCapturedPool(changes.platego_captured_pool.newValue);
      state.selfRuleMatchCache = { key: "", values: [] };
      migrateCorrectedPoolPatterns();
    }
    if (changes[POOL_SNAPSHOTS_STORAGE_KEY]) {
      state.poolSnapshots = normalizePoolSnapshots(changes[POOL_SNAPSHOTS_STORAGE_KEY].newValue);
    }
    if (state.visible && !state.scanning && !state.dragging && !state.ocrBusy) render();
  });

  storageGet(["platego_config", "platego_api_base", "platego_vehicle_records", "platego_assistant_position", "platego_ocr_space_language", "platego_number_tips", "platego_self_entry_queue", POSITION_PATTERNS_STORAGE_KEY, SELF_RULE_SELECTION_STORAGE_KEY, "platego_captured_pool", POOL_SNAPSHOTS_STORAGE_KEY, NUMBER_TIPS_V2_STORAGE_KEY, POSITION_PATTERNS_V2_STORAGE_KEY]).then((stored) => {
    state.config = normalizeConfig(stored.platego_config);
    state.apiBase = typeof stored.platego_api_base === "string" ? stored.platego_api_base : DEFAULT_API_BASE;
    state.ocrLanguage = normalizeOcrLanguage(stored.platego_ocr_space_language);
    state.numberTips = stored.platego_number_tips
      ? normalizeNumberTips(stored.platego_number_tips)
      : normalizeNumberTips(state.config.highlightPrefs);
    if (stored[NUMBER_TIPS_V2_STORAGE_KEY] !== true) {
      state.config = { ...state.config, highlightPrefs: { ...state.numberTips } };
      void storageSet({
        platego_number_tips: state.numberTips,
        platego_config: state.config,
        [NUMBER_TIPS_V2_STORAGE_KEY]: true
      }).catch(() => undefined);
    }
    state.selfEntryQueue = normalizeSelfEntryQueue(stored.platego_self_entry_queue);
    state.selfEntryDraft = state.selfEntryQueue.manualValues.join("\n");
    state.positionPatterns = normalizePositionPatterns(stored[POSITION_PATTERNS_STORAGE_KEY]);
    if (stored[POSITION_PATTERNS_V2_STORAGE_KEY] !== true) {
      state.positionPatterns = mergePositionPatternDefaults(state.positionPatterns, stored.platego_number_tips);
      void storageSet({
        [POSITION_PATTERNS_STORAGE_KEY]: state.positionPatterns,
        [POSITION_PATTERNS_V2_STORAGE_KEY]: true
      }).catch(() => undefined);
    }
    state.selfRuleSelected = normalizeSelfRuleSelection(stored[SELF_RULE_SELECTION_STORAGE_KEY]);
    state.capturedPool = normalizeCapturedPool(stored.platego_captured_pool);
    migrateCorrectedPoolPatterns();
    state.poolSnapshots = normalizePoolSnapshots(stored[POOL_SNAPSHOTS_STORAGE_KEY]);
    state.vehicleRecords = normalizeVehicleRecords(stored.platego_vehicle_records);
    const active = state.vehicleRecords.records.find((item) => item.id === state.vehicleRecords.activeId);
    if (active) state.vehicleDraft = draftFromRecord(active);
    applyHostPosition(stored.platego_assistant_position);
    render();
  }).catch((error) => {
    state.message = `读取插件本机配置失败：${error.message}`;
    state.messageTone = "error";
    render();
  });
  render();
})();
