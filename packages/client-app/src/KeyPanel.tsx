import { useEffect, useMemo, useState } from "react";
import type { PlateConfig, PoolSnapshot } from "@platego/core";
import { Card, SectionHeader, StatusDot } from "./ui";

interface KeySession {
  token: string;
  activatedAt: string;
  /** Backwards-compatible backend alias for sessionExpiresAt. */
  expiresAt: string;
  sessionExpiresAt: string;
  keyExpiresAt: string;
}

const KEY_SESSION_STORAGE = "platego:key-session:v1";

function readKeySession(): KeySession | undefined {
  try {
    const value = sessionStorage.getItem(KEY_SESSION_STORAGE);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as Partial<KeySession>;
    if (typeof parsed.token !== "string" || typeof parsed.activatedAt !== "string"
      || typeof parsed.sessionExpiresAt !== "string" || typeof parsed.keyExpiresAt !== "string") return undefined;
    if (!Number.isFinite(new Date(parsed.sessionExpiresAt).getTime())
      || !Number.isFinite(new Date(parsed.keyExpiresAt).getTime())) return undefined;
    return parsed as KeySession;
  } catch { return undefined; }
}

function apiUrl(apiBase: string, path: string): string {
  const parsed = new URL(apiBase.trim());
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("后端地址必须使用 http 或 https");
  return `${parsed.href.replace(/\/$/, "")}${path}`;
}

function remainingLabel(milliseconds: number): string {
  if (milliseconds <= 0) return "已到期";
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.max(0, Math.floor((milliseconds % 3_600_000) / 60_000));
  return `${hours} 小时 ${minutes} 分钟`;
}

export function KeyPanel({
  surface = "web",
  config,
  apiBase,
  onApiBase,
  onSnapshot
}: {
  surface?: "web" | "extension";
  config: PlateConfig;
  apiBase: string;
  onApiBase(value: string): void;
  onSnapshot(snapshot: PoolSnapshot): void;
}) {
  const [ocrKey, setOcrKey] = useState("");
  const [ocrLanguage, setOcrLanguage] = useState<"chs" | "cht">("chs");
  const [keyValue, setKeyValue] = useState("");
  const [session, setSession] = useState<KeySession | undefined>(readKeySession);
  const [now, setNow] = useState(Date.now);
  const [message, setMessage] = useState("未解锁时继续使用内置固定模拟号池，功能不受影响。");
  const [busy, setBusy] = useState(false);
  const sessionExpiresAt = session ? new Date(session.sessionExpiresAt).getTime() : 0;
  const keyExpiresAt = session ? new Date(session.keyExpiresAt).getTime() : 0;
  const active = Boolean(session && sessionExpiresAt > now);
  const sessionRemaining = useMemo(() => remainingLabel(sessionExpiresAt - now), [sessionExpiresAt, now]);
  const keyRemaining = useMemo(() => remainingLabel(keyExpiresAt - now), [keyExpiresAt, now]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (surface !== "extension") return;
    const area = (globalThis as unknown as {
      chrome?: { storage?: { local?: { get(keys: string[]): Promise<Record<string, unknown>> | void } } };
    }).chrome?.storage?.local;
    if (!area) return;
    const result = area.get(["platego_ocr_space_key", "platego_ocr_space_language"]);
    if (result && "then" in result) {
      void result.then((stored) => {
        if (typeof stored.platego_ocr_space_key === "string") setOcrKey(stored.platego_ocr_space_key);
        if (stored.platego_ocr_space_language === "cht") setOcrLanguage("cht");
      });
    }
  }, [surface]);

  const persistOcrSettings = (nextKey: string, nextLanguage: "chs" | "cht") => {
    setOcrKey(nextKey);
    setOcrLanguage(nextLanguage);
    const area = (globalThis as unknown as {
      chrome?: { storage?: { local?: { set(items: Record<string, unknown>): Promise<void> | void } } };
    }).chrome?.storage?.local;
    const result = area?.set({
      platego_ocr_space_key: nextKey.trim(),
      platego_ocr_space_language: nextLanguage
    });
    if (result && "catch" in result) void result.catch(() => undefined);
  };

  useEffect(() => {
    if (!session || active) return;
    try { sessionStorage.removeItem(KEY_SESSION_STORAGE); } catch { /* optional session storage */ }
    setSession(undefined);
    setMessage(keyExpiresAt > Date.now()
      ? `本页短时会话已到期并清除；密钥访问窗仍剩 ${remainingLabel(keyExpiresAt - Date.now())}，请重新输入原密钥兑换。固定模拟号池不受影响。`
      : "密钥的 72 小时访问窗与本页会话均已到期；固定模拟号池仍可使用。");
  }, [active, keyExpiresAt, session]);

  const clearSession = (nextMessage = "已清除本标签页的短时会话令牌；固定模拟号池仍可使用。") => {
    try { sessionStorage.removeItem(KEY_SESSION_STORAGE); } catch { /* optional session storage */ }
    setSession(undefined);
    setMessage(nextMessage);
  };

  const createDevKey = async () => {
    setBusy(true);
    try {
      const response = await fetch(apiUrl(apiBase, "/v1/dev/keys"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderRef: "local-manual-test" }) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json() as { key: string };
      setKeyValue(body.key);
      setMessage("本地开发密钥已签发，但计时尚未开始；首次兑换时开始 72 小时。正式版本由支付回调签发。 ");
    } catch {
      setMessage("无法连接本地后端。请先启动后端，免费固定模拟数据仍可直接使用。");
    } finally { setBusy(false); }
  };

  const exchange = async () => {
    if (!keyValue.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(apiUrl(apiBase, "/v1/auth/exchange"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: keyValue.trim() }) });
      const body = await response.json() as KeySession & { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      if (!body.token || !Number.isFinite(new Date(body.sessionExpiresAt).getTime())
        || !Number.isFinite(new Date(body.keyExpiresAt).getTime())) throw new Error("后端返回的密钥或会话结构无效");
      setSession(body);
      setNow(Date.now());
      try { sessionStorage.setItem(KEY_SESSION_STORAGE, JSON.stringify(body)); } catch { /* keep current in-memory session */ }
      setKeyValue("");
      setMessage(`兑换成功：短时会话至 ${new Date(body.sessionExpiresAt).toLocaleString("zh-CN", { hour12: false })}；72 小时密钥访问窗至 ${new Date(body.keyExpiresAt).toLocaleString("zh-CN", { hour12: false })}。原始密钥未保存。`);
    } catch (error) {
      setMessage(`密钥兑换失败：${(error as Error).message}`);
    } finally { setBusy(false); }
  };

  const syncLatest = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const response = await fetch(apiUrl(apiBase, `/v1/pools/latest/${config.regionCode}/${config.plateType}`), { headers: { authorization: `Bearer ${session.token}` } });
      if (!response.ok) {
        if ([401, 410].includes(response.status)) {
          clearSession("短时会话已失效。请用同一枚仍在 72 小时访问窗内的密钥重新兑换；固定模拟号池不受影响。");
          return;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const snapshot = await response.json() as PoolSnapshot;
      if (snapshot.namespace !== "simulation" || snapshot.regionCode !== config.regionCode || snapshot.plateType !== config.plateType) {
        throw new Error("返回数据的模拟命名空间或地区不匹配");
      }
      if (!["local-demo-latest", "backend-fixed", "bundled-fixed"].includes(snapshot.source) || !Array.isArray(snapshot.values)) {
        throw new Error("返回数据不是受支持的模拟快照");
      }
      onSnapshot(snapshot);
      setMessage(`已同步“${snapshot.version}”。当前本地后端只返回明确标记的开发样例，并非 12123 实时数据。`);
    } catch (error) {
      setMessage(`同步失败：${(error as Error).message}`);
    } finally { setBusy(false); }
  };

  return <div className="page-stack">
    <SectionHeader eyebrow="无账号时限密钥" title="首次兑换起 72 小时" detail="密钥访问窗为 72 小时；每次兑换只签发短时会话。会话过期后可再次输入同一枚仍有效的密钥，不建立账号，也不把密钥写入配置。" action={<StatusDot tone={active ? "green" : "gray"}>{active ? `短时会话剩余 ${sessionRemaining}` : "无有效会话"}</StatusDot>} />

    <div className="key-layout">
      <Card className="key-card">
        <div className="key-icon">72<span>h</span></div>
        <div><div className="card-kicker">访问凭证</div><h3>输入时限密钥</h3><p>原始密钥只停留在当前输入框，兑换成功后立即清空。本标签页仅保存可随时清除的短时会话令牌。</p></div>
        <input className="key-input" value={keyValue} onChange={(event) => setKeyValue(event.target.value.toUpperCase())} placeholder="PG3-XXXXX-XXXXX-XXXXX-XXXXX" autoComplete="off" spellCheck={false} />
        {session && <div className="key-expiry-grid">
          <div><span>本页短时会话</span><strong>{sessionRemaining}</strong><small>到期 {new Date(session.sessionExpiresAt).toLocaleString("zh-CN", { hour12: false })}</small></div>
          <div><span>密钥访问窗</span><strong>{keyRemaining}</strong><small>到期 {new Date(session.keyExpiresAt).toLocaleString("zh-CN", { hour12: false })}</small></div>
        </div>}
        <div className="button-row"><button className="button primary" disabled={busy || !keyValue.trim()} onClick={() => void exchange()}>兑换密钥</button><button className="button quiet" disabled={busy} onClick={() => void createDevKey()}>生成本地测试密钥</button>{session && <button className="button quiet" disabled={busy} onClick={() => clearSession()}>清除本页会话</button>}</div>
      </Card>

      {surface === "extension" ? <Card>
        <div className="card-kicker">页面助手</div><h3>合格证识别</h3>
        <label>OCR.space 密钥<input value={ocrKey} onChange={(event) => persistOcrSettings(event.target.value, ocrLanguage)} placeholder="可空，默认试用" autoComplete="off" spellCheck={false} /><small>只保存在本机。照片仍只发给 OCR.space，不经过 PlateGo 服务器。</small></label>
        <label>识别语言<select value={ocrLanguage} onChange={(event) => persistOcrSettings(ocrKey, event.target.value === "cht" ? "cht" : "chs")}><option value="chs">简体中文</option><option value="cht">繁体中文</option></select></label>
      </Card> : null}

      <Card>
        <div className="card-kicker">可选本地服务</div><h3>后端地址</h3><label>API 地址<input type="url" inputMode="url" value={apiBase} onChange={(event) => onApiBase(event.target.value)} /><small>PlateGo 默认使用 http://127.0.0.1:8789；已保存的自定义地址继续优先。</small></label>
        <div className={`notice ${active ? "success" : "neutral"}`} role="status">{message}</div>
        <button className="button full secondary" disabled={!active || busy} onClick={() => void syncLatest()}>同步当前地区的“最新数据”</button>
        <p className="offline-note">连接失败时不会降级成真实数据，也不会阻断筛选、收藏、配置或完整模拟。</p>
      </Card>
    </div>

    <Card>
      <div className="card-kicker">正式支付预留口</div><h3>无需账号的签发链路</h3>
      <div className="payment-flow"><span>支付平台回调</span><i>→</i><span>后端签发密钥哈希</span><i>→</i><span>首次兑换开始计时</span><i>→</i><span>72 小时后自动失效</span></div>
      <p className="safety-note">当前只实现本地开发签发入口。正式上线时关闭开发入口，并把支付订单引用和密钥状态保存在服务端；网页和插件都不需要账号系统。</p>
    </Card>
  </div>;
}
