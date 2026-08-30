import { describe, expect, it } from "vitest";
import {
  buildCandidateDiff,
  buildTransitionGraph,
  createDefaultConfig,
  decodePlateConfig,
  encodePlateConfig,
  enumerateGraph,
  filterAndScorePool,
  fnv1a,
  matchPositionPattern,
  normalizePositionPatterns,
  observationNamespaceError,
  selectionReducer,
  createSelectionSession,
  stableJson
} from "./index";

describe("PlateGo core", () => {
  it("round-trips a config without any time key", () => {
    const config = createDefaultConfig("sim-test");
    config.favorites = ["沪A88888"];
    const encoded = encodePlateConfig(config);
    expect(encoded.startsWith("PS1:")).toBe(true);
    expect(decodePlateConfig(encoded).favorites).toEqual(["沪A88888"]);
    expect(encoded).not.toContain("secret");
  });

  it("builds and enumerates a transition graph", () => {
    const graph = buildTransitionGraph(["A12", "A18", "B88"]);
    expect(graph.transitions.A).toEqual(["1"]);
    expect(enumerateGraph(graph)).toEqual(["A12", "A18", "B88"]);
  });

  it("only declares missing candidates invalid under complete coverage", () => {
    expect(buildCandidateDiff(["A12", "A13"], ["A12"], ["A12"], "partial").unknown).toEqual(["A13"]);
    expect(buildCandidateDiff(["A12", "A13"], ["A12"], ["A12"], "complete").invalid).toEqual(["A13"]);
  });

  it("keeps highlight and compose prefs in the default config", () => {
    const config = createDefaultConfig("sim-test");
    expect(config.highlightPrefs).toEqual({ pair: true, pairDigits: "", sequence: true, many: true, sequenceTargets: "", manyDigits: "" });
    expect(config.composePrefs).toEqual({ combinations: [], segments: [], positionPatterns: [] });
    const encoded = encodePlateConfig(config);
    expect(decodePlateConfig(encoded).highlightPrefs.pair).toBe(true);
  });

  it("normalizes and bounds six- and seven-cell position patterns", () => {
    const patterns = normalizePositionPatterns([
      { id: "blue", plateType: "small_blue", slots: [" a ", "I", "O", "A B", "!", "9", "Z"], mode: "fixed" },
      { id: "nev", plateType: "small_nev", slots: ["0", " b ", "", "N", "p", "z", "8"], mode: "ordered" },
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `row-${index}`,
        plateType: "small_blue",
        slots: ["A"],
        mode: "fixed"
      }))
    ]);
    expect(patterns).toHaveLength(20);
    expect(patterns[0]).toEqual({
      id: "blue",
      plateType: "small_blue",
      slots: ["A", "", "", "", "", "9"],
      mode: "fixed",
      enabledRandom: true,
      enabledSelf: true
    });
    expect(patterns[1]).toEqual({
      id: "nev",
      plateType: "small_nev",
      slots: ["0", "B", "", "N", "P", "Z", "8"],
      mode: "ordered",
      enabledRandom: true,
      enabledSelf: true
    });
  });

  it("matches fixed positions after exactly one province character", () => {
    const pattern = normalizePositionPatterns([{
      id: "fixed-0894",
      plateType: "small_nev",
      slots: ["", "", "0", "", "8", "9", "4"],
      mode: "fixed"
    }])[0];
    expect(matchPositionPattern("沪AA0A894", pattern)).toBe(true);
    expect(matchPositionPattern("沪AB0D894", pattern)).toBe(true);
    expect(matchPositionPattern("沪A0AA894", pattern)).toBe(false);
    expect(matchPositionPattern("AA0A894", pattern)).toBe(false);
  });

  it("matches ordered nonblank cells as a subsequence and rejects wrong order", () => {
    const pattern = normalizePositionPatterns([{
      id: "ordered-0894",
      plateType: "small_nev",
      slots: ["0", "", "8", "", "9", "", "4"],
      mode: "ordered"
    }])[0];
    expect(matchPositionPattern("沪A0A894A", pattern)).toBe(true);
    expect(matchPositionPattern("沪0A894AA", pattern)).toBe(true);
    expect(matchPositionPattern("沪A0A984A", pattern)).toBe(false);
    expect(matchPositionPattern("沪0-894AA", pattern)).toBe(false);
    expect(matchPositionPattern("沪A0A894!", pattern)).toBe(false);
    expect(matchPositionPattern("沪A0A894I", pattern)).toBe(false);
  });

  it("combines active rows with OR, global filters with AND, and reports all matched IDs", () => {
    const patterns = normalizePositionPatterns([
      { id: "blank", plateType: "small_nev", slots: [], mode: "fixed" },
      { id: "fixed-0894", plateType: "small_nev", slots: ["", "", "0", "", "8", "9", "4"], mode: "fixed" },
      { id: "ordered-0894", plateType: "small_nev", slots: ["0", "8", "9", "4"], mode: "ordered" },
      { id: "last-zero", plateType: "small_nev", slots: ["", "", "", "", "", "", "0"], mode: "fixed" },
      { id: "blue-only", plateType: "small_blue", slots: ["A"], mode: "fixed" }
    ]);
    const result = filterAndScorePool(
      ["沪aa0a894", " 沪AA0A894 ", "沪AB0D894", "沪AAAAAA0", "沪AAAAAA5", "沪A0A984A"],
      [],
      { contains: "0", plateType: "small_nev", positionPatterns: patterns }
    );
    expect(result.map((item) => item.value).sort()).toEqual(["沪AA0A894", "沪AAAAAA0", "沪AB0D894"].sort());
    expect(result.find((item) => item.value === "沪AA0A894")?.matchedPatternIds)
      .toEqual(["fixed-0894", "ordered-0894"]);
    expect(result.find((item) => item.value === "沪AAAAAA0")?.matchedPatternIds).toEqual(["last-zero"]);
  });

  it("treats completely blank rows as inactive and leaves badges empty", () => {
    const patterns = normalizePositionPatterns([
      { id: "blank", plateType: "small_blue", slots: ["", "", "", "", "", ""], mode: "ordered" }
    ]);
    const result = filterAndScorePool(["沪A12345", "沪B88888"], [], {
      plateType: "small_blue",
      positionPatterns: patterns
    });
    expect(result.map((item) => item.value).sort()).toEqual(["沪A12345", "沪B88888"].sort());
    expect(result.every((item) => item.matchedPatternIds.length === 0)).toBe(true);
  });

  it("keeps shared position rules but applies the self-selection enable flag independently", () => {
    const patterns = normalizePositionPatterns([{
      id: "random-only",
      plateType: "small_blue",
      slots: ["A", "", "", "", "", ""],
      mode: "fixed",
      enabledRandom: true,
      enabledSelf: false
    }]);
    const result = filterAndScorePool(["沪A12345", "沪B88888"], [], {
      plateType: "small_blue",
      positionPatterns: patterns
    });
    expect(result.map((item) => item.value).sort()).toEqual(["沪A12345", "沪B88888"].sort());
    expect(patterns[0]).toMatchObject({ enabledRandom: true, enabledSelf: false });
  });

  it("retains normalized patterns through PS1 encoding and decodes legacy schema-1 configs", () => {
    const config = createDefaultConfig("sim-test");
    config.composePrefs.positionPatterns = normalizePositionPatterns([{
      id: "retained",
      plateType: "small_blue",
      slots: [" a ", "", "1", "", "", "9"],
      mode: "fixed"
    }]);
    expect(decodePlateConfig(encodePlateConfig(config)).composePrefs.positionPatterns)
      .toEqual(config.composePrefs.positionPatterns);

    const legacy = createDefaultConfig("legacy") as unknown as Record<string, unknown>;
    const legacyCompose = legacy.composePrefs as Record<string, unknown>;
    delete legacyCompose.positionPatterns;
    const payload = stableJson(legacy);
    const encodedPayload = Buffer.from(payload).toString("base64url");
    expect(decodePlateConfig(`PS1:${encodedPayload}.${fnv1a(payload)}`).composePrefs.positionPatterns).toEqual([]);
  });

  it("filters a local pool by custom combinations and 号段", () => {
    const rules = createDefaultConfig("test").rules;
    const result = filterAndScorePool(
      ["沪A10245", "沪B20486", "沪A88888", "沪D52000"],
      rules,
      { containsAny: ["1024", "2048"], segments: ["A", "B"] }
    );
    expect(result.map((item) => item.value)).toEqual(["沪A10245", "沪B20486"]);
  });

  it("scores attractive values and respects avoid rules", () => {
    const rules = createDefaultConfig("test").rules;
    const result = filterAndScorePool(["沪A88888", "沪A44444", "沪A12345"], rules);
    expect(result[0].value).toBe("沪A88888");
    expect(result.find((item) => item.value === "沪A44444")?.score).toBeLessThan(80);
    const sequenceOnly = filterAndScorePool(["沪A95025", "沪A12875"], rules);
    expect(sequenceOnly.find((item) => item.value === "沪A12875")?.score)
      .toBeGreaterThan(sequenceOnly.find((item) => item.value === "沪A95025")?.score || 0);
    const twoDigitSequence = filterAndScorePool(["沪A12957", "沪A13579"], rules);
    expect(twoDigitSequence.find((item) => item.value === "沪A12957")?.score)
      .toBeGreaterThan(twoDigitSequence.find((item) => item.value === "沪A13579")?.score || 0);
  });

  it("requires each user-controlled entry gate", () => {
    let session = createSelectionSession();
    session = selectionReducer(session, { type: "ADVANCE_ENTRY_GATE" });
    session = selectionReducer(session, { type: "ADVANCE_ENTRY_GATE" });
    expect(session.stage).toBe("ENTRY_GATE");
    session = selectionReducer(session, { type: "ADVANCE_ENTRY_GATE" });
    expect(session.stage).toBe("RANDOM_SELECTION");
  });

  it("separates official-page live observations from non-official simulation observations", () => {
    expect(observationNamespaceError("official-page", "simulation")).toBe("OFFICIAL_PAGE_MUST_USE_LIVE_NAMESPACE");
    expect(observationNamespaceError("web-simulator", "live")).toBe("NON_OFFICIAL_SOURCE_MUST_USE_SIMULATION_NAMESPACE");
    expect(observationNamespaceError("official-page", "live")).toBeUndefined();
    expect(observationNamespaceError("extension-simulator", "simulation")).toBeUndefined();
  });
});
