import { useEffect, useMemo, useState } from "react";
import {
  SHANGHAI_12123_SEGMENT_PUB,
  SHANGHAI_12123_SELECT,
  type PlateConfig,
  type PoolSnapshot
} from "@platego/core";
import { getSimulatedPool } from "@platego/sim-data";
import { ConfigCenter } from "./ConfigCenter";
import { Dashboard } from "./Dashboard";
import { KeyPanel } from "./KeyPanel";
import { PoolExplorer } from "./PoolExplorer";
import { PreferencePresets } from "./PreferencePresets";
import { Simulator } from "./Simulator";
import { clearCapturedPool, loadApiBase, loadCapturedPoolSync, loadConfig, loadExtensionConfig, saveApiBase, saveConfig, snapshotFromCapturedPool } from "./storage";
import { SectionHeader, StatusDot } from "./ui";

export interface PlateGoAppProps {
  surface: "web" | "extension";
  officialMockUrl?: string;
}

const TAB_IDS = ["home", "prefs", "pool", "simulator", "key", "config"] as const;
type AppTab = (typeof TAB_IDS)[number];

const NAV_ITEMS: Array<{ id: AppTab; label: string; icon: string }> = [
  { id: "home", label: "导航", icon: "⌂" },
  { id: "prefs", label: "偏好预设", icon: "◇" },
  { id: "pool", label: "号池筛选", icon: "⌕" },
  { id: "simulator", label: "模拟选号", icon: "◎" },
  { id: "key", label: "时限密钥", icon: "⌁" }
];

function tabFromHash(): AppTab {
  const id = window.location.hash.replace(/^#/, "");
  return (TAB_IDS as readonly string[]).includes(id) ? id as AppTab : "home";
}

export function PlateGoApp({ surface, officialMockUrl }: PlateGoAppProps) {
  const [activeTab, setActiveTab] = useState<AppTab>(tabFromHash);
  const [config, setConfig] = useState<PlateConfig>(loadConfig);
  const [apiBase, setApiBase] = useState(loadApiBase);
  const [remoteSnapshot, setRemoteSnapshot] = useState<PoolSnapshot>();
  const [capturedPool, setCapturedPool] = useState(loadCapturedPoolSync);
  const [storageReady, setStorageReady] = useState(surface !== "extension");
  const localSnapshot = useMemo(() => getSimulatedPool(config.regionCode, config.plateType), [config.regionCode, config.plateType]);
  const capturedSnapshot = capturedPool ? snapshotFromCapturedPool(capturedPool, localSnapshot) : undefined;
  const snapshot = remoteSnapshot?.namespace === "simulation"
    && remoteSnapshot.regionCode === config.regionCode
    && remoteSnapshot.plateType === config.plateType
    ? remoteSnapshot
    : capturedSnapshot || localSnapshot;
  const inSelection = activeTab === "simulator";

  useEffect(() => {
    if (surface !== "extension") return;
    let active = true;
    void loadExtensionConfig().then((stored) => {
      if (!active) return;
      if (stored) setConfig(stored);
      setStorageReady(true);
    });
    return () => { active = false; };
  }, [surface]);

  useEffect(() => {
    if (storageReady) saveConfig(config, surface);
  }, [config, storageReady, surface]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [activeTab]);

  useEffect(() => {
    const syncHash = () => setActiveTab(tabFromHash());
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const openTab = (tab: string) => {
    const next = (TAB_IDS as readonly string[]).includes(tab) ? tab as AppTab : "home";
    setActiveTab(next);
    if (window.location.hash.replace(/^#/, "") !== next) {
      window.history.replaceState(null, "", `#${next}`);
    }
  };

  const updateConfig = (next: PlateConfig) => {
    if (next.regionCode !== config.regionCode || next.plateType !== config.plateType) setRemoteSnapshot(undefined);
    setConfig(next);
  };

  const updateApiBase = (value: string) => {
    setApiBase(value);
    saveApiBase(value, surface);
  };

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => openTab("home")} aria-label="返回导航">
        <span className="brand-mark"><i /><b>P</b></span>
        <span><strong>PlateGo</strong><small>号牌沙盘</small></span>
      </button>
      {!inSelection && <nav aria-label="主要功能">{NAV_ITEMS.map((item) => <button key={item.id} aria-current={activeTab === item.id ? "page" : undefined} className={activeTab === item.id ? "active" : ""} onClick={() => openTab(item.id)}><i>{item.icon}</i>{item.label}</button>)}</nav>}
      {inSelection && <nav aria-label="选号过程"><button type="button" onClick={() => openTab("home")}>返回导航</button></nav>}
      <div className="topbar-meta">
        {!inSelection && <>
          <a className="source-switch" href={SHANGHAI_12123_SELECT} target="_blank" rel="noreferrer">12123 选号站</a>
          <a className="source-switch" href={SHANGHAI_12123_SEGMENT_PUB} target="_blank" rel="noreferrer">号段公示</a>
        </>}
        {snapshot.source === "local-demo-latest" && <button className="source-switch" onClick={() => setRemoteSnapshot(undefined)}>切回免费固定数据</button>}
        {snapshot.source === "official-capture" && <button className="source-switch" onClick={() => { clearCapturedPool(surface); setCapturedPool(undefined); }}>切回内置号池</button>}
        <span className="namespace-badge">模拟空间</span>
        <span className="surface-badge">{surface === "extension" ? "插件独立版" : "网页独立版"}</span>
      </div>
    </header>

    <main>
      {activeTab === "home" && <Dashboard surface={surface} config={config} snapshot={snapshot} onConfig={updateConfig} onNavigate={openTab} officialMockUrl={officialMockUrl} />}
      {activeTab === "prefs" && <div className="page-stack">
        <SectionHeader
          eyebrow="偏好预设"
          title="随机高亮，和自编要筛的组合"
          detail="左边决定随机批次标哪些号；右边决定号池按哪些组合和号段建立候选。偏好只留在本机。"
          action={<StatusDot tone="blue">两栏预设</StatusDot>}
        />
        <PreferencePresets config={config} snapshot={snapshot} onConfig={updateConfig} onNavigate={openTab} />
      </div>}
      {activeTab === "pool" && <PoolExplorer surface={surface} config={config} snapshot={snapshot} onConfig={updateConfig} />}
      {activeTab === "simulator" && <Simulator key={`${config.regionCode}:${config.plateType}:${snapshot.version}`} surface={surface} config={config} snapshot={snapshot} apiBase={apiBase.replace(/\/$/, "")} onConfig={updateConfig} />}
      {activeTab === "config" && <ConfigCenter config={config} onConfig={updateConfig} />}
      {activeTab === "key" && <KeyPanel surface={surface} config={config} apiBase={apiBase} onApiBase={updateApiBase} onSnapshot={setRemoteSnapshot} />}
    </main>

    <footer><span>PlateGo Local v0.1</span><span>模拟数据 ≠ 官方实时可用状态</span><span>广告接口默认关闭</span><span>自动动作止于填入，验证与提交由用户完成</span></footer>
  </div>;
}
