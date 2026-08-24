import { useEffect, useMemo, useState } from "react";
import type { PlateConfig, PoolSnapshot } from "@platego/core";
import { getSimulatedPool } from "@platego/sim-data";
import { ConfigCenter } from "./ConfigCenter";
import { Dashboard } from "./Dashboard";
import { KeyPanel } from "./KeyPanel";
import { PoolExplorer } from "./PoolExplorer";
import { Simulator } from "./Simulator";
import { loadApiBase, loadConfig, loadExtensionConfig, saveApiBase, saveConfig } from "./storage";

export interface PlateGoAppProps {
  surface: "web" | "extension";
  officialMockUrl?: string;
}

const NAV_ITEMS = [
  { id: "home", label: "准备", icon: "⌂" },
  { id: "pool", label: "号池筛选", icon: "⌕" },
  { id: "simulator", label: "模拟选号", icon: "◎" },
  { id: "config", label: "策略配置", icon: "◇" },
  { id: "key", label: "时限密钥", icon: "⌁" }
];

export function PlateGoApp({ surface, officialMockUrl }: PlateGoAppProps) {
  const [activeTab, setActiveTab] = useState("home");
  const [config, setConfig] = useState<PlateConfig>(loadConfig);
  const [apiBase, setApiBase] = useState(loadApiBase);
  const [remoteSnapshot, setRemoteSnapshot] = useState<PoolSnapshot>();
  const [storageReady, setStorageReady] = useState(surface !== "extension");
  const localSnapshot = useMemo(() => getSimulatedPool(config.regionCode, config.plateType), [config.regionCode, config.plateType]);
  const snapshot = remoteSnapshot?.namespace === "simulation"
    && remoteSnapshot.regionCode === config.regionCode
    && remoteSnapshot.plateType === config.plateType
    ? remoteSnapshot
    : localSnapshot;

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
      <button className="brand" onClick={() => setActiveTab("home")} aria-label="返回首页">
        <span className="brand-mark"><i /><b>P</b></span>
        <span><strong>PlateGo</strong><small>号牌沙盘</small></span>
      </button>
      <nav aria-label="主要功能">{NAV_ITEMS.map((item) => <button key={item.id} aria-current={activeTab === item.id ? "page" : undefined} className={activeTab === item.id ? "active" : ""} onClick={() => setActiveTab(item.id)}><i>{item.icon}</i>{item.label}</button>)}</nav>
      <div className="topbar-meta">
        {snapshot.source === "local-demo-latest" && <button className="source-switch" onClick={() => setRemoteSnapshot(undefined)}>切回免费固定数据</button>}
        <span className="namespace-badge">模拟空间</span>
        <span className="surface-badge">{surface === "extension" ? "插件独立版" : "网页独立版"}</span>
      </div>
    </header>

    <main>
      {activeTab === "home" && <Dashboard surface={surface} config={config} snapshot={snapshot} onConfig={updateConfig} onNavigate={setActiveTab} officialMockUrl={officialMockUrl} />}
      {activeTab === "pool" && <PoolExplorer surface={surface} config={config} snapshot={snapshot} onConfig={updateConfig} />}
      {activeTab === "simulator" && <Simulator key={`${config.regionCode}:${config.plateType}:${snapshot.version}`} surface={surface} config={config} snapshot={snapshot} apiBase={apiBase.replace(/\/$/, "")} onConfig={updateConfig} />}
      {activeTab === "config" && <ConfigCenter config={config} onConfig={updateConfig} />}
      {activeTab === "key" && <KeyPanel config={config} apiBase={apiBase} onApiBase={updateApiBase} onSnapshot={setRemoteSnapshot} />}
    </main>

    <footer><span>PlateGo Local v0.1</span><span>模拟数据 ≠ 官方实时可用状态</span><span>广告接口默认关闭</span><span>自动动作止于填入，验证与提交由用户完成</span></footer>
  </div>;
}
