import { useEffect, useMemo, useState } from "react";
import {
  filterAndScorePool,
  newId,
  type PlateConfig,
  type PoolFilter,
  type PoolSnapshot,
  type ScoredValue
} from "@platego/core";
import { getCatalog } from "@platego/sim-data";
import { AdSlot } from "./ad";
import { Card, EmptyState, SectionHeader, StatusDot } from "./ui";

export function PoolExplorer({
  surface,
  config,
  snapshot,
  onConfig
}: {
  surface: "web" | "extension";
  config: PlateConfig;
  snapshot: PoolSnapshot;
  onConfig(config: PlateConfig): void;
}) {
  const [filter, setFilter] = useState<PoolFilter>({ minScore: 0 });
  const catalog = getCatalog();
  const normalizedFilter = useMemo<PoolFilter>(() => {
    const requestedPrefix = filter.prefix?.trim().toUpperCase();
    return {
      ...filter,
      prefix: !requestedPrefix || requestedPrefix.startsWith(snapshot.prefix)
        ? requestedPrefix
        : `${snapshot.prefix}${requestedPrefix}`
    };
  }, [filter, snapshot.prefix]);
  const results = useMemo(
    () => filterAndScorePool(snapshot.values, config.rules, normalizedFilter),
    [snapshot, config.rules, normalizedFilter]
  );

  useEffect(() => setFilter({ minScore: 0 }), [snapshot.regionCode, snapshot.plateType]);

  const toggleFavorite = (value: string) => {
    const exists = config.favorites.includes(value);
    onConfig({ ...config, favorites: exists ? config.favorites.filter((item) => item !== value) : [...config.favorites, value] });
  };

  const addCandidate = (item: ScoredValue) => {
    if (config.orderedCandidates.some((candidate) => candidate.value === item.value)) return;
    onConfig({
      ...config,
      orderedCandidates: [...config.orderedCandidates, {
        id: newId("candidate"),
        value: item.value,
        source: "pool",
        score: item.score,
        createdAt: new Date().toISOString()
      }]
    });
  };

  const addTop = () => {
    const existing = new Set(config.orderedCandidates.map((item) => item.value));
    const additions = results.filter((item) => !existing.has(item.value)).slice(0, 10).map((item) => ({
      id: newId("candidate"),
      value: item.value,
      source: "rule" as const,
      score: item.score,
      createdAt: new Date().toISOString()
    }));
    onConfig({ ...config, orderedCandidates: [...config.orderedCandidates, ...additions] });
  };

  return <div className="page-stack">
    <SectionHeader
      eyebrow="号池筛选器"
      title={`${snapshot.regionName} · ${snapshot.prefix} 固定模拟号池`}
      detail={snapshot.disclaimer}
      action={<StatusDot tone={snapshot.source === "local-demo-latest" ? "blue" : "green"}>{snapshot.source === "local-demo-latest" ? "密钥数据样例" : "内置免费数据"}</StatusDot>}
    />

    <Card className="filter-card">
      <div className="form-grid pool-filters">
        <label>模拟地区
          <select value={config.regionCode} onChange={(event) => onConfig({ ...config, regionCode: event.target.value })}>
            {catalog.regions.map((region) => <option value={region.code} key={region.code}>{region.shortName}</option>)}
          </select>
        </label>
        <label>号牌类型
          <select value={config.plateType} onChange={(event) => onConfig({ ...config, plateType: event.target.value as PlateConfig["plateType"] })}>
            {catalog.plateTypes.map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}
          </select>
        </label>
        <label>后缀以此开头
          <div className="prefixed-input"><b>{snapshot.prefix}</b><input value={filter.prefix ?? ""} placeholder={config.plateType === "small_nev" ? "D8" : "A8"} onChange={(event) => setFilter({ ...filter, prefix: event.target.value.toUpperCase() })} /></div>
        </label>
        <label>必须包含
          <input value={filter.contains ?? ""} placeholder="例如 88" onChange={(event) => setFilter({ ...filter, contains: event.target.value.toUpperCase() })} />
        </label>
        <label>排除字符
          <input value={filter.excludes ?? ""} placeholder="例如 4" onChange={(event) => setFilter({ ...filter, excludes: event.target.value.toUpperCase() })} />
        </label>
        <label>最低评分 <b>{filter.minScore ?? 0}</b>
          <input type="range" min="0" max="100" step="5" value={filter.minScore ?? 0} onChange={(event) => setFilter({ ...filter, minScore: Number(event.target.value) })} />
        </label>
      </div>
      <div className="filter-summary">
        <span>从 {snapshot.values.length} 个固定模拟号码中找到 <strong>{results.length}</strong> 个组合</span>
        <button className="text-button" onClick={() => setFilter({ minScore: 0 })}>清空条件</button>
        <button className="button small primary" onClick={addTop} disabled={!results.length}>前 10 个加入优选</button>
      </div>
      <p className="scope-note"><strong>模拟空间</strong> 本页不会读取或合并真实公共观察；切换地区仍使用当前应用内置的固定版本。</p>
    </Card>

    {results.length === 0 ? <Card><EmptyState title="没有符合条件的组合" detail="放宽筛选条件或降低最低评分后再试。" /></Card> : <div className="plate-grid">
      {results.slice(0, 80).map((item) => {
        const favorite = config.favorites.includes(item.value);
        const candidate = config.orderedCandidates.some((entry) => entry.value === item.value);
        return <Card className="plate-card" key={item.value}>
          <div className="plate-card-top"><span className="score-pill">{item.score}</span><button className={`icon-button ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(item.value)} aria-label={favorite ? "取消收藏" : "收藏"}>{favorite ? "★" : "☆"}</button></div>
          <strong className="plate-number">{item.value}</strong>
          <div className="reason-row">{item.reasons.slice(0, 2).map((reason) => <span key={reason}>{reason}</span>)}{item.reasons.length === 0 && <span>普通组合</span>}</div>
          <button className={`button full small ${candidate ? "quiet" : "secondary"}`} disabled={candidate} onClick={() => addCandidate(item)}>{candidate ? "已在优选中" : "加入优选"}</button>
        </Card>;
      })}
    </div>}
    {results.length > 80 && <p className="list-footnote">当前仅展示评分最高的 80 个结果；继续收紧条件可查看更多目标组合。</p>}
    <AdSlot slot="pool-footer" surface={surface} />
  </div>;
}
