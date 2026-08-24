import { useMemo, useRef, useState } from "react";
import {
  decodePlateConfig,
  encodePlateConfig,
  newId,
  scoreValue,
  type PlateConfig,
  type PreferenceKind
} from "@platego/core";
import { getSimulatedPool } from "@platego/sim-data";
import { Card, EmptyState, SectionHeader, StatusDot } from "./ui";
import { normalizePlateConfig } from "./storage";

const RULE_KINDS: Array<{ value: PreferenceKind; label: string }> = [
  { value: "contains", label: "包含" },
  { value: "prefix", label: "开头是" },
  { value: "suffix", label: "结尾是" },
  { value: "avoid", label: "避开" },
  { value: "repeat", label: "重复字符" },
  { value: "sequence", label: "连续数字" }
];

export function ConfigCenter({ config, onConfig }: { config: PlateConfig; onConfig(config: PlateConfig): void }) {
  const [ruleKind, setRuleKind] = useState<PreferenceKind>("contains");
  const [ruleTarget, setRuleTarget] = useState("88");
  const [ruleWeight, setRuleWeight] = useState(20);
  const [manualCandidate, setManualCandidate] = useState("");
  const [candidateMessage, setCandidateMessage] = useState("可输入完整号码，或只输入当前地区的后缀。");
  const [transfer, setTransfer] = useState("");
  const [message, setMessage] = useState("配置不包含时限密钥、会话令牌或任何身份信息。");
  const fileRef = useRef<HTMLInputElement>(null);
  const encoded = useMemo(() => encodePlateConfig(config), [config]);
  const snapshot = useMemo(() => getSimulatedPool(config.regionCode, config.plateType), [config.regionCode, config.plateType]);

  const addRule = () => {
    const needsTarget = !["repeat", "sequence"].includes(ruleKind);
    if (needsTarget && !ruleTarget.trim()) return;
    const label = `${RULE_KINDS.find((item) => item.value === ruleKind)?.label ?? ruleKind}${needsTarget ? ` ${ruleTarget.toUpperCase()}` : ""}`;
    onConfig({
      ...config,
      rules: [...config.rules, {
        id: newId("rule"),
        label,
        kind: ruleKind,
        target: needsTarget ? ruleTarget.toUpperCase() : "",
        weight: ruleWeight,
        enabled: true
      }]
    });
  };

  const moveCandidate = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= config.orderedCandidates.length) return;
    const next = [...config.orderedCandidates];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onConfig({ ...config, orderedCandidates: next });
  };

  const addManualCandidate = () => {
    const raw = manualCandidate.trim().toUpperCase().replace(/\s/g, "");
    const suffix = raw.startsWith(snapshot.prefix) ? raw.slice(snapshot.prefix.length) : raw;
    if (!new RegExp(`^[A-HJ-NP-Z0-9]{${snapshot.graph.maxLength}}$`).test(suffix)) {
      setCandidateMessage(`请输入 ${snapshot.prefix} 后的 ${snapshot.graph.maxLength} 位字母或数字（不使用 I、O）。`);
      return;
    }
    const value = `${snapshot.prefix}${suffix}`;
    if (config.orderedCandidates.some((candidate) => candidate.value === value)) {
      setCandidateMessage(`${value} 已在候选池中。`);
      return;
    }
    const scored = scoreValue(value, config.rules);
    onConfig({
      ...config,
      orderedCandidates: [...config.orderedCandidates, {
        id: newId("manual"),
        value,
        source: "manual",
        score: scored.score,
        createdAt: new Date().toISOString()
      }]
    });
    setManualCandidate("");
    setCandidateMessage(`${value} 已加入末尾；它是你的本地自编候选，不代表当前模拟号池可用。`);
  };

  const addFavoriteCandidate = (value: string) => {
    if (config.orderedCandidates.some((candidate) => candidate.value === value)) return;
    const scored = scoreValue(value, config.rules);
    onConfig({ ...config, orderedCandidates: [...config.orderedCandidates, {
      id: newId("favorite"), value, source: "favorite", score: scored.score, createdAt: new Date().toISOString()
    }] });
  };

  const importConfig = (value: string) => {
    try {
      const trimmed = value.trim();
      const decoded = trimmed.startsWith("PS1:") ? decodePlateConfig(trimmed) : JSON.parse(trimmed) as unknown;
      const next = normalizePlateConfig(decoded);
      onConfig(next);
      setMessage(`已安全导入 ${next.favorites.length} 个收藏、${next.orderedCandidates.length} 个优选候选；密钥和未知字段已排除。`);
    } catch (error) {
      setMessage(`导入失败：${(error as Error).message}`);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(encoded);
      setMessage("PS1 配置已复制，可粘贴到网页或插件。密钥不会随配置传输。");
    } catch {
      setTransfer(encoded);
      setMessage("浏览器未开放剪贴板权限，已把配置放入下方文本框供手动复制。");
    }
  };

  const download = () => {
    const exported = normalizePlateConfig({ ...config, exportedAt: new Date().toISOString() });
    const blob = new Blob([`${JSON.stringify(exported, null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `PlateGo-${config.regionCode}-${new Date().toISOString().slice(0, 10)}.platecfg`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    const value = await file.text();
    setTransfer(value.trim());
    importConfig(value);
  };

  return <div className="page-stack">
    <SectionHeader eyebrow="本地策略中心" title="规则、收藏与有序候选池" detail="这些内容只存放在当前浏览器。导出时使用带校验和的 PS1 文本或 .platecfg 文件。" action={<StatusDot tone="blue">本机保存</StatusDot>} />

    <div className="two-column">
      <Card>
        <div className="card-title-row"><div><div className="card-kicker">偏好规则</div><h3>{config.rules.length} 条规则</h3></div></div>
        <div className="rule-builder">
          <select value={ruleKind} onChange={(event) => setRuleKind(event.target.value as PreferenceKind)}>{RULE_KINDS.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select>
          <input value={ruleTarget} disabled={["repeat", "sequence"].includes(ruleKind)} onChange={(event) => setRuleTarget(event.target.value)} placeholder="字符或数字" />
          <label className="weight-field">权重 {ruleWeight}<input type="range" min="5" max="40" step="5" value={ruleWeight} onChange={(event) => setRuleWeight(Number(event.target.value))} /></label>
          <button className="button small primary" onClick={addRule}>添加</button>
        </div>
        <div className="rule-list">{config.rules.map((rule) => <div className="rule-item" key={rule.id}>
          <button className={`toggle ${rule.enabled ? "on" : ""}`} onClick={() => onConfig({ ...config, rules: config.rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) })}><i /></button>
          <div><strong>{rule.label}</strong><small>{rule.kind === "avoid" ? "扣分" : "加分"} {Math.abs(rule.weight)}</small></div>
          <button className="icon-button danger" onClick={() => onConfig({ ...config, rules: config.rules.filter((item) => item.id !== rule.id) })}>×</button>
        </div>)}</div>
      </Card>

      <Card>
        <div className="card-title-row"><div><div className="card-kicker">收藏</div><h3>{config.favorites.length} 个号码</h3></div></div>
        {config.favorites.length ? <div className="favorite-list">{config.favorites.map((value) => {
          const alreadyCandidate = config.orderedCandidates.some((candidate) => candidate.value === value);
          return <div className="favorite-row" key={value}><strong>{value}</strong><div><button disabled={alreadyCandidate} onClick={() => addFavoriteCandidate(value)}>{alreadyCandidate ? "已在优选" : "加入优选"}</button><button className="danger" aria-label={`取消收藏 ${value}`} onClick={() => onConfig({ ...config, favorites: config.favorites.filter((item) => item !== value) })}>×</button></div></div>;
        })}</div> : <EmptyState icon="☆" title="还没有收藏" detail="在号池筛选器里点击星标即可加入。" />}
      </Card>
    </div>

    <Card>
      <div className="card-title-row"><div><div className="card-kicker">有序候选池</div><h3>插件将按这个顺序分组填入</h3></div><span className="count-badge">{config.orderedCandidates.length}</span></div>
      <div className="manual-candidate-builder">
        <label>手动加入自编候选
          <div className="prefixed-input"><b>{snapshot.prefix}</b><input value={manualCandidate} maxLength={snapshot.graph.maxLength + snapshot.prefix.length} onChange={(event) => {
            const next = event.target.value.toUpperCase().replace(/\s/g, "");
            setManualCandidate(next.startsWith(snapshot.prefix) ? next.slice(snapshot.prefix.length) : next);
          }} onKeyDown={(event) => { if (event.key === "Enter") addManualCandidate(); }} placeholder={config.plateType === "small_nev" ? "D12345" : "A1234"} /></div>
        </label>
        <button className="button small secondary" disabled={!manualCandidate.trim()} onClick={addManualCandidate}>加入末尾</button>
        <span role="status">{candidateMessage}</span>
      </div>
      {config.orderedCandidates.length ? <div className="candidate-table">{config.orderedCandidates.map((candidate, index) => <div className="candidate-row" key={candidate.id}>
        <span className="order-number">{String(index + 1).padStart(2, "0")}</span>
        <strong className="plate-number small">{candidate.value}</strong>
        <span className="source-tag">{sourceLabel(candidate.source)}</span>
        <span className="score-tag">评分 {candidate.score}</span>
        <div className="row-actions"><button onClick={() => moveCandidate(index, -1)} disabled={index === 0}>↑</button><button onClick={() => moveCandidate(index, 1)} disabled={index === config.orderedCandidates.length - 1}>↓</button><button className="danger" onClick={() => onConfig({ ...config, orderedCandidates: config.orderedCandidates.filter((item) => item.id !== candidate.id) })}>移除</button></div>
      </div>)}</div> : <EmptyState title="候选池为空" detail="从筛选结果或模拟选号中加入候选，随后可在这里调整顺序。" />}
    </Card>

    <Card>
      <div className="card-title-row"><div><div className="card-kicker">跨端传输</div><h3>剪贴板 PS1 / .platecfg</h3></div><StatusDot tone="green">已排除密钥</StatusDot></div>
      <p className="muted" role="status">{message} 当前 PS1 长度：{encoded.length.toLocaleString("zh-CN")} 字符。</p>
      <div className="button-row">
        <button className="button primary" onClick={copy}>复制 PS1 配置</button>
        <button className="button secondary" onClick={download}>导出 .platecfg</button>
        <button className="button quiet" onClick={() => fileRef.current?.click()}>选择配置文件</button>
        <input ref={fileRef} type="file" accept=".platecfg,text/plain" hidden onChange={(event) => void readFile(event.target.files?.[0])} />
      </div>
      <textarea className="transfer-area" value={transfer} onChange={(event) => setTransfer(event.target.value)} placeholder="粘贴以 PS1: 开头的配置文本，或 .platecfg 中的 JSON……" />
      <div className="transfer-foot">
        <span>短配置适合 PS1；候选较多时优先使用 .platecfg 文件。</span>
        <button className="button small secondary" disabled={!transfer.trim()} onClick={() => importConfig(transfer)}>导入上方配置</button>
      </div>
    </Card>
  </div>;
}

function sourceLabel(source: string): string {
  return ({ pool: "固定号池", favorite: "收藏", rule: "规则优选", manual: "手动自编", capture: "采集建议" } as Record<string, string>)[source] ?? source;
}
