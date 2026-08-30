import { useMemo, useState } from "react";
import {
  buildCandidateDiff,
  createObservation,
  filterAndScorePool,
  newId,
  type CandidateDiff,
  type PlateConfig,
  type PoolSnapshot,
  type PublicPoolObservation
} from "@platego/core";
import { OfficialSelectionFlow, type OfficialSelectionController } from "./OfficialSelectionFlow";
import { selectionRulesForRegion } from "./officialSelectionState";

export function Simulator({
  surface,
  config,
  snapshot,
  apiBase,
  onConfig
}: {
  surface: "web" | "extension";
  config: PlateConfig;
  snapshot: PoolSnapshot;
  apiBase: string;
  onConfig(config: PlateConfig): void;
}) {
  const rules = selectionRulesForRegion(snapshot.regionCode);
  return <div className="pg-simulator-page">
    <OfficialSelectionFlow
      snapshot={snapshot}
      surface={surface}
      rules={rules}
      renderAssistant={(controller) => <SelectionAssistant
        controller={controller}
        surface={surface}
        config={config}
        snapshot={snapshot}
        apiBase={apiBase}
        onConfig={onConfig}
      />}
    />
  </div>;
}

function SelectionAssistant({ controller, surface, config, snapshot, apiBase, onConfig }: {
  controller: OfficialSelectionController;
  surface: "web" | "extension";
  config: PlateConfig;
  snapshot: PoolSnapshot;
  apiBase: string;
  onConfig(config: PlateConfig): void;
}) {
  const [captureState, setCaptureState] = useState<"idle" | "running" | "done">("idle");
  const [diff, setDiff] = useState<CandidateDiff>();
  const [observation, setObservation] = useState<PublicPoolObservation>();
  const [candidateMessage, setCandidateMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadBusy, setUploadBusy] = useState(false);
  const [groupIndex, setGroupIndex] = useState(0);
  const [assistantMessage, setAssistantMessage] = useState("助手已就绪，官方模拟区仍由你亲自操作。");

  const scoredPool = useMemo(() => filterAndScorePool(snapshot.values, config.rules), [snapshot.values, config.rules]);
  const scoredBatch = useMemo(() => controller.currentBatch.map((value) =>
    scoredPool.find((item) => item.value === value) ?? { value, score: 50, reasons: [] }), [controller.currentBatch, scoredPool]);
  const eligibleCandidates = config.orderedCandidates.filter((item) => item.value.startsWith(snapshot.prefix));
  const groupSize = controller.rules.intentSlots;
  const groupCount = Math.max(1, Math.ceil(eligibleCandidates.length / groupSize));
  const safeGroupIndex = Math.min(groupIndex, groupCount - 1);
  const currentGroup = eligibleCandidates.slice(safeGroupIndex * groupSize, safeGroupIndex * groupSize + groupSize);

  const recordCandidate = (value: string, score: number, source: "pool" | "capture" = "pool") => {
    if (config.orderedCandidates.some((item) => item.value === value)) {
      setCandidateMessage(`${value} 已在本机有序候选中。`);
      return;
    }
    onConfig({
      ...config,
      orderedCandidates: [...config.orderedCandidates, {
        id: newId("candidate"),
        value,
        score,
        source,
        createdAt: new Date().toISOString()
      }]
    });
    setCandidateMessage(`已将 ${value} 记录到本机有序候选；没有替你点击官方号码。`);
  };

  const runCapture = () => {
    setDiff(undefined);
    setObservation(undefined);
    setCandidateMessage("");
    setUploadMessage("");
    setCaptureState("running");
    window.setTimeout(() => {
      const previous = config.orderedCandidates
        .map((item) => item.value)
        .filter((value) => value.startsWith(snapshot.prefix));
      const generated = scoredPool.slice(0, 15).map((item) => item.value);
      setDiff(buildCandidateDiff(previous, snapshot.values, generated, "complete"));
      setObservation(createObservation({
        namespace: "simulation",
        regionCode: snapshot.regionCode,
        plateType: snapshot.plateType,
        prefix: snapshot.prefix,
        transitions: snapshot.graph.transitions,
        terminals: snapshot.graph.terminals,
        coverage: "complete",
        observedAt: new Date().toISOString(),
        adapterVersion: "platego-local-simulator-v2",
        source: surface === "web" ? "web-simulator" : "extension-simulator"
      }));
      setCaptureState("done");
      setAssistantMessage("固定模拟键盘已完整遍历；验证、确认和提交均未触发。");
    }, 420);
  };

  const resolveDiff = (applyChanges: boolean) => {
    if (!diff) return;
    if (!applyChanges) {
      setCandidateMessage("已保留原候选顺序，本次差异没有写入本机配置。");
      setDiff(undefined);
      return;
    }
    const invalid = new Set(diff.invalid);
    const retained = config.orderedCandidates.filter((item) => !invalid.has(item.value));
    const existing = new Set(retained.map((item) => item.value));
    const additions = diff.added
      .filter((value) => !existing.has(value))
      .slice(0, 15)
      .map((value) => {
        const scored = scoredPool.find((item) => item.value === value);
        return {
          id: newId("capture"),
          value,
          score: scored?.score ?? 50,
          source: "capture" as const,
          createdAt: new Date().toISOString()
        };
      });
    onConfig({ ...config, orderedCandidates: [...retained, ...additions] });
    setCandidateMessage(`已按你的确认更新本机候选：移除 ${diff.invalid.length} 个，新增 ${additions.length} 个。`);
    setDiff(undefined);
  };

  const uploadSimulationObservation = async () => {
    if (!observation) return;
    if (observation.namespace !== "simulation" || !["web-simulator", "extension-simulator"].includes(observation.source)) {
      setUploadMessage("已安全停止：这里只允许 simulation 命名空间的模拟观察。");
      return;
    }
    setUploadBusy(true);
    try {
      if (!apiBase) throw new Error("未配置后端地址");
      const response = await fetch(`${apiBase}/v1/pools/observations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(observation)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setUploadMessage("模拟观察已上传到 simulation 空间；候选、规则、收藏和身份资料均未上传。");
    } catch (error) {
      setUploadMessage(`模拟观察未上传（${(error as Error).message}）。离线筛选、采集与填入不受影响。`);
    } finally {
      setUploadBusy(false);
    }
  };

  const fillCurrentGroup = () => {
    controller.fillIntents(currentGroup.map((item) => item.value));
    setAssistantMessage(`已只填入第 ${safeGroupIndex + 1} 组 ${currentGroup.length} 个候选，现已交还给你；助手不会触发确认选号。`);
  };

  return <aside className="pg-assistant" aria-label="PlateGo 选号助手">
    <header className="pg-assistant-header">
      <div><span>PLATEGO</span><h2>选号助手</h2><p>与上方官方结构模拟区明确分离，只处理本机候选与 simulation 观察。</p></div>
      <div className="pg-assistant-boundary"><strong>自动动作边界</strong><span>读取 / 评分 / 记录 / 填入 / 退格 / 遍历</span><b>不验证 · 不确认 · 不提交</b></div>
    </header>
    <div className="pg-assistant-status" role="status">{assistantMessage}</div>

    <div className="pg-assistant-grid">
      <section>
        <div className="pg-assistant-section-title"><div><small>本批辅助</small><h3>号码评分与候选记录</h3></div><span>{scoredBatch.length} 个可读号码</span></div>
        {scoredBatch.length ? <div className="pg-score-list">{scoredBatch.map((item) => {
          const recorded = config.orderedCandidates.some((candidate) => candidate.value === item.value);
          return <div key={item.value}><strong>{item.value}</strong><span>评分 {item.score}</span><small>{item.reasons[0] ?? "固定模拟号池"}</small><button type="button" disabled={recorded} onClick={() => recordCandidate(item.value, item.score)}>{recorded ? "已记录" : "记录候选"}</button></div>;
        })}</div> : <div className="pg-assistant-empty">上方尚未由用户随机一批。助手不会代替点击“随机一次”。</div>}
        {candidateMessage && <p className="pg-helper-message">{candidateMessage}</p>}
      </section>

      <section>
        <div className="pg-assistant-section-title"><div><small>完整采集</small><h3>键盘图与候选差异</h3></div><span>coverage: {captureState === "done" ? "complete" : "pending"}</span></div>
        <p className="pg-helper-copy">遍历固定模拟键盘的全部可达前缀，只执行填入与退格；完成后先展示差异，再由你决定是否更新本机候选。</p>
        <div className="pg-helper-actions"><button type="button" className="pg-helper-primary" disabled={captureState === "running"} onClick={runCapture}>{captureState === "running" ? "正在完整遍历…" : captureState === "done" ? "重新完整遍历" : "开始完整遍历"}</button><button type="button" disabled={!observation || uploadBusy} onClick={() => void uploadSimulationObservation()}>{uploadBusy ? "上传中…" : "单独上传 simulation 观察"}</button></div>
        {diff && <div className="pg-diff-summary"><div><strong>保留 {diff.retained.length}</strong><span>{diff.retained.slice(0, 3).join("、") || "无"}</span></div><div><strong>移除 {diff.invalid.length}</strong><span>{diff.invalid.slice(0, 3).join("、") || "无"}</span></div><div><strong>未知 {diff.unknown.length}</strong><span>{diff.unknown.slice(0, 3).join("、") || "无"}</span></div><div><strong>建议新增 {diff.added.length}</strong><span>{diff.added.slice(0, 3).join("、") || "无"}</span></div></div>}
        {diff && <div className="pg-helper-actions"><button type="button" onClick={() => resolveDiff(false)}>保留原候选</button><button type="button" className="pg-helper-primary" onClick={() => resolveDiff(true)}>确认更新到本机</button></div>}
        {uploadMessage && <p className="pg-helper-message">{uploadMessage}</p>}
      </section>
    </div>

    <section className="pg-fill-section">
      <div className="pg-assistant-section-title"><div><small>有序候选</small><h3>分组填入后立即交还用户</h3></div><span>第 {safeGroupIndex + 1} / {groupCount} 组</span></div>
      {currentGroup.length ? <div className="pg-fill-candidates">{Array.from({ length: groupSize }, (_, index) => <div key={index}><span>意向 {index + 1}</span><strong>{currentGroup[index]?.value ?? "空"}</strong></div>)}</div> : <div className="pg-assistant-empty">当前地区还没有有序候选。可从本批评分记录，或在“偏好预设 / 号池筛选”中加入。</div>}
      <div className="pg-fill-footer"><div><button type="button" disabled={safeGroupIndex === 0} onClick={() => setGroupIndex(Math.max(0, safeGroupIndex - 1))}>上一组</button><button type="button" disabled={safeGroupIndex >= groupCount - 1} onClick={() => setGroupIndex(Math.min(groupCount - 1, safeGroupIndex + 1))}>下一组</button></div><button type="button" className="pg-helper-primary" disabled={!currentGroup.length} onClick={fillCurrentGroup}>填入本组（不验证）</button></div>
      <p className="pg-helper-handoff">填入完成后，助手不会显示或触发产品内“最终确认”；请回到上方官方结构模拟区，由你决定是否验证或确认选号。</p>
    </section>
  </aside>;
}
