import { describe, expect, it } from "vitest";
import {
  buildCandidateDiff,
  buildTransitionGraph,
  createDefaultConfig,
  decodePlateConfig,
  encodePlateConfig,
  enumerateGraph,
  filterAndScorePool,
  observationNamespaceError,
  selectionReducer,
  createSelectionSession
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

  it("scores attractive values and respects avoid rules", () => {
    const rules = createDefaultConfig("test").rules;
    const result = filterAndScorePool(["沪A88888", "沪A44444", "沪A12345"], rules);
    expect(result[0].value).toBe("沪A88888");
    expect(result.find((item) => item.value === "沪A44444")?.score).toBeLessThan(80);
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
