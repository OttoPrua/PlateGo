import { describe, expect, it } from "vitest";
import { REGIONS, SIM_DATA_VERSION, getSimulatedPool } from "./index";

describe("fixed simulation data", () => {
  it("covers all mainland province-level regions", () => {
    expect(REGIONS).toHaveLength(31);
    expect(new Set(REGIONS.map((region) => region.code)).size).toBe(31);
  });

  it("is deterministic and includes a transition graph", () => {
    const first = getSimulatedPool("310000", "small_blue");
    const second = getSimulatedPool("310000", "small_blue");
    expect(first.version).toBe(SIM_DATA_VERSION);
    expect(first.values).toEqual(second.values);
    expect(first.values).toHaveLength(240);
    expect(first.graph.terminals).toHaveLength(240);
  });

  it("keeps simulation and real namespaces separate", () => {
    expect(getSimulatedPool("110000", "small_nev").namespace).toBe("simulation");
  });
});
