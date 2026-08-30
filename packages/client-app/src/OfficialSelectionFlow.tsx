import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { SHANGHAI_12123_SEGMENT_PUB, SHANGHAI_12123_SELECT, type PoolSnapshot } from "@platego/core";
import {
  OFFICIAL_FLOW_STEPS,
  allowedIntentKeys,
  buildConfiguredRandomBatch,
  canConfirmSelfCompose,
  entryGateForStep,
  evaluateSelfComposeAttempt,
  flowStepIndex,
  nextOfficialViewStep,
  nextBackupDeadline,
  remainingSeconds,
  sanitizeIntent,
  selectOneBackupPerBatch,
  selectionRulesForRegion,
  type OfficialFlowStep,
  type OfficialViewStep,
  type SelectionMode,
  type SelectionRegionRules
} from "./officialSelectionState";

function escapeSrcDoc(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

const BRAND_SEARCH_OFFICIAL_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:8px;font:12px/1.6 sans-serif;color:#333}.form-inline{display:flex;flex-wrap:wrap;gap:12px;align-items:center}.help-inline input[type=text]{height:28px;width:150px;border:1px solid #c5c5c5;padding:0 8px}table{width:100%;margin-top:10px;border-collapse:collapse}th,td{border:1px solid #eee;padding:4px;text-align:center}</style></head><body><div class="mem-block"><div id="searchHistory"><form class="form-inline" id="formsearch"><input type="hidden" id="clzl" name="clzl" value="0"><input type="hidden" id="hpzl" name="hpzl" value="52"><input type="hidden" id="lxfs" name="lxfs" value=""><div class="help-inline"><label>车辆品牌</label><input type="text" id="clpp" name="clpp" placeholder="请输入车辆品牌"></div><div class="help-inline"><label>车辆型号</label><input type="text" id="clxh" name="clxh" placeholder="请输入车辆型号" style="text-transform:uppercase"></div><div class="help-inline"><button type="button" class="btn btn-primary" id="btnSearch">查询</button></div></form></div><div id="tableContent"><table class="table table-striped"><thead><tr><th></th><th>车辆品牌</th><th>车辆型号</th></tr></thead><tbody><tr><td><input type="radio" name="ppxh" val-clpp="示例牌" val-clxh="DEMO01BEV01"></td><td title="示例牌">示例牌</td><td title="DEMO01BEV01">DEMO01BEV01</td></tr></tbody></table></div></div></body></html>`;

const BRAND_SEARCH_EASYUI_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:12px;font:12px/1.6 sans-serif;color:#333}.row{margin:8px 0;display:flex;flex-wrap:wrap;gap:10px;align-items:center}.searchbox,.textbox{position:relative;display:inline-block}.searchbox-text,.textbox-text-wrap{display:inline-block}input.textbox-text{height:28px;width:150px;border:1px solid #c5c5c5;padding:0 8px;background:#fff}.textbox-prompt,.searchbox-prompt{position:absolute;left:10px;top:5px;color:#aaa;pointer-events:none}.pager{width:28px;height:22px}</style></head><body><div>查询条件</div><div class="row"><span class="searchbox"><span class="searchbox-text"><input class="textbox-text" type="text" autocomplete="off" data-platego-vehicle-field="brand"></span><span class="searchbox-prompt">请输入车辆品牌</span><input type="hidden" class="textbox-value" name="ppmc"></span><span class="textbox"><span class="textbox-text-wrap"><input class="textbox-text" type="text" autocomplete="off" data-platego-vehicle-field="model"></span><span class="textbox-prompt">请输入车辆型号</span><input type="hidden" class="textbox-value" name="clxh"></span><input class="textbox-text pager" name="page" value="1" aria-label="页"><button type="button">查询</button></div></body></html>`;

const BRAND_SEARCH_WRAPPER_HTML = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><iframe title="查询表单" src="/veh1/netxh/queryPpxh?clzl=0&hpzl=52" style="width:100%;height:220px;border:0" srcdoc="${escapeSrcDoc(BRAND_SEARCH_OFFICIAL_HTML)}"></iframe><iframe title="EasyUI查询表单" style="width:100%;height:110px;border:0" srcdoc="${escapeSrcDoc(BRAND_SEARCH_EASYUI_HTML)}"></iframe></body></html>`;

export interface OfficialSelectionController {
  step: OfficialViewStep;
  mode: SelectionMode;
  rules: SelectionRegionRules;
  currentBatch: string[];
  currentBatchIndex: number;
  backups: Array<string | null>;
  selectedBackup: string | null;
  selfInputs: string[];
  selfRemaining: number;
  setMode(mode: SelectionMode): void;
  fillIntents(values: string[]): void;
  clearIntents(): void;
}

export interface OfficialSelectionFlowProps {
  snapshot: PoolSnapshot;
  surface: "web" | "extension" | "fixture";
  rules?: SelectionRegionRules;
  fixtureContract?: boolean;
  returnHref?: string;
  renderAssistant?: (controller: OfficialSelectionController) => ReactNode;
  workbenchHref?: string;
}

const NAV_ITEMS = ["首页", "业务办理", "服务导航", "公告公布", "APP下载", "办事指南"];
const LOGIN_TYPES = ["个人用户登录", "单位用户登录", "社会机构登录"];
const KEYBOARD = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ".split("");

export function OfficialSelectionFlow({
  snapshot,
  surface,
  rules: rulesProp,
  fixtureContract = false,
  returnHref,
  renderAssistant,
  workbenchHref = ""
}: OfficialSelectionFlowProps) {
  const rules = rulesProp ?? selectionRulesForRegion(snapshot.regionCode);
  const [step, setStep] = useState<OfficialViewStep>("LOGIN");
  const [loginType, setLoginType] = useState(LOGIN_TYPES[0]);
  const [confirmed, setConfirmed] = useState(false);
  const [otp, setOtp] = useState("123456");
  const [mode, setModeState] = useState<SelectionMode>("random");
  const [excludeFour, setExcludeFour] = useState(false);
  const [currentBatchIndex, setCurrentBatchIndex] = useState(-1);
  const [currentBatch, setCurrentBatch] = useState<string[]>([]);
  const [backups, setBackups] = useState<Array<string | null>>(() => Array(rules.randomTotal).fill(null));
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [batchDeadline, setBatchDeadline] = useState<number | null>(null);
  const [backupDeadline, setBackupDeadline] = useState<number | null>(null);
  const [selfDeadline, setSelfDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selfInputs, setSelfInputs] = useState<string[]>(() => Array(rules.intentSlots).fill(""));
  const [activeIntent, setActiveIntent] = useState(0);
  const [selfRemaining, setSelfRemaining] = useState(rules.selfComposeTotal);
  const [selfResults, setSelfResults] = useState<Array<"available" | "unavailable" | "empty">>(() => Array(rules.intentSlots).fill("empty"));
  const [selfMessage, setSelfMessage] = useState("");
  const [completedValue, setCompletedValue] = useState<string | null>(null);
  const [completedMethod, setCompletedMethod] = useState<SelectionMode>("random");

  const entryGate = entryGateForStep(step);
  const batchSeconds = remainingSeconds(batchDeadline, now);
  const backupSeconds = remainingSeconds(backupDeadline, now);
  const selfSeconds = remainingSeconds(selfDeadline, now);
  const activeValue = selfInputs[activeIntent] ?? "";
  const allowedKeys = useMemo(() => new Set(allowedIntentKeys(snapshot.graph, activeValue)), [activeValue, snapshot.graph]);
  const selfReady = selfRemaining > 0 && canConfirmSelfCompose(selfInputs, snapshot.graph.maxLength, selfSeconds);

  useEffect(() => {
    if (step !== "PLATE_SELECTION") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [step]);

  useEffect(() => {
    if (!fixtureContract) return;
    document.documentElement.dataset.plategoOfficialMock = "shanghai";
    document.documentElement.dataset.plategoEntryGate = entryGate;
    document.documentElement.dataset.plategoSelectionMode = step === "PLATE_SELECTION" || step === "COMPLETE" ? mode : "entry";
    return () => {
      delete document.documentElement.dataset.plategoOfficialMock;
      delete document.documentElement.dataset.plategoEntryGate;
      delete document.documentElement.dataset.plategoSelectionMode;
    };
  }, [entryGate, fixtureContract, mode, step]);

  const setMode = (nextMode: SelectionMode) => {
    setModeState(nextMode);
    if (nextMode === "self" && !selfDeadline) {
      const time = Date.now();
      setNow(time);
      setSelfDeadline(time + rules.selfConfirmSeconds * 1_000);
    }
  };

  const advanceEntry = () => {
    if (step === "PHONE_VERIFY" && otp !== "123456") return;
    setStep(nextOfficialViewStep(step));
  };

  const loadNextBatch = () => {
    const nextIndex = currentBatchIndex + 1;
    if (nextIndex >= rules.randomTotal) return;
    const time = Date.now();
    setNow(time);
    setCurrentBatchIndex(nextIndex);
    setCurrentBatch(buildConfiguredRandomBatch(snapshot, nextIndex, rules, excludeFour));
    setBatchDeadline(time + rules.randomBatchSeconds * 1_000);
  };

  const chooseRandomNumber = (value: string) => {
    if (batchSeconds <= 0 || currentBatchIndex < 0) return;
    const previous = backups[currentBatchIndex];
    setBackups((current) => selectOneBackupPerBatch(current, currentBatchIndex, value, rules.randomTotal));
    if (selectedBackup === previous) setSelectedBackup(null);
    const time = Date.now();
    setNow(time);
    setBackupDeadline(nextBackupDeadline(time, rules));
  };

  const updateIntent = (index: number, rawValue: string) => {
    const next = [...selfInputs];
    next[index] = sanitizeIntent(rawValue, snapshot.graph.maxLength, snapshot.prefix);
    setSelfInputs(next);
    setSelfResults(Array(rules.intentSlots).fill("empty"));
    setSelfMessage("");
  };

  const onIntentInput = (index: number, event: FormEvent<HTMLInputElement>) => {
    updateIntent(index, event.currentTarget.value);
  };

  const pressKey = (key: string) => {
    if (!allowedKeys.has(key)) return;
    updateIntent(activeIntent, activeValue + key);
  };

  const backspace = () => updateIntent(activeIntent, activeValue.slice(0, -1));

  const clearIntents = () => {
    setSelfInputs(Array(rules.intentSlots).fill(""));
    setSelfResults(Array(rules.intentSlots).fill("empty"));
    setSelfMessage("");
    setActiveIntent(0);
  };

  const fillIntents = (values: string[]) => {
    const filled = Array.from({ length: rules.intentSlots }, (_, index) =>
      sanitizeIntent(values[index] ?? "", snapshot.graph.maxLength, snapshot.prefix));
    setMode("self");
    setSelfInputs(filled);
    setSelfResults(Array(rules.intentSlots).fill("empty"));
    setSelfMessage("选号助手已只填入本组候选；验证与确认仍等待你亲自操作。");
    setActiveIntent(0);
  };

  const confirmSelfCompose = () => {
    if (!selfReady) return;
    const attempt = evaluateSelfComposeAttempt(snapshot, selfInputs, selfRemaining);
    setSelfResults(attempt.results);
    if (attempt.winner) {
      setCompletedValue(attempt.winner);
      setCompletedMethod("self");
      setStep("COMPLETE");
      return;
    }
    setSelfRemaining(attempt.remaining);
    setSelfMessage(`本次 ${attempt.attempted} 个意向均未通过，本地机会已扣减；还可自编 ${attempt.remaining} 个。`);
    const time = Date.now();
    setNow(time);
    setSelfDeadline(time + rules.selfConfirmSeconds * 1_000);
  };

  const confirmRandom = () => {
    if (!selectedBackup || backupSeconds <= 0) return;
    setCompletedValue(selectedBackup);
    setCompletedMethod("random");
    setStep("COMPLETE");
  };

  const resetFlow = () => {
    setStep("LOGIN");
    setLoginType(LOGIN_TYPES[0]);
    setConfirmed(false);
    setOtp("123456");
    setModeState("random");
    setExcludeFour(false);
    setCurrentBatchIndex(-1);
    setCurrentBatch([]);
    setBackups(Array(rules.randomTotal).fill(null));
    setSelectedBackup(null);
    setBatchDeadline(null);
    setBackupDeadline(null);
    setSelfDeadline(null);
    setSelfInputs(Array(rules.intentSlots).fill(""));
    setActiveIntent(0);
    setSelfRemaining(rules.selfComposeTotal);
    setSelfResults(Array(rules.intentSlots).fill("empty"));
    setSelfMessage("");
    setCompletedValue(null);
  };

  const controller: OfficialSelectionController = {
    step,
    mode,
    rules,
    currentBatch,
    currentBatchIndex,
    backups,
    selectedBackup,
    selfInputs,
    selfRemaining,
    setMode,
    fillIntents,
    clearIntents
  };

  return <div
    className="pg-official-simulator"
    data-platego-adapter-root={snapshot.regionCode === "310000" ? "shanghai-v1" : "local-region-v1"}
    data-platego-flow-step={step === "PLATE_SELECTION" ? "SELECT" : step}
    data-platego-namespace="simulation"
    data-platego-target-length={snapshot.graph.maxLength}
    data-platego-region-code={snapshot.regionCode}
    data-platego-plate-type={snapshot.plateType}
    data-platego-prefix={snapshot.prefix}
  >
    <div className="pg-sim-alert" role="note">
      <strong>本地模拟 · 非官方</strong>
      <span>不连接真实身份验证，不保存选号结果，请勿输入真实姓名、证件、车架号、手机号或验证码。</span>
    </div>

    {step !== "PLATE_SELECTION" && <nav className="pg-entry-nav" aria-label="PlateGo 导航">
      <a href={SHANGHAI_12123_SELECT} target="_blank" rel="noreferrer">12123 选号站</a>
      <a href={SHANGHAI_12123_SEGMENT_PUB} target="_blank" rel="noreferrer">号段公示</a>
      <a href={`${workbenchHref}#prefs`}>偏好预设</a>
      <a href={`${workbenchHref}#pool`}>号池筛选</a>
    </nav>}

    <header className="pg-gov-header">
      <div className="pg-gov-utility"><span>切换公安交通管理部门：{snapshot.regionName}</span><span>本地兼容与测试样机</span></div>
      <div className="pg-gov-brand-row">
        <div className="pg-gov-brand"><strong>交通安全综合服务管理平台</strong><small>{snapshot.regionName}页面结构练习稿 · 未使用官方标识</small></div>
        <nav aria-label="政务样机导航">{NAV_ITEMS.map((item) => <span key={item}>{item}</span>)}</nav>
        {returnHref && <a className="pg-return-link" href={returnHref}>返回 PlateGo</a>}
      </div>
    </header>

    <div className="pg-official-body">
      <div className="pg-breadcrumb"><span>机动车业务</span><b>/</b><strong>新车注册登记预选号牌（本地模拟）</strong><i>{surface === "fixture" ? "上海适配夹具" : surface === "extension" ? "插件独立版" : "网页独立版"}</i></div>
      {step !== "LOGIN" && <SixStepProgress step={step} />}

      <section className="pg-business-panel" data-platego-entry-panel={entryGate}>
        {step !== "LOGIN" && step !== "COMPLETE" && <BusinessProgress active={step === "BASIC_INFO" ? 0 : step === "CONFIRM_INFO" ? 1 : 2} />}

        {step === "LOGIN" && <LoginStep loginType={loginType} onLoginType={setLoginType} onNext={advanceEntry} />}

        {step === "BASIC_INFO" && <BasicInfoStep
          snapshot={snapshot}
          onBack={() => setStep("LOGIN")}
          onNext={advanceEntry}
        />}

        {step === "CONFIRM_INFO" && <ConfirmInfoStep
          confirmed={confirmed}
          onConfirmed={setConfirmed}
          loginType={loginType}
          snapshot={snapshot}
          onBack={() => setStep("BASIC_INFO")}
          onNext={advanceEntry}
        />}

        {step === "SERVICE_NOTICE" && <ServiceNoticeStep
          rules={rules}
          snapshot={snapshot}
          loginType={loginType}
          onBack={() => setStep("CONFIRM_INFO")}
          onNext={advanceEntry}
        />}

        {step === "PHONE_VERIFY" && <PhoneVerifyStep
          otp={otp}
          onOtp={setOtp}
          onBack={() => setStep("SERVICE_NOTICE")}
          onNext={advanceEntry}
        />}

        {step === "PLATE_SELECTION" && <div className="pg-selection-area">
          <div className="pg-selection-summary">
            <span>号牌种类：{snapshot.plateType === "small_nev" ? "小型新能源汽车" : "小型汽车"}</span>
            <span>号牌前缀：{snapshot.prefix}</span>
            <b>{rules.evidenceLabel}</b>
          </div>
          <div className="official-tabs" role="tablist" aria-label="选号方式">
            <button type="button" role="tab" aria-selected={mode === "random"} className={mode === "random" ? "active" : ""} onClick={() => setMode("random")}>随机</button>
            <button type="button" role="tab" aria-selected={mode === "self"} className={mode === "self" ? "active" : ""} data-platego-user-enter-self onClick={() => setMode("self")}>自编</button>
          </div>

          {mode === "random" ? <section className="official-panel pg-random-panel" data-platego-random-panel>
            <div className="pg-service-line"><strong>号牌库</strong><span>次数由当地规则配置；上海当前为 {rules.randomTotal} 批，每批 {rules.batchSize} 个。</span></div>
            {currentBatchIndex < 0 ? <div className="pg-empty-pool">
              <strong>号牌库为空</strong>
              <p>请先设置是否排除数字 4，再由你亲自开始第一批随机选号。</p>
              <label className="pg-check"><input type="checkbox" checked={excludeFour} onChange={(event) => setExcludeFour(event.target.checked)} />不含 4</label>
              <button type="button" className="pg-primary-button" data-platego-random-reset onClick={loadNextBatch}>随机一次（剩余 {rules.randomTotal} 次）</button>
            </div> : <>
              <div className="pg-random-toolbar">
                <label className="pg-check"><input type="checkbox" checked={excludeFour} onChange={(event) => setExcludeFour(event.target.checked)} />不含 4（影响下一批）</label>
                <button type="button" className="pg-primary-button compact" disabled={currentBatchIndex + 1 >= rules.randomTotal} data-platego-random-reset onClick={loadNextBatch}>换一批（剩余 {Math.max(0, rules.randomTotal - currentBatchIndex - 1)} 次）</button>
              </div>
              <div className="pg-batch-heading"><span>第 {currentBatchIndex + 1} 批预选</span><span>距失效 <b className="pg-countdown">{batchSeconds}</b> 秒</span></div>
              <div className="official-random-grid">{currentBatch.map((value) => {
                const selected = backups[currentBatchIndex] === value;
                return <button
                  type="button"
                  key={value}
                  className={selected ? "selected" : ""}
                  aria-pressed={selected}
                  disabled={batchSeconds <= 0}
                  data-platego-random-number={value}
                  onClick={() => chooseRandomNumber(value)}
                ><span>{value.slice(0, snapshot.prefix.length)}</span><strong>{value.slice(snapshot.prefix.length)}</strong></button>;
              })}</div>
            </>}

            <div className="pg-backup-heading"><strong>备选</strong><span>距失效 <b className="pg-countdown">{backupSeconds}</b> 秒</span></div>
            <div className="pg-backup-grid">{backups.map((value, index) => <button
              type="button"
              key={index}
              className={selectedBackup === value && value ? "selected" : ""}
              disabled={!value || backupSeconds <= 0}
              onClick={() => value && setSelectedBackup(value)}
            >{value ?? `第 ${index + 1} 批预选`}</button>)}</div>
            <div className="pg-official-actions centered"><button type="button" className="pg-primary-button wide" disabled={!selectedBackup || backupSeconds <= 0} data-platego-user-confirm-selection onClick={confirmRandom}>确认选号</button></div>
          </section> : <section className="official-panel pg-self-panel" data-platego-self-panel>
            <div className="pg-service-line stacked"><strong>服务说明</strong><span>一次可按第一至第五意向录入 1–{rules.intentSlots} 个号码，系统按优先级依次验证；验证通过时，真实流程会自动完成预选，无法回退更改。</span></div>
            <div className="pg-self-remaining">您还可以自编 <strong>{selfRemaining}</strong> 个号牌</div>
            <div className="official-candidate-inputs">{selfInputs.map((value, index) => <label key={index} className={activeIntent === index ? "active" : ""}>
              <span>第{["一", "二", "三", "四", "五"][index] ?? index + 1}意向</span>
              <div><b>{snapshot.prefix}</b><input
                aria-label={`自编候选 ${index + 1}`}
                data-platego-candidate-input={index}
                value={value}
                maxLength={snapshot.graph.maxLength}
                readOnly
                onFocus={() => setActiveIntent(index)}
                onInput={(event) => onIntentInput(index, event)}
              /><i className={selfResults[index]}>{selfResults[index] === "available" ? "通过" : selfResults[index] === "unavailable" ? "未通过" : ""}</i></div>
            </label>)}</div>
            <div className="official-keyboard" data-platego-keyboard>{KEYBOARD.map((key) => <button type="button" key={key} data-platego-key={key} disabled={!allowedKeys.has(key)} onClick={() => pressKey(key)}>{key}</button>)}<button type="button" className="backspace" data-platego-backspace onClick={backspace}>退格</button></div>
            {selfMessage && <div className="pg-inline-message" role="status">{selfMessage}</div>}
            <div className="pg-official-actions centered">
              <button type="button" className="pg-secondary-button" onClick={clearIntents}>清空本组</button>
              <button type="button" className="pg-primary-button wide" disabled={!selfReady} data-platego-user-validate onClick={confirmSelfCompose}>确认选号{selfSeconds > 0 ? `（${selfSeconds}）` : ""}</button>
            </div>
          </section>}
          <p className="pg-human-boundary">选号助手只可读取、在号码外框高亮、记录、填入、退格与遍历键盘；验证、确认选号和提交始终等待用户亲自操作。</p>
        </div>}

        {step === "COMPLETE" && <CompleteStep value={completedValue} method={completedMethod} snapshot={snapshot} onReset={resetFlow} />}
      </section>

      {step === "PLATE_SELECTION" && renderAssistant && <div className="pg-assistant-mount">{renderAssistant(controller)}</div>}
    </div>

    <footer className="pg-gov-footer"><span>PlateGo 本地兼容样机 · 非官方服务</span><span>固定模拟数据不代表实时可用号码</span><span>真实登录、短信验证与提交链路均未接通</span></footer>
  </div>;
}

function SixStepProgress({ step }: { step: OfficialFlowStep }) {
  const current = flowStepIndex(step);
  return <div className="pg-six-step" aria-label="两阶段六步骤">
    {[1, 2].map((phase) => <div className="pg-phase" key={phase}>
      <strong>第{phase === 1 ? "一" : "二"}阶段</strong>
      <div>{OFFICIAL_FLOW_STEPS.filter((item) => item.phase === phase).map((item) => {
        const index = flowStepIndex(item.id);
        return <span key={item.id} className={index < current ? "done" : index === current ? "active" : ""}><i>{index + 1}</i>{item.label}</span>;
      })}</div>
    </div>)}
  </div>;
}

function BusinessProgress({ active }: { active: number }) {
  return <div className="pg-business-progress" aria-label="业务进度">{["基本信息", "确认信息", "选号"].map((label, index) => <span key={label} className={index < active ? "done" : index === active ? "active" : ""}><i>{index < active ? "完成" : index + 1}</i>{label}</span>)}</div>;
}

function LoginStep({ loginType, onLoginType, onNext }: {
  loginType: string;
  onLoginType(value: string): void;
  onNext(): void;
}) {
  return <div className="pg-step-content pg-login-step">
    <div className="pg-step-heading"><div><h1>请选择用户登录类型</h1><p>这是六步业务开始前的本地入口，不连接账号系统，也不需要注册。</p></div><span>业务前置入口</span></div>
    <div className="pg-login-types standalone"><div>{LOGIN_TYPES.map((item) => <button type="button" key={item} className={loginType === item ? "selected" : ""} onClick={() => onLoginType(item)}>{item}<small>{loginType === item ? "本地虚构身份已选" : "仅切换演示身份"}</small></button>)}</div></div>
    <div className="pg-data-warning">本地模拟不会读取、保存或提交任何账号、密码、证件或登录状态。</div>
    <div className="pg-official-actions centered"><button type="button" className="pg-primary-button wide" data-platego-user-gate-action onClick={onNext}>模拟已登录，进入业务</button></div>
  </div>;
}

function BasicInfoStep({ snapshot, onBack, onNext }: {
  snapshot: PoolSnapshot;
  onBack(): void;
  onNext(): void;
}) {
  return <div className="pg-step-content">
    <div className="pg-step-heading"><div><h1>基本信息</h1><p>选择办理地区、车管所与号牌类型，并在进入资料确认前阅读号池公示和业务须知。</p></div><span>步骤 1 / 6</span></div>
    <div className="pg-form-table">
      <label><span>办理地区</span><input readOnly value={`${snapshot.regionName}（本地模拟）`} /></label>
      <label><span>办理车管所</span><select defaultValue="shanghai-vehicle-office"><option value="shanghai-vehicle-office">上海车辆管理所（虚构演练项）</option><option value="local-demo-office">本地模拟车管所</option></select></label>
      <label><span>业务类型</span><input readOnly value="新车注册登记预选号牌（模拟）" /></label>
      <label><span>号牌种类</span><input readOnly value={snapshot.plateType === "small_nev" ? "小型新能源汽车（模拟）" : "小型汽车（模拟）"} /></label>
    </div>
    <div className="pg-basic-notices"><div><strong>号池公示</strong><span>{snapshot.prefix} 固定模拟号池 · {snapshot.values.length} 个练习号码</span><details><summary>查看本地号池说明</summary><p>号码随应用固定打包，仅用于筛选、键盘图和流程练习，不代表官方实时可用状态。</p></details></div><div><strong>业务须知</strong><span>本地演练不校验、不保存，号码无效；正式办理规则以当地官方页面为准。</span><b>已阅读</b></div></div>
    <div className="pg-data-warning">此步骤不录入车辆识别代号或选号凭证；这些虚构资料将在“确认信息”步骤单独核对。</div>
    <div className="pg-official-actions"><button type="button" className="pg-secondary-button" onClick={onBack}>返回登录入口</button><button type="button" className="pg-primary-button" data-platego-user-gate-action onClick={onNext}>下一步</button></div>
  </div>;
}

function ConfirmInfoStep({ confirmed, onConfirmed, loginType, snapshot, onBack, onNext }: {
  confirmed: boolean;
  onConfirmed(value: boolean): void;
  loginType: string;
  snapshot: PoolSnapshot;
  onBack(): void;
  onNext(): void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  return <div className="pg-step-content">
    <div className="pg-step-heading"><div><h1>确认信息</h1><p>录入并核对选号凭证与车辆识别代号；下列内容均为本地虚构占位。</p></div><span>步骤 2 / 6</span></div>
    <div className="pg-form-table pg-confirm-form" id="vehForm">
      <label><span>号牌种类</span><input data-platego-vehicle-field="plateKind" defaultValue={snapshot.plateType === "small_nev" ? "小型新能源汽车（模拟）" : "小型汽车（模拟）"} /></label>
      <label><span>品牌型号</span><button id="btnPpxh" type="button" className="pg-brand-search-opener" data-label="请点此查询选择车辆品牌型号" onClick={() => setSearchOpen(true)}>请点此查询选择车辆品牌型号</button><input type="hidden" id="clpp" name="clpp" /><input type="hidden" id="clxh" name="clxh" /></label>
      <label><span>合格证编号</span><input data-platego-vehicle-field="certificateNo" defaultValue="SIM-310000-2026-001" /></label>
      <label><span>车辆识别代号</span><input data-platego-vehicle-field="vin" defaultValue="TESTVIN31000000001" /></label>
      <label><span>所有人</span><input readOnly value="沪测用户（虚构）" /></label>
    </div>
    {searchOpen ? <div className="window pg-brand-search-window" role="dialog" aria-label="选择车辆品牌型号">
      <div className="window-header">选择车辆品牌型号</div>
      <iframe
        title="车辆品牌型号查询"
        srcDoc={BRAND_SEARCH_WRAPPER_HTML}
      />
      <div className="pg-brand-search-actions"><button type="button" onClick={() => setSearchOpen(false)}>确定</button></div>
    </div> : null}
    <dl className="pg-confirm-list compact"><div><dt>登录类型</dt><dd>{loginType}</dd></div><div><dt>办理地区</dt><dd>{snapshot.regionName}</dd></div><div><dt>号牌种类</dt><dd>{snapshot.plateType === "small_nev" ? "小型新能源汽车" : "小型汽车"}</dd></div><div><dt>号牌前缀</dt><dd>{snapshot.prefix}</dd></div><div><dt>联系方式</dt><dd>138****0000（虚构）</dd></div></dl>
    <label className="pg-check confirm"><input type="checkbox" data-platego-user-confirm-info checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} />我确认以上均为模拟占位资料，不会用于正式选号。</label>
    <div className="pg-official-actions"><button type="button" className="pg-secondary-button" onClick={onBack}>上一步</button><button type="button" className="pg-primary-button" disabled={!confirmed} data-platego-user-gate-action onClick={onNext}>确认并继续</button></div>
  </div>;
}

function ServiceNoticeStep({ rules, snapshot, loginType, onBack, onNext }: {
  rules: SelectionRegionRules;
  snapshot: PoolSnapshot;
  loginType: string;
  onBack(): void;
  onNext(): void;
}) {
  return <div className="pg-step-content">
    <div className="pg-step-heading"><div><h1>选号服务说明</h1><p>信息通过本地检查，可继续熟悉完整选号步骤。</p></div><span>步骤 3 / 6</span></div>
    <div className="pg-audit-ok"><strong>信息通过本地模拟检查</strong><span>{snapshot.prefix} · {snapshot.plateType === "small_nev" ? "小型新能源汽车" : "小型汽车"}</span></div>
    <dl className="pg-submitted-summary"><div><dt>登录类型</dt><dd>{loginType}</dd></div><div><dt>办理地区</dt><dd>{snapshot.regionName}</dd></div><div><dt>选号凭证</dt><dd>SIM-310000-2026-001（虚构）</dd></div><div><dt>车辆识别代号</dt><dd>TESTVIN31000000001（虚构）</dd></div></dl>
    <div className="pg-service-notice"><h2>服务说明</h2><ol><li>模拟选号与正式操作流程保持同一层级，但不校验基础信息、不保存信息，所选号牌无效。</li><li>{rules.evidenceLabel}；次数由地区规则配置，不代表全国固定值。</li><li>随机每批最多加入 1 个备选；自编按第一至第五意向顺序验证。</li><li>本地流程不会连接真实登录、短信验证、选号确认或提交服务。</li></ol></div>
    <div className="pg-official-actions"><button type="button" className="pg-secondary-button" onClick={onBack}>上一步</button><button type="button" className="pg-primary-button" data-platego-user-gate-action onClick={onNext}>开始选号</button></div>
  </div>;
}

function PhoneVerifyStep({ otp, onOtp, onBack, onNext }: {
  otp: string;
  onOtp(value: string): void;
  onBack(): void;
  onNext(): void;
}) {
  return <div className="pg-step-content narrow">
    <div className="pg-step-heading"><div><h1>本人选号手机验证</h1><p>验证码替身只在当前内存中使用，不会发送短信或接通身份验证。</p></div><span>步骤 4 / 6</span></div>
    <div className="pg-phone-box"><strong>验证手机</strong><p>验证码已在本地生成：<b>123456</b>，手机号 138****0000 为虚构占位。</p><label><span>验证码</span><input value={otp} inputMode="numeric" maxLength={6} onChange={(event) => onOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><small>本地验证码不会发送，也不会记录。</small></div>
    <div className="pg-official-actions"><button type="button" className="pg-secondary-button" onClick={onBack}>返回</button><button type="button" className="pg-primary-button" disabled={otp !== "123456"} data-platego-user-gate-action onClick={onNext}>确认并进入预选号牌</button></div>
  </div>;
}

function CompleteStep({ value, method, snapshot, onReset }: { value: string | null; method: SelectionMode; snapshot: PoolSnapshot; onReset(): void }) {
  return <div className="pg-step-content narrow pg-complete-step">
    <div className="pg-complete-title"><span>完成</span><div><h1>您已成功完成本地模拟选号</h1><p>此结果不具备任何官方效力，也不会被保存或提交。</p></div></div>
    <div className="pg-complete-warning">正式流程的登记期限、逾期处理与黑名单规则请以当地官方页面当次提示为准。</div>
    <dl className="pg-complete-list"><div><dt>模拟所有人</dt><dd>沪测用户（虚构）</dd></div><div><dt>地区</dt><dd>{snapshot.regionName}</dd></div><div><dt>号牌种类</dt><dd>{snapshot.plateType === "small_nev" ? "小型新能源汽车" : "小型汽车"}</dd></div><div><dt>模拟号牌</dt><dd className="plate">{value ?? "未生成"}</dd></div><div><dt>选号方式</dt><dd>{method === "random" ? "随机选号" : "自编选号"}</dd></div><div><dt>结果状态</dt><dd>仅本地演练，无效</dd></div></dl>
    <div className="pg-official-actions centered"><button type="button" className="pg-primary-button" onClick={onReset}>重新开始本地模拟</button></div>
  </div>;
}
