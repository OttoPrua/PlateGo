import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentSource = await readFile(resolve(extensionRoot, "public/content.js"), "utf8");
const backgroundSource = await readFile(resolve(extensionRoot, "public/background.js"), "utf8");

function matchVehicleFieldLabel(text, nameHint) {
  const haystack = String(text || "").replace(/\s+/g, "");
  if (/所有人|身份证|手机|联系|发动机|住所/.test(haystack)) return "";
  if (haystack === "品牌型号" || /请点此查询|查询选择车辆品牌/.test(haystack)) return "";
  const aliases = [
    { key: "certificateNo", labels: ["整车出厂合格证编号", "整车合格证编号", "合格证编号", "合格证号", "凭证编号"] },
    { key: "vin", labels: ["车辆识别代号", "识别代号"] },
    { key: "model", labels: ["车辆型号"] },
    { key: "plateKind", labels: ["号牌种类", "号牌类型", "车辆类型", "车辆种类"] },
    { key: "brand", labels: ["中文品牌", "车辆品牌"] },
    { key: "model", labels: ["型号"] },
    { key: "brand", labels: ["品牌"] }
  ];
  for (const alias of aliases) {
    if (alias.labels.some((label) => haystack.includes(label))) return alias.key;
  }
  const hint = String(nameHint || "");
  if (/clsbdh|^vin$/i.test(hint)) return "vin";
  if (/hgzbh|zchgzbh|^hgz$/i.test(hint)) return "certificateNo";
  return "";
}

function rawVehicleValue(value) {
  return String(value || "").replace(/[\s\-－–—]+/g, "");
}

function groupedVehicleValue(value) {
  return rawVehicleValue(value).match(/.{1,4}/g)?.join("-") || "";
}

test("groups long values with display hyphens that copy and fill never include", () => {
  assert.equal(groupedVehicleValue("AB12CD34EF5"), "AB12-CD34-EF5");
  assert.equal(groupedVehicleValue("LSGKB52H1HV024751"), "LSGK-B52H-1HV0-2475-1");
  assert.equal(groupedVehicleValue("WAE2-X217-0024-081"), "WAE2-X217-0024-081");
  assert.equal(rawVehicleValue("AB12-CD34-EF5"), "AB12CD34EF5");
  assert.equal(rawVehicleValue("WAE2 X217 0024 081"), "WAE2X2170024081");
  assert.match(contentSource, /clipboardData\.setData\("text\/plain", selected\)/);
  assert.match(contentSource, /rawVehicleValue\(state\.vehicleDraft\[key\]\)/);
  assert.match(contentSource, /groupedVehicleValue/);
  assert.match(contentSource, /groupedVehicleMarkup/);
  assert.match(contentSource, /group-rule::before\{content:"-"/);
  assert.match(contentSource, /user-select:none/);
  assert.doesNotMatch(contentSource, /\\u2003/);
  assert.doesNotMatch(contentSource, /word-spacing:16px/);
});

test("maps confirmation labels without touching owner or identity fields", () => {
  assert.equal(matchVehicleFieldLabel("车辆识别代号", ""), "vin");
  assert.equal(matchVehicleFieldLabel("合格证编号", ""), "certificateNo");
  assert.equal(matchVehicleFieldLabel("中文品牌", ""), "brand");
  assert.equal(matchVehicleFieldLabel("车辆型号", ""), "model");
  assert.equal(matchVehicleFieldLabel("号牌种类", ""), "plateKind");
  assert.equal(matchVehicleFieldLabel("品牌型号", ""), "");
  assert.equal(matchVehicleFieldLabel("请点此查询选择车辆品牌型号", ""), "");
  assert.equal(matchVehicleFieldLabel("所有人", "syr"), "");
  assert.equal(matchVehicleFieldLabel("身份证号", "sfzmhm"), "");
  assert.equal(matchVehicleFieldLabel("", "clsbdh"), "vin");
});

test("vehicle archives stay local and never enter public observations", () => {
  assert.match(contentSource, /platego_vehicle_records/);
  assert.match(contentSource, /一键填入确认页/);
  assert.match(contentSource, /不会上传/);
  const observationBlock = contentSource.slice(
    contentSource.indexOf("function createObservation"),
    contentSource.indexOf("async function uploadObservation")
  );
  assert.doesNotMatch(observationBlock, /vin|certificateNo|platego_vehicle_records/);
  assert.match(contentSource, /PLATEGO_OCR_CERTIFICATE/);
  assert.match(contentSource, /data-dropzone/);
  assert.match(contentSource, /groupedVehicleMarkup/);
  assert.match(contentSource, /rawVehicleValue/);
  assert.match(contentSource, /key === "model"/);
  assert.match(contentSource, /isEditingDraft/);
  assert.match(contentSource, /syncDraftFieldChrome/);
  assert.match(contentSource, /if \(!isEditingDraft\(\)\) state\.vehicleDraft/);
  assert.match(contentSource, /background:#eaf4e7/);
  assert.match(contentSource, /showVehicleArchive \? vehicleArchiveMarkup/);
  assert.doesNotMatch(contentSource, /填入此栏/);
  assert.match(contentSource, /fill-search-both/);
  assert.match(contentSource, /function fillSearchFields/);
  assert.match(contentSource, /data-action="check-vehicle"/);
  assert.match(contentSource, /official-unverified/);
  assert.match(contentSource, /请先识别或填写车辆档案/);
  assert.doesNotMatch(contentSource, /保存到本机/);
  assert.doesNotMatch(contentSource, /上海官方域名已识别/);
  assert.doesNotMatch(contentSource, /data-ocr-key/);
  assert.doesNotMatch(contentSource, /OCR 密钥/);
  assert.match(backgroundSource, /PLATEGO_OCR_CERTIFICATE/);
  assert.match(backgroundSource, /https:\/\/api\.ocr\.space\/parse\/image/);
  assert.doesNotMatch(backgroundSource, /LanguageModel/);
  assert.doesNotMatch(contentSource, /https:\/\/api\.ocr\.space/);
});
