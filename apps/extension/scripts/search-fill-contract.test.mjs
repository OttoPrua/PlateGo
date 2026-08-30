import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentSource = await readFile(resolve(extensionRoot, "public/content.js"), "utf8");

function matchesSearchPrompt(haystack, key) {
  const prompts = key === "brand"
    ? ["请输入车辆品牌", "请输入中文品牌", "请输入品牌"]
    : ["请输入车辆型号", "请输入型号"];
  return prompts.some((prompt) => String(haystack || "").includes(prompt));
}

function isBrandQueryButton(text) {
  const compact = String(text || "").replace(/\s+/g, "");
  if (/条件|结果|列表|确认|提交|请点此|选择车辆|关闭/.test(compact)) return false;
  return /^(查询|搜索)$/.test(compact);
}

test("finds official search boxes by placeholder prompts", () => {
  assert.equal(matchesSearchPrompt("请输入车辆品牌", "brand"), true);
  assert.equal(matchesSearchPrompt("请输入车辆型号", "model"), true);
  assert.equal(matchesSearchPrompt("选择车辆品牌型号", "model"), false);
});

test("treats only the actual query button as a search control", () => {
  assert.equal(isBrandQueryButton("查询"), true);
  assert.equal(isBrandQueryButton("搜索"), true);
  assert.equal(isBrandQueryButton("查询条件"), false);
  assert.equal(isBrandQueryButton("请点此查询"), false);
  assert.equal(isBrandQueryButton("确定"), false);
  assert.match(contentSource, /条件\|结果\|列表/);
});

test("finds nested search documents and does not spray hidden fields", () => {
  assert.match(contentSource, /collectReadableDocuments/);
  assert.match(contentSource, /companionHiddenInputs/);
  assert.match(contentSource, /textbox-value/);
  assert.match(contentSource, /SEARCH_FIELD_HINTS/);
  assert.match(contentSource, /ppmc\|clppmc\|clpp/);
  assert.match(contentSource, /function findDirectSearchInput/);
  assert.match(contentSource, /function queryPpxhDocuments/);
  assert.match(contentSource, /function isBrandSearchDialogOpen/);
  assert.match(contentSource, /function watchBrandSearchOpener/);
  assert.match(contentSource, /searchOpenStickyUntil/);
  assert.match(contentSource, /选择车辆品牌型号/);
  assert.match(contentSource, /queryPpxh\|mdlPpxh/);
  assert.match(contentSource, /#btnPpxh/);
  assert.match(contentSource, /#vehForm/);
  assert.match(contentSource, /#formsearch/);
  assert.match(contentSource, /"clpp"/);
  assert.match(contentSource, /"clxh"/);
  assert.match(contentSource, /pageTag\(iframe\) !== "IFRAME"/);
  assert.doesNotMatch(contentSource, /clxh\|cpxh\|ppxh/);
  assert.doesNotMatch(contentSource, /row\.querySelectorAll\("input\[type='hidden'\]"\)/);
  assert.match(contentSource, /skipKeys = new Set\(\["brand", "model"\]\)/);
  assert.match(contentSource, /searchFormScopes/);
  assert.match(contentSource, /function walk\(node\)/);
  assert.match(contentSource, /searchWidgetWrap/);
  assert.doesNotMatch(contentSource, /\.textbox, \.combo, \.searchbox, \.easyui-fluid, span, td, div/);
  assert.match(contentSource, /findInputByPromptNodes/);
  assert.match(contentSource, /collectToolbarSearchInputs/);
  assert.match(contentSource, /inputs\.length < 2/);
  assert.match(contentSource, /page\|rows\|size\|pager/i);
  assert.match(contentSource, /collectSearchInputs/);
  assert.match(contentSource, /describeSearchFillFailure/);
  assert.match(contentSource, /val-clpp/);
  assert.doesNotMatch(contentSource, /btnSearch[\s\S]{0,80}\.click/);
});

test("opens a two-column search board without auto-writing the official form", () => {
  assert.match(contentSource, /looksLikeBrandSearchChrome/);
  assert.match(contentSource, /searchUiRoots/);
  assert.match(contentSource, /refreshPageHints/);
  assert.match(contentSource, /data-platego-next-action/);
  assert.match(contentSource, /fillOneSearchField/);
  assert.match(contentSource, /fill-search-both/);
  assert.match(contentSource, /function fillSearchFields/);
  assert.match(contentSource, /clickOfficialSearchQuery/);
  assert.match(contentSource, /search-pair/);
  assert.doesNotMatch(contentSource, /highlightNext/);
  assert.match(contentSource, /findPromptedSearchInput/);
  assert.match(contentSource, /请输入车辆型号/);
  assert.match(contentSource, /syncSelectedVehicleRecord/);
  assert.match(contentSource, /hintOfficialSearchField/);
});
