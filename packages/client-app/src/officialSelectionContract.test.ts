import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const flowSource = readFileSync(new URL("./OfficialSelectionFlow.tsx", import.meta.url), "utf8");
const assistantSource = readFileSync(new URL("./Simulator.tsx", import.meta.url), "utf8");

describe("Shanghai adapter fixture contract", () => {
  it("retains every extension-readable data attribute", () => {
    for (const attribute of [
      "data-platego-adapter-root",
      "data-platego-flow-step",
      "data-platego-entry-panel",
      "data-platego-user-confirm-info",
      "data-platego-vehicle-field",
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

  it("shows PlateGo entry navigation except during plate selection", () => {
    expect(flowSource).toContain("pg-entry-nav");
    expect(flowSource).toContain("12123 选号站");
    expect(flowSource).toContain("号段公示");
    expect(flowSource).toContain("step !== \"PLATE_SELECTION\"");
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

  it("nests the official #clpp/#clxh form plus an EasyUI iframe fallback", () => {
    expect(flowSource).toContain("BRAND_SEARCH_WRAPPER_HTML");
    expect(flowSource).toContain("BRAND_SEARCH_OFFICIAL_HTML");
    expect(flowSource).toContain("id=\"formsearch\"");
    expect(flowSource).toContain("id=\"btnPpxh\"");
    expect(flowSource).toContain("queryPpxh");
    expect(flowSource).toContain("id=\"clpp\"");
    expect(flowSource).toContain("id=\"clxh\"");
    expect(flowSource).toContain("name=\"ppxh\"");
    expect(flowSource).toContain("id=\"btnSearch\"");
    expect(flowSource).toContain("请输入车辆品牌");
    expect(flowSource).toContain("请输入车辆型号");
    expect(flowSource).toContain("searchbox-prompt");
    expect(flowSource).toContain("textbox-value");
    expect(flowSource).toContain("name=\"page\"");
  });
});
