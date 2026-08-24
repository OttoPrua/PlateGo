import { describe, expect, it } from "vitest";
import { getSimulatedPool } from "@platego/sim-data";
import {
  HELPER_AUTOMATION_BOUNDARY,
  OFFICIAL_FLOW_STEPS,
  SHANGHAI_SELECTION_RULES,
  allowedIntentKeys,
  buildConfiguredRandomBatch,
  canConfirmSelfCompose,
  entryGateForStep,
  evaluateSelfComposeAttempt,
  nextBackupDeadline,
  nextOfficialViewStep,
  remainingSeconds,
  selectOneBackupPerBatch,
  selectionRulesForRegion
} from "./officialSelectionState";

describe("official selection flow", () => {
  it("defines the two-stage six-step official sequence and legacy gate contract", () => {
    expect(OFFICIAL_FLOW_STEPS).toHaveLength(6);
    expect(OFFICIAL_FLOW_STEPS.map((item) => item.label)).toEqual([
      "基本信息",
      "确认信息",
      "选号服务说明",
      "本人选号手机验证",
      "预选号牌",
      "完成号牌预选"
    ]);
    expect(OFFICIAL_FLOW_STEPS.filter((item) => item.phase === 1)).toHaveLength(3);
    expect(OFFICIAL_FLOW_STEPS.filter((item) => item.phase === 2)).toHaveLength(3);
    expect(nextOfficialViewStep("LOGIN")).toBe("BASIC_INFO");
    expect(entryGateForStep("LOGIN")).toBe("LOGIN_REQUIRED");
    expect(entryGateForStep("BASIC_INFO")).toBe("BASIC_INFO_REQUIRED");
    expect(entryGateForStep("CONFIRM_INFO")).toBe("BASIC_INFO_REQUIRED");
    expect(entryGateForStep("SERVICE_NOTICE")).toBe("BASIC_INFO_REQUIRED");
    expect(entryGateForStep("PHONE_VERIFY")).toBe("IDENTITY_VERIFICATION_REQUIRED");
    expect(entryGateForStep("PLATE_SELECTION")).toBe("SELECTION_READY");
  });

  it("keeps Shanghai evidence values in a region-scoped configuration", () => {
    expect(SHANGHAI_SELECTION_RULES).toMatchObject({
      regionCode: "310000",
      randomTotal: 5,
      batchSize: 10,
      selfComposeTotal: 20,
      intentSlots: 5,
      verifiedForRegion: true
    });
    expect(selectionRulesForRegion("110000")).toMatchObject({
      regionCode: "110000",
      verifiedForRegion: false
    });
  });

  it("builds five deterministic batches of ten and honors no-four", () => {
    const snapshot = getSimulatedPool("310000", "small_blue");
    const batches = Array.from({ length: SHANGHAI_SELECTION_RULES.randomTotal }, (_, index) =>
      buildConfiguredRandomBatch(snapshot, index, SHANGHAI_SELECTION_RULES, false));
    expect(batches).toHaveLength(5);
    expect(batches.every((batch) => batch.length === 10)).toBe(true);

    const noFour = buildConfiguredRandomBatch(snapshot, 0, SHANGHAI_SELECTION_RULES, true);
    expect(noFour).toHaveLength(10);
    expect(noFour.every((value) => !value.includes("4"))).toBe(true);
  });

  it("keeps exactly one backup per batch across five fixed slots", () => {
    let backups: Array<string | null> = Array(5).fill(null);
    backups = selectOneBackupPerBatch(backups, 0, "沪A12345", 5);
    backups = selectOneBackupPerBatch(backups, 0, "沪A56789", 5);
    backups = selectOneBackupPerBatch(backups, 1, "沪A88888", 5);
    expect(backups).toHaveLength(5);
    expect(backups).toEqual(["沪A56789", "沪A88888", null, null, null]);
  });

  it("models independent batch and backup countdowns and resets backup time on every choice", () => {
    const now = 10_000;
    const batchDeadline = now + SHANGHAI_SELECTION_RULES.randomBatchSeconds * 1_000;
    const firstBackupDeadline = nextBackupDeadline(now, SHANGHAI_SELECTION_RULES);
    const replacedBackupDeadline = nextBackupDeadline(now + 12_000, SHANGHAI_SELECTION_RULES);
    expect(remainingSeconds(batchDeadline, now)).toBe(90);
    expect(remainingSeconds(firstBackupDeadline, now)).toBe(180);
    expect(replacedBackupDeadline).toBe(firstBackupDeadline + 12_000);
  });

  it("uses a five-intent virtual keyboard graph and countdown-gated user confirmation", () => {
    const snapshot = getSimulatedPool("310000", "small_blue");
    const inputs = Array(SHANGHAI_SELECTION_RULES.intentSlots).fill("");
    const firstKeys = allowedIntentKeys(snapshot.graph, "");
    expect(inputs).toHaveLength(5);
    expect(firstKeys.length).toBeGreaterThan(0);
    expect(firstKeys).not.toContain("I");
    expect(firstKeys).not.toContain("O");

    const availableSuffix = snapshot.values[0].slice(snapshot.prefix.length);
    expect(canConfirmSelfCompose([availableSuffix, "", "", "", ""], snapshot.graph.maxLength, 1)).toBe(false);
    expect(canConfirmSelfCompose([availableSuffix, "", "", "", ""], snapshot.graph.maxLength, 0)).toBe(true);
  });

  it("deducts attempted self-compose intents on failure and auto-selects first available intent", () => {
    const snapshot = getSimulatedPool("310000", "small_blue");
    const available = snapshot.values[0].slice(snapshot.prefix.length);
    const failed = evaluateSelfComposeAttempt(snapshot, ["ZZZZZ", "YYYYY", "", "", ""], 20);
    expect(failed).toMatchObject({ attempted: 2, winner: null, remaining: 18 });

    const succeeded = evaluateSelfComposeAttempt(snapshot, ["ZZZZZ", available, "", "", ""], 20);
    expect(succeeded.winner).toBe(`${snapshot.prefix}${available}`);
    expect(succeeded.remaining).toBe(20);
  });

  it("makes the assistant automation boundary explicit", () => {
    expect(HELPER_AUTOMATION_BOUNDARY.allowed).toEqual(["read", "score", "record", "fill", "backspace", "scan"]);
    expect(HELPER_AUTOMATION_BOUNDARY.prohibited).toEqual(["verify", "confirm", "submit"]);
  });
});
