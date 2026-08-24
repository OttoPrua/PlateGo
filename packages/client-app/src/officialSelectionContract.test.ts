import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const flowSource = readFileSync(new URL("./OfficialSelectionFlow.tsx", import.meta.url), "utf8");
const assistantSource = readFileSync(new URL("./Simulator.tsx", import.meta.url), "utf8");

describe("Shanghai adapter fixture contract", () => {
  it("retains every extension-readable data attribute", () => {
    for (const attribute of [
      "data-platego-adapter-root",
      "data-platego-entry-panel",
      "data-platego-user-confirm-info",
      "data-platego-random-panel",
      "data-platego-random-number",
      "data-platego-random-reset",
      "data-platego-user-enter-self",
      "data-platego-self-panel",
      "data-platego-candidate-input",
      "data-platego-keyboard",
      "data-platego-key",
      "data-platego-backspace",
      "data-platego-user-validate"
    ]) expect(flowSource).toContain(attribute);
  });

  it("exposes confirmation only as visible user controls", () => {
    expect(flowSource).toContain("data-platego-user-confirm-selection");
    expect(flowSource).toContain("data-platego-user-validate");
    expect(flowSource).toContain("onClick={confirmRandom}");
    expect(flowSource).toContain("onClick={confirmSelfCompose}");
  });

  it("never gives the helper a confirmation or submission trigger", () => {
    expect(assistantSource).not.toContain("confirmRandom");
    expect(assistantSource).not.toContain("confirmSelfCompose");
    expect(assistantSource).not.toContain("data-platego-user-validate");
    expect(assistantSource).not.toMatch(/\.click\s*\(/);
  });

  it("starts the random page empty and labels all local identity data as fictional", () => {
    expect(flowSource).toContain("useState(false)");
    expect(flowSource).toContain("useState(-1)");
    expect(flowSource).toContain("号牌库为空");
    expect(flowSource).toContain("业务前置入口");
    expect(flowSource).toContain("沪测用户（虚构）");
    expect(flowSource).toContain("不连接真实身份验证");
    expect(flowSource).not.toContain("window.history.back");
  });
});
