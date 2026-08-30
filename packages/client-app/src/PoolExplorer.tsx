import { useEffect, useMemo, useState } from "react";
import {
  filterAndScorePool,
  newId,
  normalizePositionPatterns,
  normalizePositionSlot,
  positionPatternIsActive,
  type PlateConfig,
  type PoolFilter,
  type PoolSnapshot,
  type PositionPattern,
  type PositionPatternMode,
  type ScoredValue
} from "@platego/core";
import { getCatalog } from "@platego/sim-data";
import { AdSlot } from "./ad";
import { Card, EmptyState, SectionHeader, StatusDot } from "./ui";

const INITIAL_VISIBLE_RESULTS = 80;
const LOAD_MORE_RESULTS = 40;

interface PatternSummary {
  count: number;
  examples: string[];
  active: boolean;
}

function filterFromPrefs(config: PlateConfig): PoolFilter {
  return {
    minScore: 0,
    containsAny: config.composePrefs.combinations,
    segments: config.composePrefs.segments,
    plateType: config.plateType,
    positionPatterns: config.composePrefs.positionPatterns
  };
}

function provinceCharacter(prefix: string): string {
  return Array.from(prefix).find((character) => /^[\u3400-\u9fff]$/u.test(character)) ?? "沪";
}

function buildPattern(
  id: string,
  plateType: PlateConfig["plateType"],
  slots: string[],
  mode: PositionPatternMode,
  enabledRandom = true,
  enabledSelf = true
): PositionPattern | undefined {
  return normalizePositionPatterns([{ id, plateType, slots, mode, enabledRandom, enabledSelf }])[0];
}

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
  const [filter, setFilter] = useState<PoolFilter>(() => filterFromPrefs(config));
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_RESULTS);
  const catalog = getCatalog();
  const slotCount = config.plateType === "small_nev" ? 7 : 6;
  const province = provinceCharacter(snapshot.prefix);
  const currentPatterns = useMemo(
    () => config.composePrefs.positionPatterns.filter((pattern) => pattern.plateType === config.plateType),
    [config.composePrefs.positionPatterns, config.plateType]
  );
  const patternLabels = useMemo(
    () => new Map(currentPatterns.map((pattern, index) => [pattern.id, `规则 ${index + 1}`])),
    [currentPatterns]
  );
  const normalizedFilter = useMemo<PoolFilter>(() => {
    const requestedPrefix = filter.prefix?.trim().toUpperCase();
    return {
      ...filter,
      containsAny: config.composePrefs.combinations,
      segments: config.composePrefs.segments,
      plateType: config.plateType,
      positionPatterns: config.composePrefs.positionPatterns,
      prefix: !requestedPrefix || requestedPrefix.startsWith(snapshot.prefix)
        ? requestedPrefix
        : `${snapshot.prefix}${requestedPrefix}`
    };
  }, [filter, snapshot.prefix, config.plateType, config.composePrefs]);
  const results = useMemo(
    () => filterAndScorePool(snapshot.values, config.rules, normalizedFilter),
    [snapshot.values, config.rules, normalizedFilter]
  );
  const rowSummaries = useMemo(() => new Map<string, PatternSummary>(currentPatterns.map((pattern) => {
    if (!positionPatternIsActive(pattern) || !pattern.enabledSelf) return [pattern.id, { count: 0, examples: [], active: false }];
    const matches = filterAndScorePool(snapshot.values, config.rules, {
      ...normalizedFilter,
      plateType: config.plateType,
      positionPatterns: [pattern]
    });
    return [pattern.id, {
      count: matches.length,
      examples: matches.slice(0, 3).map((item) => item.value),
      active: true
    }];
  })), [currentPatterns, snapshot.values, config.rules, config.plateType, normalizedFilter]);

  useEffect(() => setFilter(filterFromPrefs(config)), [snapshot.regionCode, snapshot.plateType]);
  useEffect(() => setVisibleCount(INITIAL_VISIBLE_RESULTS), [normalizedFilter, snapshot.version]);

  const updatePatterns = (positionPatterns: PositionPattern[]) => {
    onConfig({
      ...config,
      composePrefs: { ...config.composePrefs, positionPatterns }
    });
  };

  const addPattern = () => {
    if (config.composePrefs.positionPatterns.length >= 20) return;
    const pattern = buildPattern(newId("pattern"), config.plateType, Array(slotCount).fill(""), "fixed");
    if (pattern) updatePatterns([...config.composePrefs.positionPatterns, pattern]);
  };

  const updatePattern = (id: string, changes: { slots?: string[]; mode?: PositionPatternMode; enabledRandom?: boolean; enabledSelf?: boolean }) => {
    const source = config.composePrefs.positionPatterns.find((pattern) => pattern.id === id);
    if (!source) return;
    const next = buildPattern(
      source.id,
      source.plateType,
      changes.slots ?? [...source.slots],
      changes.mode ?? source.mode,
      changes.enabledRandom ?? source.enabledRandom,
      changes.enabledSelf ?? source.enabledSelf
    );
    if (!next) return;
    updatePatterns(config.composePrefs.positionPatterns.map((pattern) => pattern.id === id ? next : pattern));
  };

  const updatePatternSlot = (pattern: PositionPattern, index: number, value: string) => {
    const slots = [...pattern.slots];
    slots[index] = normalizePositionSlot(value);
    updatePattern(pattern.id, { slots });
  };

  const duplicatePattern = (source: PositionPattern) => {
    if (config.composePrefs.positionPatterns.length >= 20) return;
    const duplicate = buildPattern(newId("pattern"), source.plateType, [...source.slots], source.mode, source.enabledRandom, source.enabledSelf);
    if (!duplicate) return;
    updatePatterns(config.composePrefs.positionPatterns.flatMap((pattern) => (
      pattern.id === source.id ? [pattern, duplicate] : [pattern]
    )));
  };

  const deletePattern = (id: string) => {
    updatePatterns(config.composePrefs.positionPatterns.filter((pattern) => pattern.id !== id));
  };

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

  const addTop = (limit: number) => {
    const existing = new Set(config.orderedCandidates.map((item) => item.value));
    const additions = results.filter((item) => !existing.has(item.value)).slice(0, limit).map((item) => ({
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
      title={`${snapshot.regionName} · ${snapshot.prefix} ${snapshot.source === "official-capture" ? "现场读取号池" : "固定模拟号池"}`}
      detail={snapshot.disclaimer}
      action={<StatusDot tone={snapshot.source === "official-capture" || snapshot.source === "local-demo-latest" ? "blue" : "green"}>{snapshot.source === "official-capture" ? "现场读取" : snapshot.source === "local-demo-latest" ? "密钥数据样例" : "内置免费数据"}</StatusDot>}
    />

    <Card className="pattern-builder-card">
      <div className="pattern-builder-heading">
        <div>
          <div className="card-kicker">自编匹配规则</div>
          <h3>{config.plateType === "small_nev" ? "新能源号牌 · 7 位" : "传统燃油车号牌 · 6 位"}</h3>
          <p>省份简称不参与填写。空格表示不限；默认按位置匹配，关闭后只保持填写字符的先后顺序。</p>
        </div>
        <div className="pattern-builder-actions">
          <span>{config.composePrefs.positionPatterns.length}/20 条</span>
          <button className="button small primary" type="button" onClick={addPattern} disabled={config.composePrefs.positionPatterns.length >= 20}>新建匹配规则</button>
        </div>
      </div>

      {currentPatterns.length === 0 ? <div className="pattern-empty">
        <span>还没有当前号牌类型的匹配规则</span>
        <button className="text-button" type="button" onClick={addPattern}>创建第一条规则</button>
      </div> : <div className="pattern-list">
        {currentPatterns.map((pattern, index) => {
          const summary = rowSummaries.get(pattern.id);
          return <div className="pattern-row" key={pattern.id}>
            <div className="pattern-row-head">
              <div>
                <strong>规则 {index + 1}</strong>
                <span>{summary?.active ? `匹配 ${summary.count} 个号码` : "尚未填写，不参与筛选"}</span>
              </div>
              <div className="pattern-row-actions">
                <span>{pattern.mode === "fixed" ? "限定位置" : "匹配顺序"}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pattern.mode === "fixed"}
                  aria-label={`规则 ${index + 1} 限定位置`}
                  className={`toggle ${pattern.mode === "fixed" ? "on" : ""}`}
                  onClick={() => updatePattern(pattern.id, { mode: pattern.mode === "fixed" ? "ordered" : "fixed" })}
                ><i /></button>
                <button className="text-button" type="button" onClick={() => duplicatePattern(pattern)} disabled={config.composePrefs.positionPatterns.length >= 20}>复制</button>
                <button className="text-button danger-text" type="button" onClick={() => deletePattern(pattern.id)}>删除</button>
              </div>
            </div>

            <div className="position-editor" aria-label={`规则 ${index + 1} 号牌位置`}>
              <b className="position-province" aria-label="省份简称">{province}</b>
              <div className={`position-slots slots-${slotCount}`}>
                {pattern.slots.map((slot, slotIndex) => <label key={`${pattern.id}-${slotIndex}`}>
                  <span>第 {slotIndex + 1} 位</span>
                  <input
                    value={slot}
                    maxLength={1}
                    pattern="[A-HJ-NP-Z0-9]"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="·"
                    aria-label={`规则 ${index + 1} 第 ${slotIndex + 1} 位，空白表示不限`}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => updatePatternSlot(pattern, slotIndex, event.target.value)}
                  />
                </label>)}
              </div>
            </div>

            <div className={`pattern-row-foot ${summary?.active && summary.count === 0 ? "no-match" : ""}`}>
              {summary?.active ? <>
                <strong>{summary.count === 0 ? "当前没有命中" : `命中 ${summary.count} 个`}</strong>
                {summary.examples.length > 0 && <span>例如 {summary.examples.join("、")}</span>}
                {summary.count > summary.examples.length && <small>其余结果已合并到下方列表</small>}
              </> : <span>可以只填一位，也可以填写多位；留空的位置不会限制结果。</span>}
            </div>
          </div>;
        })}
      </div>}
      <p className="scope-note"><strong>本地配置</strong>匹配规则只保存在当前网页或插件的本地配置中，不会上传公共号池。</p>
    </Card>

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
      {(config.composePrefs.combinations.length > 0 || config.composePrefs.segments.length > 0) && <div className="chip-row pref-filter-chips">
        {config.composePrefs.combinations.map((item) => <span className="chip on" key={`combo-${item}`}>{item}</span>)}
        {config.composePrefs.segments.map((item) => <span className="chip on" key={`seg-${item}`}>{snapshot.prefix.replace(/[A-Z].*$/, "") || "沪"}{item}</span>)}
      </div>}
      <div className="filter-summary">
        <span>从 {snapshot.values.length} 个{snapshot.source === "official-capture" ? "现场读取" : "固定模拟"}号码中找到 <strong>{results.length}</strong> 个组合</span>
        <button className="text-button" type="button" onClick={() => setFilter(filterFromPrefs(config))}>清空本页条件</button>
        <div className="filter-add-actions">
          <button className="button small quiet" type="button" onClick={() => addTop(5)} disabled={!results.length}>前 5 个加入优选</button>
          <button className="button small primary" type="button" onClick={() => addTop(20)} disabled={!results.length}>前 20 个加入优选</button>
        </div>
      </div>
      {results.length > 500 && <div className="result-volume-warning"><strong>结果较多</strong><span>当前共有 {results.length} 个匹配号码。建议再增加一位条件，或先查看每条规则的示例。</span></div>}
      <p className="scope-note"><strong>合并结果</strong>多条规则之间采用“任意一条匹配即可”，并继续叠加本页其他筛选条件。相同号码只显示一次。</p>
    </Card>

    {results.length === 0 ? <Card><EmptyState title="没有符合条件的组合" detail="放宽位置规则、其他筛选条件或降低最低评分后再试。" /></Card> : <div className="plate-grid">
      {results.slice(0, visibleCount).map((item) => {
        const favorite = config.favorites.includes(item.value);
        const candidate = config.orderedCandidates.some((entry) => entry.value === item.value);
        const matchedLabels = item.matchedPatternIds.map((id) => patternLabels.get(id)).filter((label): label is string => Boolean(label));
        return <Card className="plate-card" key={item.value}>
          <div className="plate-card-top"><span className="score-pill">{item.score}</span><button className={`icon-button ${favorite ? "active" : ""}`} onClick={() => toggleFavorite(item.value)} aria-label={favorite ? "取消收藏" : "收藏"}>{favorite ? "★" : "☆"}</button></div>
          <strong className="plate-number">{item.value}</strong>
          <div className="reason-row">
            {matchedLabels.slice(0, 2).map((label) => <span className="pattern-source-badge" key={label}>{label}</span>)}
            {matchedLabels.length > 2 && <span className="pattern-source-badge">+{matchedLabels.length - 2}</span>}
            {item.reasons.slice(0, matchedLabels.length > 0 ? 1 : 2).map((reason) => <span key={reason}>{reason}</span>)}
            {item.reasons.length === 0 && matchedLabels.length === 0 && <span>普通组合</span>}
          </div>
          <button className={`button full small ${candidate ? "quiet" : "secondary"}`} disabled={candidate} onClick={() => addCandidate(item)}>{candidate ? "已在优选中" : "加入优选"}</button>
        </Card>;
      })}
    </div>}
    {visibleCount < results.length && <div className="load-more-row">
      <span>已显示 {Math.min(visibleCount, results.length)} / {results.length}</span>
      <button className="button quiet" type="button" onClick={() => setVisibleCount((count) => count + LOAD_MORE_RESULTS)}>再显示 {Math.min(LOAD_MORE_RESULTS, results.length - visibleCount)} 个</button>
    </div>}
    {results.length > 0 && visibleCount >= results.length && <p className="list-footnote">已显示全部 {results.length} 个匹配结果。</p>}
    <AdSlot slot="pool-footer" surface={surface} />
  </div>;
}
