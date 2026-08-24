const debuggerBase = process.argv[2] || "http://127.0.0.1:9229";
const fixtureUrl = "http://127.0.0.1:4173/official-mock";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertNoExtensionPageActions(audit, context) {
  const touched = Object.entries(audit.extension || {}).filter(([, count]) => count !== 0);
  assert(touched.length === 0, `${context}: extension activated fixture controls ${JSON.stringify(touched)}`);
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class CdpClient {
  constructor(webSocketDebuggerUrl) {
    this.socket = new WebSocket(webSocketDebuggerUrl);
    this.sequence = 0;
    this.pending = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
    return result.result.value;
  }

  close() {
    this.socket.close();
  }
}

async function targets() {
  const response = await fetch(`${debuggerBase}/json/list`);
  if (!response.ok) throw new Error(`Cannot list Chrome targets: HTTP ${response.status}`);
  return response.json();
}

async function waitForTarget(predicate, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const target = (await targets()).find(predicate);
    if (target) return target;
    await delay(150);
  }
  throw new Error("Timed out waiting for Chrome target");
}

async function waitFor(client, expression, description, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await delay(120);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

const workerTarget = await waitForTarget((target) => target.type === "service_worker" && /chrome-extension:\/\/.+\/background\.js/.test(target.url));
const extensionId = new URL(workerTarget.url).hostname;
const worker = new CdpClient(workerTarget.webSocketDebuggerUrl);
const seededConfig = {
  schemaVersion: 1,
  simDataVersion: "smoke-fixture",
  regionCode: "310000",
  plateType: "small_blue",
  rules: [
    { id: "avoid-4", label: "避开 4", kind: "avoid", target: "4", weight: 28, enabled: true },
    { id: "repeat", label: "重复", kind: "repeat", target: "", weight: 14, enabled: true }
  ],
  favorites: [],
  orderedCandidates: [
    { id: "keep", value: "沪A88888", source: "manual", score: 96, createdAt: "2026-08-24T00:00:00.000Z" },
    { id: "remove", value: "沪AZZZZZ", source: "manual", score: 50, createdAt: "2026-08-24T00:00:00.000Z" }
  ],
  exportedAt: "2026-08-24T00:00:00.000Z"
};
await worker.evaluate(`new Promise((resolve) => chrome.storage.local.set({platego_config:${JSON.stringify(seededConfig)},platego_api_base:"http://localhost:8789"}, resolve))`);

const pageTarget = await waitForTarget((target) => target.type === "page" && target.url.startsWith(fixtureUrl));
const page = new CdpClient(pageTarget.webSocketDebuggerUrl);
await page.send("Page.enable");
await page.send("Page.reload", { ignoreCache: true });
await waitFor(page, "Boolean(document.querySelector('#platego-extension-host')?.shadowRoot)", "content script host");
await page.evaluate(`(() => {
  const emptyBucket = () => ({
    gate: 0,
    initialRandom: 0,
    changeBatch: 0,
    randomNumber: 0,
    enterSelf: 0,
    confirmInfo: 0,
    validate: 0,
    confirmSelection: 0,
    submit: 0
  });
  window.__plategoClickAudit = {extension: emptyBucket(), user: emptyBucket()};
  window.__plategoUserActionDepth = 0;
  window.__plategoTestUserClick = (selector) => {
    const target = document.querySelector(selector);
    if (!(target instanceof HTMLElement)) throw new Error("Missing user control: " + selector);
    window.__plategoUserActionDepth += 1;
    try {
      target.click();
    } finally {
      window.__plategoUserActionDepth -= 1;
    }
    return true;
  };
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    let action = "";
    if (target.closest("[data-platego-user-gate-action]")) action = "gate";
    else if (target.closest("[data-platego-user-confirm-info]")) action = "confirmInfo";
    else if (target.closest("[data-platego-user-enter-self]")) action = "enterSelf";
    else if (target.closest("[data-platego-user-validate]")) action = "validate";
    else if (target.closest("[data-platego-user-confirm-selection]")) action = "confirmSelection";
    else if (target.closest("[data-platego-random-number]")) action = "randomNumber";
    else {
      const reset = target.closest("[data-platego-random-reset]");
      if (reset) action = reset.textContent.includes("换一批") ? "changeBatch" : "initialRandom";
      else if (target.closest("button[type='submit'], input[type='submit']")) action = "submit";
    }
    if (!action) return;
    const owner = window.__plategoUserActionDepth > 0 ? "user" : "extension";
    window.__plategoClickAudit[owner][action] += 1;
  }, true);
  document.addEventListener("submit", () => {
    const owner = window.__plategoUserActionDepth > 0 ? "user" : "extension";
    window.__plategoClickAudit[owner].submit += 1;
  }, true);
  return true;
})()`);

await waitFor(page, "document.querySelector('#platego-extension-host').shadowRoot.textContent.includes('等待用户完成入口步骤')", "entry fail-closed status");
const entryBefore = await page.evaluate(`(() => ({
  gate: document.documentElement.dataset.plategoEntryGate,
  mode: document.documentElement.dataset.plategoSelectionMode,
  scoredCards: document.querySelector("#platego-extension-host").shadowRoot.querySelectorAll(".number").length,
  scanPresent: Boolean(document.querySelector("#platego-extension-host").shadowRoot.querySelector("[data-action=scan]")),
  fixtureRandomNumbers: document.querySelectorAll("[data-platego-random-number]").length,
  candidateInputs: document.querySelectorAll("[data-platego-candidate-input]").length,
  audit: window.__plategoClickAudit
}))()`);
await delay(300);
const entryAfter = await page.evaluate(`(() => ({
  gate: document.documentElement.dataset.plategoEntryGate,
  mode: document.documentElement.dataset.plategoSelectionMode,
  scoredCards: document.querySelector("#platego-extension-host").shadowRoot.querySelectorAll(".number").length,
  scanPresent: Boolean(document.querySelector("#platego-extension-host").shadowRoot.querySelector("[data-action=scan]")),
  fixtureRandomNumbers: document.querySelectorAll("[data-platego-random-number]").length,
  candidateInputs: document.querySelectorAll("[data-platego-candidate-input]").length,
  audit: window.__plategoClickAudit
}))()`);
assert(entryBefore.gate === entryAfter.gate && entryAfter.mode === "entry", "Extension advanced an unfinished entry gate");
assert(entryAfter.scoredCards === 0 && entryAfter.fixtureRandomNumbers === 0, "Extension exposed random numbers before entry was ready");
assert(!entryAfter.scanPresent && entryAfter.candidateInputs === 0, "Extension enabled self-compose before entry was ready");
assertNoExtensionPageActions(entryAfter.audit, "unfinished entry gate");

const MAX_ENTRY_GATE_ACTIONS = 8;
const entryGateActions = [];
const confirmInfoActions = [];
for (let attempt = 0; attempt < MAX_ENTRY_GATE_ACTIONS; attempt += 1) {
  const gateState = await page.evaluate(`(() => ({
    gate: document.documentElement.dataset.plategoEntryGate || "UNKNOWN",
    mode: document.documentElement.dataset.plategoSelectionMode || "unknown",
    actionText: document.querySelector("[data-platego-user-gate-action]")?.textContent?.trim() || "",
    gateActionDisabled: document.querySelector("[data-platego-user-gate-action]")?.disabled ?? true,
    confirmInfoPresent: Boolean(document.querySelector("[data-platego-user-confirm-info]")),
    confirmInfoChecked: document.querySelector("[data-platego-user-confirm-info]")?.checked ?? null
  }))()`);
  if (gateState.gate === "SELECTION_READY") break;
  assert(gateState.mode === "entry", `Entry gate unexpectedly left entry mode: ${JSON.stringify(gateState)}`);
  if (gateState.confirmInfoPresent && !gateState.confirmInfoChecked) {
    assert(gateState.gate === "BASIC_INFO_REQUIRED", `Confirmation checkbox appeared under an unexpected gate: ${JSON.stringify(gateState)}`);
    assert(gateState.gateActionDisabled, "Confirmation gate action was enabled before the user checked the confirmation box");
    confirmInfoActions.push({gate: gateState.gate, actionText: gateState.actionText});
    await page.evaluate("window.__plategoTestUserClick('[data-platego-user-confirm-info]')");
    await waitFor(page, "document.querySelector('[data-platego-user-confirm-info]')?.checked === true", "user-confirmed simulated information");
  }
  await waitFor(page, "Boolean(document.querySelector('[data-platego-user-gate-action]:not(:disabled)'))", `user action for ${gateState.gate}`);
  entryGateActions.push(gateState);
  await page.evaluate("window.__plategoTestUserClick('[data-platego-user-gate-action]')");
  await delay(100);
}

const finalEntryGate = await page.evaluate("document.documentElement.dataset.plategoEntryGate || 'UNKNOWN'");
assert(finalEntryGate === "SELECTION_READY", `Entry gate did not reach SELECTION_READY within ${MAX_ENTRY_GATE_ACTIONS} user actions: ${JSON.stringify(entryGateActions)}`);
assert(entryGateActions.length > 0, "Fixture reached selection without an explicit user-owned entry action");
assert(confirmInfoActions.length === 1, `Expected one user-owned information confirmation action, got ${confirmInfoActions.length}`);
await waitFor(page, "document.documentElement.dataset.plategoSelectionMode === 'random'", "selection-ready random page");
await waitFor(page, "document.querySelector('#platego-extension-host').shadowRoot.textContent.includes('只读读取 0 个号码')", "empty random read-only status");
const emptyRandomReceipt = await page.evaluate(`(() => ({
  fixtureCards: document.querySelectorAll("[data-platego-random-number]").length,
  scoredCards: document.querySelector("#platego-extension-host").shadowRoot.querySelectorAll(".number").length,
  resetText: document.querySelector("[data-platego-random-reset]")?.textContent || "",
  confirmationVisible: Boolean(document.querySelector("[data-platego-user-confirm-selection]")),
  audit: window.__plategoClickAudit
}))()`);
assert(emptyRandomReceipt.fixtureCards === 0 && emptyRandomReceipt.scoredCards === 0, "Random page did not begin empty");
assert(emptyRandomReceipt.resetText.includes("随机一次"), "Initial user-owned random action is missing");
assert(emptyRandomReceipt.confirmationVisible, "Visible user confirmation control is missing from random mode");
assertNoExtensionPageActions(emptyRandomReceipt.audit, "empty random page");

await page.evaluate("window.__plategoTestUserClick('[data-platego-random-reset]')");
await waitFor(page, "document.querySelectorAll('[data-platego-random-number]').length === 10", "user-started random batch");
await waitFor(page, "document.querySelector('#platego-extension-host').shadowRoot.querySelectorAll('.number').length === 10", "ten read-only random scores");
const randomReceipt = await page.evaluate(`(() => {
  const root = document.querySelector("#platego-extension-host").shadowRoot;
  return {
    cards: root.querySelectorAll(".number").length,
    fixtureCards: document.querySelectorAll("[data-platego-random-number]").length,
    selectedCards: document.querySelectorAll("[data-platego-random-number][aria-pressed='true']").length,
    audit: window.__plategoClickAudit
  };
})()`);
assert(randomReceipt.cards === 10 && randomReceipt.fixtureCards === 10, `Expected 10 read-only scored random cards, got ${randomReceipt.cards}`);
assert(randomReceipt.selectedCards === 0, "Extension selected a random number while scoring the batch");
assert(randomReceipt.audit.user.gate === entryGateActions.length && randomReceipt.audit.user.confirmInfo === confirmInfoActions.length && randomReceipt.audit.user.initialRandom === 1, "User-owned entry/confirmation/random actions were not accounted separately");
assert(randomReceipt.audit.user.changeBatch === 0 && randomReceipt.audit.user.randomNumber === 0, "Smoke selected a number or changed batch while testing read-only scoring");
assertNoExtensionPageActions(randomReceipt.audit, "user-started random batch");

await page.evaluate("window.__plategoTestUserClick('[data-platego-user-enter-self]')");
await waitFor(page, "!document.querySelector('#platego-extension-host').shadowRoot.querySelector('[data-action=scan]').disabled", "verified self-compose adapter");
const probeOriginal = "8";
await page.evaluate(`(() => {
  const input = document.querySelector("[data-platego-candidate-input='0']");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, ${JSON.stringify(probeOriginal)});
  input.dispatchEvent(new Event("input", {bubbles: true}));
  input.dispatchEvent(new Event("change", {bubbles: true}));
  return true;
})()`);
await waitFor(page, `document.querySelector("[data-platego-candidate-input='0']").value === ${JSON.stringify(probeOriginal)}`, "non-empty probe seed");
await page.evaluate("document.querySelector('#platego-extension-host').shadowRoot.querySelector('[data-action=scan]').click(); true");
await waitFor(page, "document.querySelector('#platego-extension-host').shadowRoot.textContent.includes('全部可达前缀已遍历')", "complete keyboard traversal", 90_000);

const scanReceipt = await page.evaluate(`(() => {
  const root = document.querySelector("#platego-extension-host").shadowRoot;
  return {
    text: root.textContent,
    firstInput: document.querySelector("[data-platego-candidate-input='0']").value,
    inputCount: document.querySelectorAll("[data-platego-candidate-input]").length,
    keyboardPresent: Boolean(document.querySelector("[data-platego-keyboard] [data-platego-key]")),
    backspacePresent: Boolean(document.querySelector("[data-platego-backspace]")),
    validateVisible: Boolean(document.querySelector("[data-platego-user-validate]")),
    audit: window.__plategoClickAudit
  };
})()`);
assert(scanReceipt.text.includes("complete"), "Coverage was not complete");
assert(scanReceipt.text.includes("收集 240 个完整组合"), "Did not enumerate all 240 fixture terminals");
assert(scanReceipt.text.includes("保留 1") && scanReceipt.text.includes("移除 1") && scanReceipt.text.includes("新增 15"), "Candidate diff did not include retained/removed/added buckets");
assert(scanReceipt.firstInput === probeOriginal, "Non-empty probe input was not restored after traversal");
assert(scanReceipt.inputCount === 5 && scanReceipt.keyboardPresent && scanReceipt.backspacePresent, "Self-compose fixture contract changed during traversal");
assert(scanReceipt.validateVisible, "Visible user validation control is missing from self-compose mode");
assert(scanReceipt.audit.user.enterSelf === 1, "User-owned self-compose transition was not accounted separately");
assertNoExtensionPageActions(scanReceipt.audit, "complete keyboard traversal");

await page.evaluate("document.querySelector('#platego-extension-host').shadowRoot.querySelector('[data-action=apply-diff]').click(); true");
await waitFor(page, "document.querySelector('#platego-extension-host').shadowRoot.textContent.includes('候选池已在插件本机更新')", "confirmed local candidate update");
const storedConfig = await worker.evaluate("new Promise((resolve) => chrome.storage.local.get('platego_config', (items) => resolve(items.platego_config)))");
assert(storedConfig.orderedCandidates.some((item) => item.value === "沪A88888"), "Retained candidate was lost");
assert(!storedConfig.orderedCandidates.some((item) => item.value === "沪AZZZZZ"), "Invalid candidate was not removed");
assert(storedConfig.orderedCandidates.length === 16, `Expected retained + 15 added candidates, got ${storedConfig.orderedCandidates.length}`);

await page.evaluate("document.querySelector('#platego-extension-host').shadowRoot.querySelector('[data-action=fill-group]').click(); true");
await waitFor(page, "[...document.querySelectorAll('[data-platego-candidate-input]')].every((input) => input.value.length === 5)", "first candidate group fill");
const firstGroup = await page.evaluate("[...document.querySelectorAll('[data-platego-candidate-input]')].map((input) => input.value)");
await page.evaluate("document.querySelector('#platego-extension-host').shadowRoot.querySelector('[data-action=next-group]').click(); true");
await page.evaluate("document.querySelector('#platego-extension-host').shadowRoot.querySelector('[data-action=fill-group]').click(); true");
await waitFor(page, `${JSON.stringify(firstGroup)}.some((value, index) => document.querySelectorAll('[data-platego-candidate-input]')[index].value !== value)`, "second candidate group fill");
const fillReceipt = await page.evaluate(`(() => ({
  values: [...document.querySelectorAll("[data-platego-candidate-input]")].map((input) => input.value),
  results: [...document.querySelectorAll(".official-candidate-inputs i")].map((item) => item.className),
  validateEnabled: !document.querySelector("[data-platego-user-validate]").disabled,
  audit: window.__plategoClickAudit
}))()`);
assert(fillReceipt.values.every((value) => value.length === 5), "Grouped fill produced an invalid suffix");
assert(fillReceipt.results.every((value) => value === "empty"), "Grouped fill implicitly validated candidates");
assert(fillReceipt.validateEnabled, "Grouped fill did not leave a real user validation action available");
assertNoExtensionPageActions(fillReceipt.audit, "grouped candidate fill");

await page.evaluate("document.querySelector('#platego-extension-host').shadowRoot.querySelector('[data-action=upload]').click(); true");
await waitFor(page, "document.querySelector('#platego-extension-host').shadowRoot.textContent.includes('公共模拟观察已上传')", "confirmed public simulation upload");
const uploadReceipt = await worker.evaluate("new Promise((resolve) => chrome.storage.local.get('platego_last_public_observation', (items) => resolve(items.platego_last_public_observation)))");
assert(uploadReceipt.namespace === "simulation" && uploadReceipt.regionCode === "310000" && uploadReceipt.plateType === "small_blue" && uploadReceipt.coverage === "complete", "Public observation receipt escaped Shanghai simulation/complete scope");
assert(JSON.stringify(Object.keys(uploadReceipt).sort()) === JSON.stringify(["coverage", "namespace", "observationHash", "plateType", "regionCode", "uploadedAt"].sort()), "Public observation receipt contains a non-public field");
const observationSummaryResponse = await fetch("http://localhost:8789/v1/pools/observations/summary");
assert(observationSummaryResponse.ok, `Fixture API summary failed: HTTP ${observationSummaryResponse.status}`);
const observationSummary = await observationSummaryResponse.json();
assert(observationSummary.simulation >= 1 && observationSummary.live === 0, "Fixture API mixed simulation and live observations");

const dashboardTab = await worker.evaluate("new Promise((resolve) => chrome.tabs.create({url: chrome.runtime.getURL('index.html')}, (tab) => resolve(tab.id)))");
assert(Number.isInteger(dashboardTab), "Could not open independent extension workbench");
const dashboardTarget = await waitForTarget((target) => target.type === "page" && target.url === `chrome-extension://${extensionId}/index.html`);
const dashboard = new CdpClient(dashboardTarget.webSocketDebuggerUrl);
await waitFor(dashboard, "document.body.innerText.includes('独立插件工作台') && document.body.innerText.includes('优选候选')", "independent workbench");
const dashboardText = await dashboard.evaluate("document.body.innerText");
assert(dashboardText.includes("16"), "Workbench did not hydrate the content-script candidate update from chrome.storage");

const finalClickAudit = await page.evaluate("window.__plategoClickAudit");
assertNoExtensionPageActions(finalClickAudit, "final fixture receipt");
assert(finalClickAudit.user.gate === entryGateActions.length && finalClickAudit.user.confirmInfo === confirmInfoActions.length && finalClickAudit.user.initialRandom === 1 && finalClickAudit.user.enterSelf === 1, "Expected user-owned fixture transitions were not recorded");
for (const action of ["changeBatch", "randomNumber", "validate", "confirmSelection", "submit"]) {
  assert(finalClickAudit.user[action] === 0, `Smoke unexpectedly activated user-only action: ${action}`);
}

console.log(JSON.stringify({
  extensionId,
  entryGateTrace: [...entryGateActions.map((item) => item.gate), finalEntryGate],
  entryGateActions,
  confirmInfoActions,
  randomScored: randomReceipt.cards,
  coverage: "complete",
  visitedTerminals: 240,
  candidateDiff: { retained: 1, removed: 1, added: 15 },
  storedCandidates: storedConfig.orderedCandidates.length,
  groupOne: firstGroup,
  groupTwo: fillReceipt.values,
  publicObservation: uploadReceipt,
  observationSummary,
  pageClickAudit: finalClickAudit,
  dashboardStorageHydrated: true
}, null, 2));

dashboard.close();
page.close();
worker.close();
