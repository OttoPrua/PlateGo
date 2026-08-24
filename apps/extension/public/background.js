"use strict";

const EXTENSION_VERSION = "0.1.0";
const ADAPTER_VERSION = "shanghai-dom-v1-local-fixture";
const ALLOWED_API_ORIGINS = new Set([
  "http://127.0.0.1:8789",
  "http://localhost:8789"
]);
const LOCAL_FIXTURE_URL = /^http:\/\/(127\.0\.0\.1|localhost):4173\/official-mock(?:[/?#]|$)/;
// position-only is reserved for a future adapter that can observe per-position
// availability without safely enumerating complete suffixes. Local fixture v1
// currently emits complete, partial or unknown only.
const COVERAGE_VALUES = new Set(["complete", "partial", "position-only", "unknown"]);
const PLATE_TYPES = new Set(["small_blue", "small_nev"]);

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.set({
    platego_extension_version: EXTENSION_VERSION,
    platego_adapter_version: ADAPTER_VERSION,
    platego_real_adapter_approved: false
  });
});

function normalizeApiBase(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return undefined;
    return ALLOWED_API_ORIGINS.has(url.origin) ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

function isSingleCharacter(value) {
  return typeof value === "string" && /^[A-HJ-NP-Z0-9]$/.test(value);
}

function validateObservation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "观察数据不是对象";
  const allowedFields = new Set([
    "namespace", "regionCode", "plateType", "prefix", "transitions", "terminals",
    "coverage", "observedAt", "adapterVersion", "source", "observationHash"
  ]);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) return "观察数据包含非公共字段";
  if (value.namespace !== "simulation" || value.source !== "official-mock") return "真实公共观察尚未开放";
  if (value.adapterVersion !== ADAPTER_VERSION) return "适配器版本不匹配";
  if (value.regionCode !== "310000" || !PLATE_TYPES.has(value.plateType)) return "观察范围不匹配";
  if (typeof value.prefix !== "string" || !/^沪[A-Z]$/.test(value.prefix)) return "号牌前缀无效";
  if (!COVERAGE_VALUES.has(value.coverage)) return "覆盖度无效";
  if (typeof value.observedAt !== "string" || !Number.isFinite(Date.parse(value.observedAt))) return "观察时间无效";
  if (typeof value.observationHash !== "string" || !/^[a-f0-9]{8}$/.test(value.observationHash)) return "观察摘要无效";
  if (!value.transitions || typeof value.transitions !== "object" || Array.isArray(value.transitions)) return "转换图无效";
  const entries = Object.entries(value.transitions);
  if (entries.length > 3000) return "转换图过大";
  for (const [prefix, next] of entries) {
    if (!/^[A-HJ-NP-Z0-9]{0,6}$/.test(prefix) || !Array.isArray(next) || next.length > 34 || next.some((item) => !isSingleCharacter(item))) {
      return "转换图包含无效节点";
    }
  }
  if (!Array.isArray(value.terminals) || value.terminals.length > 3000
    || value.terminals.some((item) => typeof item !== "string" || !/^[A-HJ-NP-Z0-9]{5,6}$/.test(item))) {
    return "完整组合无效";
  }
  return undefined;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "PLATEGO_UPLOAD_PUBLIC_OBSERVATION") return undefined;

  const senderUrl = sender.tab?.url || sender.url || "";
  const apiBase = normalizeApiBase(message.apiBase);
  const validationError = validateObservation(message.observation);
  if (!LOCAL_FIXTURE_URL.test(senderUrl)) {
    sendResponse({ ok: false, error: "只有本地 official-mock 样机可以上传当前适配器观察" });
    return undefined;
  }
  if (!apiBase) {
    sendResponse({ ok: false, error: "只允许连接本机 PlateGo 后端" });
    return undefined;
  }
  if (validationError) {
    sendResponse({ ok: false, error: validationError });
    return undefined;
  }

  void fetch(`${apiBase}/v1/pools/observations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message.observation),
    credentials: "omit",
    cache: "no-store",
    redirect: "error"
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    await chrome.storage.local.set({
      platego_last_public_observation: {
        namespace: message.observation.namespace,
        regionCode: message.observation.regionCode,
        plateType: message.observation.plateType,
        coverage: message.observation.coverage,
        observationHash: message.observation.observationHash,
        uploadedAt: new Date().toISOString()
      }
    });
    sendResponse({ ok: true, accepted: body.accepted === true, deduplicated: body.deduplicated === true });
  }).catch((error) => {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "上传失败" });
  });
  return true;
});
