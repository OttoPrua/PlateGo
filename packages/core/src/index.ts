export const CONFIG_SCHEMA_VERSION = 1 as const;

export type PlateType = "small_blue" | "small_nev";
export type PoolNamespace = "simulation" | "live";
export type Coverage = "complete" | "partial" | "position-only" | "unknown";
export type CandidateSource = "pool" | "favorite" | "rule" | "manual" | "capture";

export interface RegionProfile {
  code: string;
  name: string;
  shortName: string;
  authority: string;
  provincePrefix: string;
}

export interface TransitionGraph {
  maxLength: number;
  transitions: Record<string, string[]>;
  terminals: string[];
}

export interface PoolSnapshot {
  namespace: PoolNamespace;
  regionCode: string;
  regionName: string;
  plateType: PlateType;
  version: string;
  generatedAt: string;
  prefix: string;
  values: string[];
  graph: TransitionGraph;
  source: "bundled-fixed" | "backend-fixed" | "local-demo-latest" | "public-observation";
  disclaimer?: string;
}

export type PreferenceKind = "contains" | "prefix" | "suffix" | "avoid" | "repeat" | "sequence";

export interface PreferenceRule {
  id: string;
  label: string;
  kind: PreferenceKind;
  target: string;
  weight: number;
  enabled: boolean;
}

export interface CandidateEntry {
  id: string;
  value: string;
  source: CandidateSource;
  score: number;
  createdAt: string;
}

export interface PlateConfig {
  schemaVersion: typeof CONFIG_SCHEMA_VERSION;
  simDataVersion: string;
  regionCode: string;
  plateType: PlateType;
  rules: PreferenceRule[];
  favorites: string[];
  orderedCandidates: CandidateEntry[];
  exportedAt: string;
}

export interface PublicPoolObservation {
  namespace: PoolNamespace;
  regionCode: string;
  plateType: PlateType;
  prefix: string;
  transitions: Record<string, string[]>;
  terminals: string[];
  coverage: Coverage;
  observedAt: string;
  adapterVersion: string;
  source: "official-page" | "official-mock" | "web-simulator" | "extension-simulator";
  observationHash: string;
}

export const OFFICIAL_PAGE_MUST_USE_LIVE_NAMESPACE = "OFFICIAL_PAGE_MUST_USE_LIVE_NAMESPACE" as const;
export const NON_OFFICIAL_SOURCE_MUST_USE_SIMULATION_NAMESPACE = "NON_OFFICIAL_SOURCE_MUST_USE_SIMULATION_NAMESPACE" as const;

export function observationNamespaceError(
  source: PublicPoolObservation["source"],
  namespace: PoolNamespace
): typeof OFFICIAL_PAGE_MUST_USE_LIVE_NAMESPACE | typeof NON_OFFICIAL_SOURCE_MUST_USE_SIMULATION_NAMESPACE | undefined {
  if (source === "official-page" && namespace !== "live") return OFFICIAL_PAGE_MUST_USE_LIVE_NAMESPACE;
  if (source !== "official-page" && namespace !== "simulation") return NON_OFFICIAL_SOURCE_MUST_USE_SIMULATION_NAMESPACE;
  return undefined;
}

export interface CandidateDiff {
  retained: string[];
  invalid: string[];
  unknown: string[];
  added: string[];
}

export interface PoolFilter {
  prefix?: string;
  contains?: string;
  excludes?: string;
  minScore?: number;
}

export interface ScoredValue {
  value: string;
  score: number;
  reasons: string[];
}

export type EntryGate =
  | "LOGIN_REQUIRED"
  | "BASIC_INFO_REQUIRED"
  | "IDENTITY_VERIFICATION_REQUIRED"
  | "SELECTION_READY";

export type SelectionStage =
  | "ENTRY_GATE"
  | "RANDOM_SELECTION"
  | "SELF_COMPOSE_CAPTURE"
  | "SELF_COMPOSE_REVIEW"
  | "SELF_COMPOSE_FILL"
  | "HANDOFF_TO_USER";

export interface SelectionSession {
  stage: SelectionStage;
  entryGate: EntryGate;
  randomBatchIndex: number;
  randomResetLimit: number;
  selectedRandom: string[];
  filledGroup: string[];
  eventLog: Array<{ at: string; type: string; detail: string }>;
}

export type SelectionAction =
  | { type: "ADVANCE_ENTRY_GATE" }
  | { type: "ADD_RANDOM_CANDIDATE"; value: string }
  | { type: "NEXT_RANDOM_BATCH" }
  | { type: "RANDOM_SATISFIED" }
  | { type: "ENTER_SELF_COMPOSE" }
  | { type: "CAPTURE_COMPLETED" }
  | { type: "ACCEPT_CANDIDATE_DIFF" }
  | { type: "FILL_GROUP"; values: string[] }
  | { type: "USER_VALIDATED"; detail: string }
  | { type: "RESET_SESSION" };

const nowIso = () => new Date().toISOString();

export function newId(prefix = "item"): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function createDefaultConfig(simDataVersion: string): PlateConfig {
  return {
    schemaVersion: CONFIG_SCHEMA_VERSION,
    simDataVersion,
    regionCode: "310000",
    plateType: "small_blue",
    rules: [
      { id: "rule-avoid-4", label: "避开数字 4", kind: "avoid", target: "4", weight: 28, enabled: true },
      { id: "rule-repeat", label: "偏好重复数字", kind: "repeat", target: "", weight: 14, enabled: true },
      { id: "rule-sequence", label: "偏好连续数字", kind: "sequence", target: "", weight: 10, enabled: true }
    ],
    favorites: [],
    orderedCandidates: [],
    exportedAt: nowIso()
  };
}

export function scoreValue(value: string, rules: PreferenceRule[]): ScoredValue {
  const normalized = value.toUpperCase();
  let score = 50;
  const reasons: string[] = [];

  for (const rule of rules.filter((item) => item.enabled)) {
    const target = rule.target.toUpperCase();
    let matched = false;
    if (rule.kind === "contains" && target) matched = normalized.includes(target);
    if (rule.kind === "prefix" && target) matched = normalized.startsWith(target);
    if (rule.kind === "suffix" && target) matched = normalized.endsWith(target);
    if (rule.kind === "avoid" && target) {
      matched = normalized.includes(target);
      if (matched) {
        score -= Math.abs(rule.weight);
        reasons.push(`包含需避开的 ${target}`);
      }
      continue;
    }
    if (rule.kind === "repeat") matched = /(.)\1/.test(normalized);
    if (rule.kind === "sequence") matched = hasSequence(normalized);
    if (matched) {
      score += rule.weight;
      reasons.push(rule.label);
    }
  }

  const suffix = normalized.slice(-4);
  if (/^(.)\1{3}$/.test(suffix)) {
    score += 32;
    reasons.push("四位相同");
  } else if (/(.)\1{2}/.test(normalized)) {
    score += 18;
    reasons.push("三位相同");
  }
  if (/([0-9])\1.*([0-9])\2/.test(normalized)) {
    score += 8;
    reasons.push("成对数字");
  }

  return { value, score: Math.max(0, Math.min(100, score)), reasons: [...new Set(reasons)] };
}

function hasSequence(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  for (let index = 0; index <= digits.length - 3; index += 1) {
    const triplet = digits.slice(index, index + 3).split("").map(Number);
    if ((triplet[1] === triplet[0] + 1 && triplet[2] === triplet[1] + 1)
      || (triplet[1] === triplet[0] - 1 && triplet[2] === triplet[1] - 1)) return true;
  }
  return false;
}

export function filterAndScorePool(
  values: string[],
  rules: PreferenceRule[],
  filter: PoolFilter = {}
): ScoredValue[] {
  const prefix = filter.prefix?.trim().toUpperCase();
  const contains = filter.contains?.trim().toUpperCase();
  const excludes = filter.excludes?.trim().toUpperCase();
  return values
    .filter((value) => !prefix || value.toUpperCase().startsWith(prefix))
    .filter((value) => !contains || value.toUpperCase().includes(contains))
    .filter((value) => !excludes || !value.toUpperCase().includes(excludes))
    .map((value) => scoreValue(value, rules))
    .filter((item) => item.score >= (filter.minScore ?? 0))
    .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value));
}

export function buildTransitionGraph(values: string[]): TransitionGraph {
  const transitions = new Map<string, Set<string>>();
  const terminals = new Set<string>();
  let maxLength = 0;
  for (const rawValue of values) {
    const value = rawValue.trim().toUpperCase();
    if (!value) continue;
    maxLength = Math.max(maxLength, value.length);
    for (let index = 0; index < value.length; index += 1) {
      const prefix = value.slice(0, index);
      const next = value[index];
      if (!transitions.has(prefix)) transitions.set(prefix, new Set());
      transitions.get(prefix)?.add(next);
    }
    terminals.add(value);
  }
  return {
    maxLength,
    transitions: Object.fromEntries(
      [...transitions.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([prefix, next]) => [prefix, [...next].sort()])
    ),
    terminals: [...terminals].sort()
  };
}

export function nextAllowedCharacters(graph: TransitionGraph, prefix: string): string[] {
  return graph.transitions[prefix.toUpperCase()] ?? [];
}

export function enumerateGraph(graph: TransitionGraph, limit = 10_000): string[] {
  const result: string[] = [];
  const queue = [""];
  const terminals = new Set(graph.terminals);
  while (queue.length > 0 && result.length < limit) {
    const prefix = queue.shift() ?? "";
    if (terminals.has(prefix)) result.push(prefix);
    for (const next of nextAllowedCharacters(graph, prefix)) queue.push(prefix + next);
  }
  return result;
}

export function buildCandidateDiff(
  previous: string[],
  observed: string[],
  generated: string[],
  coverage: Coverage
): CandidateDiff {
  const previousUnique = [...new Set(previous.map((item) => item.toUpperCase()))];
  const observedSet = new Set(observed.map((item) => item.toUpperCase()));
  const retained = previousUnique.filter((item) => observedSet.has(item));
  const missing = previousUnique.filter((item) => !observedSet.has(item));
  const invalid = coverage === "complete" ? missing : [];
  const unknown = coverage === "complete" ? [] : missing;
  const added = [...new Set(generated.map((item) => item.toUpperCase()))]
    .filter((item) => observedSet.has(item) && !previousUnique.includes(item));
  return { retained, invalid, unknown, added };
}

export function createSelectionSession(randomResetLimit = 5): SelectionSession {
  return {
    stage: "ENTRY_GATE",
    entryGate: "LOGIN_REQUIRED",
    randomBatchIndex: 0,
    randomResetLimit,
    selectedRandom: [],
    filledGroup: [],
    eventLog: [{ at: nowIso(), type: "SESSION_STARTED", detail: "本地会话已创建" }]
  };
}

export function selectionReducer(state: SelectionSession, action: SelectionAction): SelectionSession {
  const log = (type: string, detail: string): SelectionSession["eventLog"] => [
    ...state.eventLog,
    { at: nowIso(), type, detail }
  ];
  switch (action.type) {
    case "ADVANCE_ENTRY_GATE": {
      const gates: EntryGate[] = [
        "LOGIN_REQUIRED",
        "BASIC_INFO_REQUIRED",
        "IDENTITY_VERIFICATION_REQUIRED",
        "SELECTION_READY"
      ];
      const next = gates[Math.min(gates.indexOf(state.entryGate) + 1, gates.length - 1)];
      return {
        ...state,
        entryGate: next,
        stage: next === "SELECTION_READY" ? "RANDOM_SELECTION" : "ENTRY_GATE",
        eventLog: log("ENTRY_GATE_CHANGED", next)
      };
    }
    case "ADD_RANDOM_CANDIDATE":
      return state.selectedRandom.includes(action.value) ? state : {
        ...state,
        selectedRandom: [...state.selectedRandom, action.value],
        eventLog: log("RANDOM_CANDIDATE_ADDED", action.value)
      };
    case "NEXT_RANDOM_BATCH":
      return {
        ...state,
        randomBatchIndex: Math.min(state.randomBatchIndex + 1, state.randomResetLimit),
        eventLog: log("RANDOM_BATCH_CHANGED", `第 ${state.randomBatchIndex + 2} 组`)
      };
    case "RANDOM_SATISFIED":
      return { ...state, stage: "HANDOFF_TO_USER", eventLog: log("HANDOFF_TO_USER", "随机候选已满足") };
    case "ENTER_SELF_COMPOSE":
      return { ...state, stage: "SELF_COMPOSE_CAPTURE", eventLog: log("SELF_COMPOSE_STARTED", "进入自编采集") };
    case "CAPTURE_COMPLETED":
      return { ...state, stage: "SELF_COMPOSE_REVIEW", eventLog: log("CAPTURE_COMPLETED", "等待用户确认候选更新") };
    case "ACCEPT_CANDIDATE_DIFF":
      return { ...state, stage: "SELF_COMPOSE_FILL", eventLog: log("CANDIDATE_DIFF_ACCEPTED", "用户已确认候选更新") };
    case "FILL_GROUP":
      return { ...state, filledGroup: action.values, eventLog: log("GROUP_FILLED", action.values.join("、")) };
    case "USER_VALIDATED":
      return { ...state, eventLog: log("USER_VALIDATED", action.detail) };
    case "RESET_SESSION":
      return createSelectionSession(state.randomResetLimit);
  }
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)])
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(stable(value));
}

export function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

export function encodePlateConfig(config: PlateConfig): string {
  const safeConfig: PlateConfig = {
    ...config,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    exportedAt: nowIso()
  };
  const payload = stableJson(safeConfig);
  return `PS1:${base64UrlEncode(payload)}.${fnv1a(payload)}`;
}

export function decodePlateConfig(encoded: string): PlateConfig {
  const normalized = encoded.trim();
  if (!normalized.startsWith("PS1:")) throw new Error("不是 PlateGo PS1 配置");
  const [payloadPart, checksum] = normalized.slice(4).split(".");
  if (!payloadPart || !checksum) throw new Error("配置结构不完整");
  const payload = base64UrlDecode(payloadPart);
  if (fnv1a(payload) !== checksum) throw new Error("配置校验失败，内容可能不完整");
  const parsed = JSON.parse(payload) as PlateConfig;
  if (parsed.schemaVersion !== CONFIG_SCHEMA_VERSION) throw new Error(`暂不支持配置版本 ${parsed.schemaVersion}`);
  if (!Array.isArray(parsed.rules) || !Array.isArray(parsed.favorites) || !Array.isArray(parsed.orderedCandidates)) {
    throw new Error("配置字段不完整");
  }
  return parsed;
}

export function createObservation(input: Omit<PublicPoolObservation, "observationHash">): PublicPoolObservation {
  const normalized = {
    ...input,
    prefix: input.prefix.toUpperCase(),
    transitions: Object.fromEntries(
      Object.entries(input.transitions)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([prefix, next]) => [prefix.toUpperCase(), [...new Set(next.map((item) => item.toUpperCase()))].sort()])
    ),
    terminals: [...new Set(input.terminals.map((item) => item.toUpperCase()))].sort()
  };
  return { ...normalized, observationHash: fnv1a(stableJson(normalized)) };
}

export function sanitizePublicObservation(input: PublicPoolObservation): PublicPoolObservation {
  return createObservation({
    namespace: input.namespace,
    regionCode: String(input.regionCode),
    plateType: input.plateType,
    prefix: String(input.prefix),
    transitions: input.transitions ?? {},
    terminals: input.terminals ?? [],
    coverage: input.coverage,
    observedAt: input.observedAt,
    adapterVersion: String(input.adapterVersion),
    source: input.source
  });
}
