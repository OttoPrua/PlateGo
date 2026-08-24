import type { PlateConfig, PoolSnapshot } from "@platego/core";
import { getCatalog } from "@platego/sim-data";
import { AdSlot } from "./ad";
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
  const catalog = getCatalog();
  const updateRegion = (regionCode: string) => onConfig({ ...config, regionCode });
  const updatePlateType = (plateType: PlateConfig["plateType"]) => onConfig({ ...config, plateType });

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow={surface === "extension" ? "独立插件工作台" : "独立网页工作台"}
        title="先把策略准备好，再把每次机会用明白"
        detail="固定模拟号池已经随当前应用打包。断开后端后，筛选、收藏、配置和完整模拟流程仍然可用。"
        action={<StatusDot tone="green">本地数据就绪</StatusDot>}
      />

      <div className="hero-grid">
        <Card className="setup-card">
          <div className="card-kicker">本次准备</div>
          <div className="form-grid two">
            <label>模拟地区
              <select value={config.regionCode} onChange={(event) => updateRegion(event.target.value)}>
                {catalog.regions.map((region) => <option key={region.code} value={region.code}>{region.shortName}</option>)}
              </select>
            </label>
            <label>号牌类型
              <select value={config.plateType} onChange={(event) => updatePlateType(event.target.value as PlateConfig["plateType"])}>
                {catalog.plateTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
              </select>
            </label>
          </div>
          <div className="snapshot-line">
            <div><span>当前前缀</span><strong className="plate-prefix">{snapshot.prefix}</strong></div>
            <div><span>可练习号码</span><strong>{snapshot.values.length}</strong></div>
            <div><span>数据版本</span><strong>{snapshot.version}</strong></div>
          </div>
          <div className="button-row">
            <button className="button primary" onClick={() => onNavigate("pool")}>先筛选号池</button>
            <button className="button secondary" onClick={() => onNavigate("simulator")}>直接开始模拟</button>
          </div>
        </Card>

        <Card className="privacy-card">
          <div className="shield-mark">私</div>
          <div>
            <div className="card-kicker">隐私边界</div>
            <h3>偏好留在本机，公共状态才可上传</h3>
            <p>候选顺序、收藏、规则、最终选择、身份信息和页面内容不会进入公共号池。上传前还必须由你确认。</p>
          </div>
        </Card>
      </div>

      <div className="metric-grid">
        <Card><span className="metric-label">收藏</span><strong className="metric-value">{config.favorites.length}</strong><small>仅本地</small></Card>
        <Card><span className="metric-label">优选候选</span><strong className="metric-value">{config.orderedCandidates.length}</strong><small>按顺序填入</small></Card>
        <Card><span className="metric-label">偏好规则</span><strong className="metric-value">{config.rules.filter((rule) => rule.enabled).length}</strong><small>参与本地评分</small></Card>
        <Card><span className="metric-label">免费地区</span><strong className="metric-value">{catalog.regions.length}</strong><small>内置固定模拟池</small></Card>
      </div>

      <Card>
        <div className="workflow-row">
          {[
            ["01", "筛选", "从固定号池建立收藏和优选规则"],
            ["02", "随机选号", "读取每组号码，评分但不替你点击"],
            ["03", "自编采集", "遍历键盘、对比候选变化"],
            ["04", "填入候选", "只填输入框，验证和提交由你完成"]
          ].map(([number, title, detail]) => <div className="workflow-step" key={number}>
            <span>{number}</span><strong>{title}</strong><small>{detail}</small>
          </div>)}
        </div>
      </Card>

      {officialMockUrl && <Card className="mock-callout">
        <div><div className="card-kicker">上海首个适配方向</div><h3>打开本地“官方页样机”</h3><p>样机按两阶段六步骤还原基本信息、确认信息、服务说明、手机验证、预选号牌与完成页，并独立标记为模拟空间；请勿填写任何真实资料。</p></div>
        <a className="button secondary" href={officialMockUrl} target="_blank" rel="noreferrer">打开样机</a>
      </Card>}
      <AdSlot slot="dashboard-footer" surface={surface} />
    </div>
  );
}
