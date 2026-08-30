import {
  SHANGHAI_12123_HOME,
  SHANGHAI_12123_SEGMENT_PUB,
  SHANGHAI_12123_SELECT,
  type PlateConfig,
  type PoolSnapshot
} from "@platego/core";
import { AdSlot } from "./ad";
import { PreferencePresets } from "./PreferencePresets";
import { Card, SectionHeader, StatusDot } from "./ui";

export function Dashboard({
  surface,
  config,
  snapshot,
  onConfig,
  onNavigate,
  officialMockUrl
}: {
  surface: "web" | "extension";
  config: PlateConfig;
  snapshot: PoolSnapshot;
  onConfig(config: PlateConfig): void;
  onNavigate(tab: string): void;
  officialMockUrl?: string;
}) {
  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow={surface === "extension" ? "独立插件工作台" : "独立网页工作台"}
        title="先定偏好，再去 12123"
        detail="登录和基本信息阶段先把随机高亮、自编组合和号段准备好，再进号池建立自己的候选。选号过程中这组导航会收起。"
        action={<StatusDot tone="green">本机导航</StatusDot>}
      />

      <div className="landing-link-grid">
        <a className="card landing-link" href={SHANGHAI_12123_SELECT} target="_blank" rel="noreferrer">
          <div className="card-kicker">交管 12123</div>
          <h3>打开上海选号站</h3>
          <p>跳转到上海互联网预选号牌模拟入口。登录、验证和确认选号仍由你完成。</p>
        </a>
        <a className="card landing-link" href={SHANGHAI_12123_SEGMENT_PUB} target="_blank" rel="noreferrer">
          <div className="card-kicker">号段公示</div>
          <h3>12123 号池公布</h3>
          <p>打开上海站「互联网预选号牌号池公布」。官方页可能要求先登录，我们不会代你抓取号段。</p>
        </a>
        <a className="card landing-link" href={SHANGHAI_12123_HOME} target="_blank" rel="noreferrer">
          <div className="card-kicker">上海 12123</div>
          <h3>交通安全平台首页</h3>
          <p>回到 sh.122.gov.cn 首页，可再进入机动车业务或其他公示。</p>
        </a>
        {officialMockUrl && <a className="card landing-link" href={officialMockUrl} target="_blank" rel="noreferrer">
          <div className="card-kicker">本地样机</div>
          <h3>打开官方页样机</h3>
          <p>按两阶段六步骤练习，不连接真实身份，请勿填写真实资料。</p>
        </a>}
      </div>

      <PreferencePresets
        config={config}
        snapshot={snapshot}
        onConfig={onConfig}
        onNavigate={onNavigate}
        compact
      />

      <div className="metric-grid">
        <Card><span className="metric-label">收藏</span><strong className="metric-value">{config.favorites.length}</strong><small>仅本地</small></Card>
        <Card><span className="metric-label">优选候选</span><strong className="metric-value">{config.orderedCandidates.length}</strong><small>按顺序填入</small></Card>
        <Card><span className="metric-label">自编组合</span><strong className="metric-value">{config.composePrefs.combinations.length}</strong><small>带到号池筛选</small></Card>
        <Card><span className="metric-label">号段</span><strong className="metric-value">{config.composePrefs.segments.length || "全"}</strong><small>未选表示不限号段</small></Card>
      </div>
      <AdSlot slot="dashboard-footer" surface={surface} />
    </div>
  );
}
