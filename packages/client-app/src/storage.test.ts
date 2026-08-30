import { afterEach, describe, expect, it, vi } from "vitest";
import { getSimulatedPool } from "@platego/sim-data";
import { createDefaultConfig, type PlateConfig } from "@platego/core";
import {
  DEFAULT_API_BASE,
  POSITION_PATTERNS_KEY,
  loadConfig,
  loadExtensionConfig,
  normalizeCapturedPool,
  normalizePlateConfig,
  resolveApiBasePreference,
  saveConfig,
  snapshotFromCapturedPool
} from "./storage";

afterEach(() => vi.unstubAllGlobals());

describe("API base preference", () => {
  it("uses PlateGo's unoccupied default port when no preference exists", () => {
    expect(DEFAULT_API_BASE).toBe("http://127.0.0.1:8789");
    expect(resolveApiBasePreference(null)).toBe(DEFAULT_API_BASE);
  });

  it("keeps an existing user-defined API address unchanged", () => {
    expect(resolveApiBasePreference("https://platego.local.example/api"))
      .toBe("https://platego.local.example/api");
  });

  it("turns a captured official pool into the local filter snapshot", () => {
    const bundled = getSimulatedPool("310000", "small_blue");
    const captured = normalizeCapturedPool({
      schemaVersion: 1,
      namespace: "simulation",
      regionCode: "310000",
      plateType: "small_blue",
      prefix: "沪A",
      coverage: "complete",
      observedAt: "2026-08-27T00:00:00.000Z",
      values: ["沪A12345", "沪A88888"]
    });
    expect(captured?.values).toEqual(["沪A12345", "沪A88888"]);
    const snapshot = snapshotFromCapturedPool(captured!, bundled);
    expect(snapshot?.source).toBe("official-capture");
    expect(snapshot?.values).toEqual(["沪A12345", "沪A88888"]);
  });

  it("fills highlight and compose prefs when an older config omits them", () => {
    const legacy = createDefaultConfig("sim-test") as unknown as Record<string, unknown>;
    delete legacy.highlightPrefs;
    delete legacy.composePrefs;
    const omitted = normalizePlateConfig(legacy);
    expect(omitted.highlightPrefs).toEqual({ pair: true, pairDigits: "", sequence: true, many: true, sequenceTargets: "", manyDigits: "" });
    expect(omitted.composePrefs).toEqual({ combinations: [], segments: [], positionPatterns: [] });
    const next = normalizePlateConfig({
      ...legacy,
      highlightPrefs: { pair: false, pairDigits: "6886", sequence: true, many: false, sequenceTargets: "12、56", manyDigits: "9989" },
      composePrefs: { combinations: ["2048", "520"], segments: ["A", "I", "d"] }
    });
    expect(next.highlightPrefs).toEqual({ pair: false, pairDigits: "68", sequence: true, many: false, sequenceTargets: "12、56", manyDigits: "98" });
    expect(next.composePrefs).toEqual({ combinations: ["2048", "520"], segments: ["A", "D"], positionPatterns: [] });
  });

  it("retains normalized patterns through web and extension config storage", async () => {
    let savedLocal = "";
    let savedExtension: Record<string, unknown> = {};
    const stored = {
      ...createDefaultConfig("sim-test"),
      composePrefs: {
        combinations: ["1024"],
        segments: ["A"],
        positionPatterns: [
          { id: "blue", plateType: "small_blue", slots: [" a ", "", "I", "8"], mode: "fixed" },
          { id: "nev", plateType: "small_nev", slots: ["0", "8", "9", "4"], mode: "ordered" }
        ]
      }
    };
    const sharedStored = {
      ...stored,
      composePrefs: {
        combinations: stored.composePrefs.combinations,
        segments: stored.composePrefs.segments
      }
    };
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(stored),
      setItem: (_key: string, value: string) => { savedLocal = value; }
    });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: async () => ({
            platego_config: sharedStored,
            [POSITION_PATTERNS_KEY]: stored.composePrefs.positionPatterns
          }),
          set: async (items: Record<string, unknown>) => { savedExtension = items; }
        }
      }
    });

    const expectedPatterns = [
      { id: "blue", plateType: "small_blue", slots: ["A", "", "", "8", "", ""], mode: "fixed", enabledRandom: true, enabledSelf: true },
      { id: "nev", plateType: "small_nev", slots: ["0", "8", "9", "4", "", "", ""], mode: "ordered", enabledRandom: true, enabledSelf: true }
    ];
    expect(loadConfig().composePrefs.positionPatterns).toEqual(expectedPatterns);
    expect((await loadExtensionConfig())?.composePrefs.positionPatterns).toEqual(expectedPatterns);
    saveConfig(stored as unknown as PlateConfig, "extension");
    expect((JSON.parse(savedLocal) as PlateConfig).composePrefs.positionPatterns).toEqual(expectedPatterns);
    expect((savedExtension.platego_config as PlateConfig).composePrefs).toEqual({
      combinations: ["1024"],
      segments: ["A"]
    });
    expect(savedExtension[POSITION_PATTERNS_KEY]).toEqual(expectedPatterns);
  });
});
