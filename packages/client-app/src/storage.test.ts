import { describe, expect, it } from "vitest";
import { DEFAULT_API_BASE, resolveApiBasePreference } from "./storage";

describe("API base preference", () => {
  it("uses PlateGo's unoccupied default port when no preference exists", () => {
    expect(DEFAULT_API_BASE).toBe("http://127.0.0.1:8789");
    expect(resolveApiBasePreference(null)).toBe(DEFAULT_API_BASE);
  });

  it("keeps an existing user-defined API address unchanged", () => {
    expect(resolveApiBasePreference("https://platego.local.example/api"))
      .toBe("https://platego.local.example/api");
  });
});
