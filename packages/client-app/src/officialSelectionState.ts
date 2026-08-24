import type { EntryGate, PoolSnapshot, TransitionGraph } from "@platego/core";
import { getRandomBatch } from "@platego/sim-data";

export type OfficialFlowStep =
  | "BASIC_INFO"
  | "CONFIRM_INFO"
  | "SERVICE_NOTICE"
  | "PHONE_VERIFY"
  | "PLATE_SELECTION"
  | "COMPLETE";

export type OfficialViewStep = "LOGIN" | OfficialFlowStep;

export type SelectionMode = "random" | "self";

export interface SelectionRegionRules {
  regionCode: string;
  randomTotal: number;
  batchSize: number;
  selfComposeTotal: number;
  intentSlots: number;
  randomBatchSeconds: number;
  backupSeconds: number;
  selfConfirmSeconds: number;
  evidenceLabel: string;
  verifiedForRegion: boolean;
}

export const OFFICIAL_FLOW_STEPS: ReadonlyArray<{ id: OfficialFlowStep; phase: 1 | 2; label: string }> = [
  { id: "BASIC_INFO", phase: 1, label: "基本信息" },
  { id: "CONFIRM_INFO", phase: 1, label: "确认信息" },
  { id: "SERVICE_NOTICE", phase: 1, label: "选号服务说明" },
  { id: "PHONE_VERIFY", phase: 2, label: "本人选号手机验证" },
  { id: "PLATE_SELECTION", phase: 2, label: "预选号牌" },
  { id: "COMPLETE", phase: 2, label: "完成号牌预选" }
] as const;

export const SHANGHAI_SELECTION_RULES: SelectionRegionRules = {
  regionCode: "310000",
  randomTotal: 5,
  batchSize: 10,
  selfComposeTotal: 20,
  intentSlots: 5,
  randomBatchSeconds: 90,
  backupSeconds: 180,
  selfConfirmSeconds: 8,
  evidenceLabel: "上海当前规则：5 次 10 选 1、20 个自编机会",
  verifiedForRegion: true
};

export const HELPER_AUTOMATION_BOUNDARY = {
  allowed: ["read", "score", "record", "fill", "backspace", "scan"] as const,
  prohibited: ["verify", "confirm", "submit"] as const
};

export function selectionRulesForRegion(regionCode: string): SelectionRegionRules {
  if (regionCode === SHANGHAI_SELECTION_RULES.regionCode) return SHANGHAI_SELECTION_RULES;
  return {
    ...SHANGHAI_SELECTION_RULES,
    regionCode,
    evidenceLabel: "本地演练参数；实际次数以当地页面规则为准",
    verifiedForRegion: false
  };
}

export function flowStepIndex(step: OfficialViewStep): number {
  return OFFICIAL_FLOW_STEPS.findIndex((item) => item.id === step);
}

export function nextOfficialStep(step: OfficialFlowStep): OfficialFlowStep {
  const index = Math.max(0, flowStepIndex(step));
  return OFFICIAL_FLOW_STEPS[Math.min(index + 1, OFFICIAL_FLOW_STEPS.length - 1)].id;
}

export function nextOfficialViewStep(step: OfficialViewStep): OfficialFlowStep {
  return step === "LOGIN" ? "BASIC_INFO" : nextOfficialStep(step);
}

export function entryGateForStep(step: OfficialViewStep): EntryGate {
  if (step === "LOGIN") return "LOGIN_REQUIRED";
  if (step === "BASIC_INFO" || step === "CONFIRM_INFO" || step === "SERVICE_NOTICE") return "BASIC_INFO_REQUIRED";
  if (step === "PHONE_VERIFY") return "IDENTITY_VERIFICATION_REQUIRED";
  return "SELECTION_READY";
}

export function buildConfiguredRandomBatch(
  snapshot: PoolSnapshot,
  batchIndex: number,
  rules: SelectionRegionRules,
  excludeFour: boolean
): string[] {
  const values = excludeFour ? snapshot.values.filter((value) => !value.includes("4")) : snapshot.values;
  if (!values.length) return [];
  return getRandomBatch({ ...snapshot, values }, batchIndex, rules.batchSize);
}

export function selectOneBackupPerBatch(
  backups: ReadonlyArray<string | null>,
  batchIndex: number,
  value: string,
  slotCount: number
): Array<string | null> {
  const next = Array.from({ length: slotCount }, (_, index) => backups[index] ?? null);
  if (batchIndex >= 0 && batchIndex < slotCount) next[batchIndex] = value;
  return next;
}

export function remainingSeconds(deadline: number | null, now: number): number {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil((deadline - now) / 1_000));
}

export function nextBackupDeadline(now: number, rules: SelectionRegionRules): number {
  return now + rules.backupSeconds * 1_000;
}

export function sanitizeIntent(value: string, maxLength: number, fullPrefix = ""): string {
  const normalized = value.toUpperCase().replace(/\s/g, "");
  const suffix = fullPrefix && normalized.startsWith(fullPrefix) ? normalized.slice(fullPrefix.length) : normalized;
  return suffix.replace(/[^A-HJ-NP-Z0-9]/g, "").slice(0, maxLength);
}

export function allowedIntentKeys(graph: TransitionGraph, value: string): string[] {
  if (value.length >= graph.maxLength) return [];
  return graph.transitions[value.toUpperCase()] ?? [];
}

export function canConfirmSelfCompose(values: string[], maxLength: number, countdownSeconds: number): boolean {
  const nonEmpty = values.filter(Boolean);
  return countdownSeconds === 0
    && nonEmpty.length > 0
    && nonEmpty.every((value) => value.length === maxLength);
}

export interface SelfComposeAttempt {
  attempted: number;
  winner: string | null;
  remaining: number;
  results: Array<"available" | "unavailable" | "empty">;
}

export function evaluateSelfComposeAttempt(
  snapshot: PoolSnapshot,
  values: string[],
  remaining: number
): SelfComposeAttempt {
  const available = new Set(snapshot.values);
  const fullValues = values.map((suffix) => suffix ? `${snapshot.prefix}${suffix}` : "");
  const results = fullValues.map((value) => !value
    ? "empty" as const
    : available.has(value) ? "available" as const : "unavailable" as const);
  const attempted = fullValues.filter(Boolean).length;
  const winnerIndex = results.findIndex((result) => result === "available");
  return {
    attempted,
    winner: winnerIndex >= 0 ? fullValues[winnerIndex] : null,
    remaining: winnerIndex >= 0 ? remaining : Math.max(0, remaining - attempted),
    results
  };
}
