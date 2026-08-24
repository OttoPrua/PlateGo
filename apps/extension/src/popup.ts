import "./popup.css";

const statusElement = document.getElementById("page-status")!;
const toggleButton = document.getElementById("toggle-assistant") as HTMLButtonElement;
const dashboardButton = document.getElementById("open-dashboard") as HTMLButtonElement;

interface PageStatus {
  kind: "official-mock" | "official-unverified" | "fixture-pending" | "fixture-invalid" | "unsupported";
  fixtureVerified: boolean;
  gate: string;
  mode: string;
  automationReady: boolean;
  randomCount: number;
  realAdapterApproved: false;
}

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function setStatus(message: string, tone: "ready" | "warn" | "fail" | "neutral" = "neutral") {
  statusElement.textContent = message;
  statusElement.className = tone;
}

async function readPageStatus(tab: chrome.tabs.Tab): Promise<PageStatus | undefined> {
  if (tab.id == null) return undefined;
  try {
    return await chrome.tabs.sendMessage(tab.id, { type: "PLATEGO_GET_PAGE_STATUS" }) as PageStatus;
  } catch {
    return undefined;
  }
}

void activeTab().then(async (tab) => {
  const url = tab?.url ?? "";
  const official = /^https:\/\/sh\.122\.gov\.cn\//.test(url);
  const fixture = /^http:\/\/(127\.0\.0\.1|localhost):4173\/official-mock(?:[/?#]|$)/.test(url);
  if (!tab || (!official && !fixture)) {
    setStatus("当前不是上海官方域名或本地 official-mock；完整工作台仍可独立使用。", "neutral");
    toggleButton.disabled = true;
    return;
  }

  const page = await readPageStatus(tab);
  if (official) {
    if (!page) {
      setStatus("已识别 sh.122.gov.cn，但静态状态脚本尚未载入；真实适配未验收，自动动作保持关闭。请刷新页面后重试。", "warn");
      toggleButton.disabled = true;
      return;
    }
    toggleButton.disabled = false;
    if (page.kind !== "official-unverified" || page.realAdapterApproved !== false) {
      setStatus("上海页面返回了非预期适配状态；插件已按 fail-closed 关闭全部自动动作。", "fail");
      return;
    }
    setStatus("已识别 sh.122.gov.cn。真实 DOM 尚未现场验收：插件不读取、不填入、不采集、不上传。", "fail");
    toggleButton.textContent = "显示 / 隐藏安全状态";
    return;
  }
  if (!page) {
    setStatus("样机页面尚未载入静态内容脚本，请刷新页面后重试。", "warn");
    return;
  }
  toggleButton.disabled = false;
  if (!page.fixtureVerified) {
    setStatus("本地样机契约尚未通过，页面操作保持关闭。", "fail");
    return;
  }
  if (page.gate !== "SELECTION_READY") {
    setStatus(`本地样机已识别；等待用户完成入口步骤（${page.gate}）。`, "warn");
    return;
  }
  if (page.mode === "random") {
    setStatus(`随机选号样机就绪：只读识别 ${page.randomCount} 个号码。`, "ready");
    return;
  }
  setStatus(page.automationReady ? "自编键盘样机契约已通过，可打开安全页面助手。" : "自编键盘契约不完整，操作保持关闭。", page.automationReady ? "ready" : "fail");
});

toggleButton.addEventListener("click", async () => {
  const tab = await activeTab();
  if (tab?.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "PLATEGO_TOGGLE_ASSISTANT" });
    window.close();
  } catch {
    setStatus("静态内容脚本尚未载入。请刷新该页面后重试。", "warn");
  }
});

dashboardButton.addEventListener("click", () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});
