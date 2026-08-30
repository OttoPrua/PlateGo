import {
  buildTransitionGraph,
  createDefaultConfig,
  normalizeComposePrefs,
  normalizeHighlightPrefs,
  type CandidateEntry,
  type CandidateSource,
  type PlateConfig,
  type PlateType,
  type PoolSnapshot,
  type PreferenceKind,
  type PreferenceRule
} from "@platego/core";
import { getCatalog, SIM_DATA_VERSION } from "@platego/sim-data";

const CONFIG_KEY = "platego:config:v1";
const API_KEY = "platego:api-base:v1";
export const CAPTURED_POOL_KEY = "platego:captured-pool:v1";
export const POSITION_PATTERNS_KEY = "platego_position_patterns";
export const DEFAULT_API_BASE = "http://127.0.0.1:8789";

export interface CapturedPool {
  schemaVersion: 1;
  namespace: "simulation";
  regionCode: string;
  plateType: PlateType;
  prefix: string;
  coverage?: string;
  observedAt: string;
  values: string[];
}

interface ChromeStorageArea {
  set(items: Record<string, unknown>): Promise<void> | void;
  get(keys: string | string[]): Promise<Record<string, unknown>>;
}

function chromeStorageArea(): ChromeStorageArea | undefined {
  return (globalThis as unknown as {
    chrome?: { storage?: { local?: ChromeStorageArea } };
  }).chrome?.storage?.local;
}

const RULE_KINDS = new Set<PreferenceKind>(["contains", "prefix", "suffix", "avoid", "repeat", "sequence"]);
const CANDIDATE_SOURCES = new Set<CandidateSource>(["pool", "favorite", "rule", "manual", "capture"]);
const PLATE_TYPES = new Set<PlateConfig["plateType"]>(["small_blue", "small_nev"]);
const REGION_CODES = new Set(getCatalog().regions.map((region) => region.code));

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().toUpperCase().slice(0, maxLength) : "";
}

function normalizeRules(value: unknown): PreferenceRule[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item, index) => {
    if (!isRecord(item) || !RULE_KINDS.has(item.kind as PreferenceKind)) return [];
    const kind = item.kind as PreferenceKind;
    const target = ["repeat", "sequence"].includes(kind) ? "" : cleanString(item.target, 16);
    if (!["repeat", "sequence"].includes(kind) && !target) return [];
    const rawWeight = typeof item.weight === "number" && Number.isFinite(item.weight) ? item.weight : 10;
    const weight = Math.max(0, Math.min(100, Math.round(Math.abs(rawWeight))));
    const fallbackLabel = `${kind}${target ? ` ${target}` : ""}`;
    return [{
      id: typeof item.id === "string" && item.id ? item.id.slice(0, 100) : `imported-rule-${index}`,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 80) : fallbackLabel,
      kind,
      target,
      weight,
      enabled: item.enabled !== false
    }];
  });
}

function normalizeCandidates(value: unknown): CandidateEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 50_000).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const plate = cleanString(item.value, 16);
    if (!plate || seen.has(plate)) return [];
    seen.add(plate);
    const rawScore = typeof item.score === "number" && Number.isFinite(item.score) ? item.score : 50;
    const source = CANDIDATE_SOURCES.has(item.source as CandidateSource) ? item.source as CandidateSource : "manual";
    return [{
      id: typeof item.id === "string" && item.id ? item.id.slice(0, 100) : `imported-candidate-${index}`,
      value: plate,
      source,
      score: Math.max(0, Math.min(100, Math.round(rawScore))),
      createdAt: typeof item.createdAt === "string" && item.createdAt ? item.createdAt : new Date().toISOString()
    }];
  });
}

export function normalizePlateConfig(value: unknown): PlateConfig {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error("配置版本无效或不受支持");
  const regionCode = typeof value.regionCode === "string" && REGION_CODES.has(value.regionCode)
    ? value.regionCode
    : "";
  if (!regionCode) throw new Error("配置中的地区无效");
  if (!PLATE_TYPES.has(value.plateType as PlateConfig["plateType"])) throw new Error("配置中的号牌类型无效");

  const favorites = Array.isArray(value.favorites)
    ? [...new Set(value.favorites.map((item) => cleanString(item, 16)).filter(Boolean))].slice(0, 2_000)
    : [];

  return {
    schemaVersion: 1,
    simDataVersion: typeof value.simDataVersion === "string" && value.simDataVersion
      ? value.simDataVersion.slice(0, 100)
      : SIM_DATA_VERSION,
    regionCode,
    plateType: value.plateType as PlateConfig["plateType"],
    rules: normalizeRules(value.rules),
    favorites,
    orderedCandidates: normalizeCandidates(value.orderedCandidates),
    highlightPrefs: normalizeHighlightPrefs(value.highlightPrefs),
    composePrefs: normalizeComposePrefs(value.composePrefs),
    exportedAt: typeof value.exportedAt === "string" && value.exportedAt
      ? value.exportedAt
      : new Date().toISOString()
  };
}

export function loadConfig(): PlateConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return createDefaultConfig(SIM_DATA_VERSION);
    return normalizePlateConfig(JSON.parse(raw));
  } catch {
    return createDefaultConfig(SIM_DATA_VERSION);
  }
}

export async function loadExtensionConfig(): Promise<PlateConfig | undefined> {
  try {
    const stored = await chromeStorageArea()?.get(["platego_config", POSITION_PATTERNS_KEY]);
    if (!stored?.platego_config || !isRecord(stored.platego_config)) return undefined;
    const sharedComposePrefs = isRecord(stored.platego_config.composePrefs)
      ? stored.platego_config.composePrefs
      : {};
    return normalizePlateConfig({
      ...stored.platego_config,
      composePrefs: {
        ...sharedComposePrefs,
        positionPatterns: stored[POSITION_PATTERNS_KEY]
      }
    });
  } catch {
    return undefined;
  }
}

export function saveConfig(config: PlateConfig, surface: "web" | "extension"): void {
  const normalized = normalizePlateConfig(config);
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(normalized)); } catch { /* keep the in-memory app usable */ }
  if (surface !== "extension") return;
  try {
    const sharedConfig = {
      ...normalized,
      composePrefs: {
        combinations: normalized.composePrefs.combinations,
        segments: normalized.composePrefs.segments
      }
    };
    const result = chromeStorageArea()?.set({
      platego_config: sharedConfig,
      [POSITION_PATTERNS_KEY]: normalized.composePrefs.positionPatterns,
      platego_config_updated_at: new Date().toISOString(),
      platego_number_tips: normalized.highlightPrefs
    });
    if (result && "catch" in result) void result.catch(() => undefined);
  } catch { /* Chrome storage can be unavailable in a standalone preview */ }
}

export function loadApiBase(): string {
  try { return resolveApiBasePreference(localStorage.getItem(API_KEY)); }
  catch { return DEFAULT_API_BASE; }
}

export function resolveApiBasePreference(storedValue: string | null): string {
  return storedValue ?? DEFAULT_API_BASE;
}

export function normalizeCapturedPool(value: unknown): CapturedPool | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.namespace !== "simulation") return undefined;
  if (!REGION_CODES.has(String(value.regionCode)) || !PLATE_TYPES.has(value.plateType as PlateType)) return undefined;
  const prefix = cleanString(value.prefix, 8);
  const values = Array.isArray(value.values)
    ? [...new Set(value.values.map((item) => cleanString(item, 16)).filter((item) => item.startsWith(prefix)))].slice(0, 50_000)
    : [];
  if (!prefix || values.length === 0) return undefined;
  return {
    schemaVersion: 1,
    namespace: "simulation",
    regionCode: String(value.regionCode),
    plateType: value.plateType as PlateType,
    prefix,
    coverage: typeof value.coverage === "string" ? value.coverage.slice(0, 32) : undefined,
    observedAt: typeof value.observedAt === "string" && value.observedAt ? value.observedAt : new Date().toISOString(),
    values
  };
}

export function loadCapturedPoolSync(): CapturedPool | undefined {
  try {
    const raw = localStorage.getItem(CAPTURED_POOL_KEY);
    return raw ? normalizeCapturedPool(JSON.parse(raw)) : undefined;
  } catch {
    return undefined;
  }
}

export function snapshotFromCapturedPool(captured: CapturedPool, fallback: PoolSnapshot): PoolSnapshot | undefined {
  if (captured.regionCode !== fallback.regionCode || captured.plateType !== fallback.plateType) return undefined;
  return {
    namespace: "simulation",
    regionCode: captured.regionCode,
    regionName: fallback.regionName,
    plateType: captured.plateType,
    version: `official-capture-${captured.observedAt}`,
    generatedAt: captured.observedAt,
    prefix: captured.prefix || fallback.prefix,
    values: captured.values,
    graph: buildTransitionGraph(captured.values),
    source: "official-capture",
    disclaimer: captured.coverage === "segment-snapshot"
      ? "可编号段快照/候选组合，不是已确认实时可用。只留在本机。"
      : "来自官方模拟页现场读取，只留在本机。可按规则筛选后再加入填入列表。"
  };
}

export function clearCapturedPool(surface: "web" | "extension"): void {
  try { localStorage.removeItem(CAPTURED_POOL_KEY); } catch { /* optional */ }
  if (surface !== "extension") return;
  try {
    const area = chromeStorageArea() as (ChromeStorageArea & { remove?(keys: string): Promise<void> | void }) | undefined;
    const result = area?.remove?.("platego_captured_pool");
    if (result && "catch" in result) void result.catch(() => undefined);
  } catch { /* optional */ }
}

export function saveApiBase(value: string, surface: "web" | "extension"): void {
  const normalized = value.replace(/\/$/, "");
  try { localStorage.setItem(API_KEY, normalized); } catch { /* optional local preference */ }
  if (surface !== "extension") return;
  try {
    const result = chromeStorageArea()?.set({ platego_api_base: normalized });
    if (result && "catch" in result) void result.catch(() => undefined);
  } catch { /* optional Chrome preference */ }
}
