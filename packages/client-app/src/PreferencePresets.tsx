import { useMemo, useState } from "react";
import {
  SUGGESTED_COMPOSE_COMBINATIONS,
  SUGGESTED_SEGMENTS,
  plateSegmentLetter,
  toggleUniqueItem,
  type PlateConfig,
  type PoolSnapshot
} from "@platego/core";
import { getCatalog } from "@platego/sim-data";
import { Card } from "./ui";

function segmentsFromSnapshot(snapshot: PoolSnapshot): string[] {
  const found = new Set<string>(SUGGESTED_SEGMENTS);
  for (const value of snapshot.values) {
    const letter = plateSegmentLetter(value);
    if (/^[A-HJ-NP-Z]$/.test(letter)) found.add(letter);
  }
  return [...found].sort();
}

export function PreferencePresets({
  config,
  snapshot,
  onConfig,
  onNavigate,
  compact = false
}: {
  config: PlateConfig;
  snapshot: PoolSnapshot;
  onConfig(config: PlateConfig): void;
  onNavigate?(tab: string): void;
  compact?: boolean;
}) {
  const catalog = getCatalog();
  const [customCombo, setCustomCombo] = useState("");
  const segments = useMemo(() => segmentsFromSnapshot(snapshot), [snapshot]);
  const highlight = config.highlightPrefs;
  const compose = config.composePrefs;

  const updateHighlight = (patch: Partial<PlateConfig["highlightPrefs"]>) => {
    onConfig({ ...config, highlightPrefs: { ...highlight, ...patch } });
  };

  const addCustomCombo = () => {
    const next = toggleUniqueItem(compose.combinations, customCombo);
    if (next === compose.combinations) return;
    onConfig({ ...config, composePrefs: { ...compose, combinations: next } });
    setCustomCombo("");
  };

  return <div className={`pref-grid ${compact ? "compact" : ""}`}>
    <Card className="pref-card">
      <div className="card-kicker">随机选号</div>
      <h3>高亮哪些号码</h3>
      <p>随机批次里按这些规则标外框。顺子里的 0 不参与；不替你点换批或确认。</p>
      <div className="pref-toggles">
        <label className="tip-row">
          <input type="checkbox" checked={highlight.pair} onChange={(event) => updateHighlight({ pair: event.target.checked })} />
          <span>相同数字<small>2 次标框；三连或 AABB 形式增加泛光</small></span>
        </label>
        <input
          className="tip-filter"
          value={highlight.pairDigits}
          disabled={!highlight.pair}
          onChange={(event) => updateHighlight({ pairDigits: [...new Set((event.target.value.match(/\d/g) ?? []))].join("") })}
          placeholder="可选：6、8、9；留空高亮全部相同数字"
          inputMode="numeric"
          autoComplete="off"
        />
        <label className="tip-row">
          <input type="checkbox" checked={highlight.sequence} onChange={(event) => updateHighlight({ sequence: event.target.checked })} />
          <span>顺序号<small>三位连续起；四位连续或 1221 / 12321 回环增加泛光</small></span>
        </label>
        <input
          className="tip-filter"
          value={highlight.sequenceTargets}
          disabled={!highlight.sequence}
          onChange={(event) => updateHighlight({ sequenceTargets: event.target.value.replace(/[^0-9,，、\s]/g, "").slice(0, 80) })}
          placeholder="可选：123、567、876；留空高亮全部顺序号"
          inputMode="numeric"
          autoComplete="off"
        />
        <label className="tip-row">
          <input type="checkbox" checked={highlight.many} onChange={(event) => updateHighlight({ many: event.target.checked })} />
          <span>好多数<small>同一数字 3 次标框；4 次或多个数字同时命中增加泛光</small></span>
        </label>
        <input
          className="tip-filter"
          value={highlight.manyDigits}
          disabled={!highlight.many}
          onChange={(event) => updateHighlight({ manyDigits: [...new Set((event.target.value.match(/\d/g) ?? []))].join("") })}
          placeholder="可选：6、8、9；留空高亮全部好多数"
          inputMode="numeric"
          autoComplete="off"
        />
      </div>
      <p>特定号码已统一放到位置与顺序规则中，随机和自编共用规则内容。</p>
    </Card>

    <Card className="pref-card">
      <div className="card-kicker">自编选号</div>
      <h3>筛选哪些组合</h3>
      <p>这些条件会带到号池筛选，用来建立你自己的候选号码池。建议可先点 1024、2048、400、520、1314。</p>
      <div className="chip-row">
        {[...new Set([...SUGGESTED_COMPOSE_COMBINATIONS, ...compose.combinations])].map((item) => (
          <button
            type="button"
            key={`compose-${item}`}
            className={`chip ${compose.combinations.includes(item) ? "on" : ""}`}
            onClick={() => onConfig({
              ...config,
              composePrefs: { ...compose, combinations: toggleUniqueItem(compose.combinations, item) }
            })}
          >{item}</button>
        ))}
      </div>
      <div className="chip-add">
        <input
          value={customCombo}
          onChange={(event) => setCustomCombo(event.target.value.toUpperCase())}
          onKeyDown={(event) => { if (event.key === "Enter") addCustomCombo(); }}
          placeholder="自定义组合，如 886"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="button" className="button small secondary" disabled={!customCombo.trim()} onClick={addCustomCombo}>加入</button>
      </div>
      <div className="card-kicker segment-kicker">号段</div>
      <div className="chip-row">
        {segments.map((item) => (
          <button
            type="button"
            key={`seg-${item}`}
            className={`chip ${compose.segments.includes(item) ? "on" : ""}`}
            onClick={() => onConfig({
              ...config,
              composePrefs: {
                ...compose,
                segments: compose.segments.includes(item)
                  ? compose.segments.filter((entry) => entry !== item)
                  : [...compose.segments, item]
              }
            })}
          >{snapshot.prefix.replace(/[A-Z].*$/, "") || "沪"}{item}</button>
        ))}
      </div>
    </Card>

    <Card className="pref-cta">
      <div className="form-grid two">
        <label>模拟地区
          <select value={config.regionCode} onChange={(event) => onConfig({ ...config, regionCode: event.target.value })}>
            {catalog.regions.map((region) => <option key={region.code} value={region.code}>{region.shortName}</option>)}
          </select>
        </label>
        <label>号牌类型
          <select value={config.plateType} onChange={(event) => onConfig({ ...config, plateType: event.target.value as PlateConfig["plateType"] })}>
            {catalog.plateTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
          </select>
        </label>
      </div>
      <p>当前号池 {snapshot.values.length} 个组合。选好组合和号段后，到号池里确认并加入优选。</p>
      <div className="button-row">
        <button type="button" className="button primary" onClick={() => onNavigate?.("pool")}>去号池创建候选</button>
        {!compact && <button type="button" className="button quiet" onClick={() => onNavigate?.("config")}>更多规则与导入</button>}
      </div>
    </Card>
  </div>;
}
