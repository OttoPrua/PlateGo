"use strict";

importScripts("certificate-fields.js");

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

const OCR_SPACE_URL = "https://api.ocr.space/parse/image";
const DEFAULT_OCR_SPACE_KEY = "helloworld";

function normalizeOcrLanguage(value) {
  return String(value || "").toLowerCase() === "cht" ? "cht" : "chs";
}

function isOcrAllowedSender(senderUrl) {
  return LOCAL_FIXTURE_URL.test(senderUrl) || /^https:\/\/sh\.122\.gov\.cn\//.test(senderUrl);
}

async function readOcrSpaceKey() {
  const stored = await chrome.storage.local.get("platego_ocr_space_key");
  const key = String(stored.platego_ocr_space_key || "").trim();
  return key || DEFAULT_OCR_SPACE_KEY;
}

async function extractCertificateFields(imageDataUrl, languageHint) {
  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return { ok: false, error: "未收到可用的合格证图片" };
  }
  if (imageDataUrl.length > 2_800_000) return { ok: false, error: "图片过大，请换一张更小的照片" };
  const key = await readOcrSpaceKey();
  const language = normalizeOcrLanguage(languageHint);
  const body = new FormData();
  body.set("apikey", key);
  body.set("base64Image", imageDataUrl);
  body.set("language", language);
  body.set("OCREngine", "2");
  body.set("filetype", "JPG");
  body.set("scale", "true");
  body.set("detectOrientation", "true");
  body.set("isOverlayRequired", "true");
  const response = await fetch(OCR_SPACE_URL, {
    method: "POST",
    headers: { apikey: key },
    body,
    credentials: "omit",
    cache: "no-store",
    redirect: "error"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.IsErroredOnProcessing) {
    const detail = Array.isArray(payload.ErrorMessage)
      ? payload.ErrorMessage.join("；")
      : (payload.ErrorMessage || payload.ErrorDetails || `HTTP ${response.status}`);
    return { ok: false, error: `OCR.space 未能识别（${detail}）` };
  }
  const parsed = payload.ParsedResults || [];
  const rawText = parsed.map((item) => String(item.ParsedText || "")).join("\n");
  if (!rawText.trim()) return { ok: false, error: "OCR.space 没有读出文字，请改手填" };
  const fields = self.PlateGoCertificate.refineCertificateFields({ rawText });
  return {
    ok: true,
    fields,
    regions: self.PlateGoCertificate.locateCertificateRegions(parsed[0]?.TextOverlay, fields),
    provider: "ocr.space"
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PLATEGO_OCR_CERTIFICATE") {
    const senderUrl = sender.tab?.url || sender.url || "";
    if (!isOcrAllowedSender(senderUrl)) {
      sendResponse({ ok: false, error: "当前页面不允许识别合格证" });
      return undefined;
    }
    void extractCertificateFields(message.imageDataUrl, message.language)
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "识别失败，请改手填" }));
    return true;
  }
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
