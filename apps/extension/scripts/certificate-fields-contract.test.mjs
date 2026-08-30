import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { self: {}, globalThis: {} };
sandbox.self = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(resolve(extensionRoot, "public/certificate-fields.js"), "utf8"), sandbox);

test("maps printed certificate text without treating the manufacturer as the brand", () => {
  const fields = sandbox.PlateGoCertificate.refineCertificateFields({
    rawText: [
      "车辆名称：纯电动轿车",
      "车辆品牌：示例牌",
      "车辆型号：ABC12D3",
      "合格证编号：WMI12345678",
      "车辆识别代号：LSVA1234567890123",
      "制造企业：某某汽车股份有限公司"
    ].join("\n")
  });
  assert.equal(fields.plateKind, "小型新能源汽车");
  assert.equal(fields.brand, "示例牌");
  assert.equal(fields.model, "ABC12D3");
  assert.equal(fields.certificateNo, "WMI12345678");
  assert.equal(fields.vin, "LSVA1234567890123");
});

test("maps gasoline passenger cars to the small blue plate kind", () => {
  const fields = sandbox.PlateGoCertificate.refineCertificateFields({
    rawText: "车辆名称：轿车\n燃料种类：汽油\n车辆品牌：演示牌\n车辆型号：DEMO12"
  });
  assert.equal(fields.plateKind, "小型汽车");
  assert.equal(fields.brand, "演示牌");
  assert.equal(fields.model, "DEMO12");
});

test("flags certificate fields that break length or character rules", () => {
  const issue = sandbox.PlateGoCertificate.vehicleFieldIssue;
  assert.equal(issue("vin", "LSVA1234567890123"), "");
  assert.equal(issue("vin", "LSVA123456789012"), "应为 17 位");
  assert.equal(issue("vin", "LSVA123456789O123"), "不应包含 I/O/Q");
  assert.equal(issue("certificateNo", "WMI12345678"), "");
  assert.equal(issue("certificateNo", "ABC12"), "编号位数不符");
  assert.equal(issue("model", "ABC12D3"), "");
  assert.equal(issue("model", "ABCD"), "型号位数不符");
  assert.equal(issue("plateKind", "小型汽车"), "");
  assert.equal(issue("plateKind", "轿车"), "请检查号牌种类");
  assert.equal(issue("vin", "", { required: true }), "未读出，请检查");
});

test("flags likely OCR number-letter swaps in certificate numbers and models", () => {
  const issue = sandbox.PlateGoCertificate.vehicleFieldIssue;
  assert.match(issue("certificateNo", "WAE2X217OO24081"), /00/);
  assert.match(issue("certificateNo", "WAE2X2170O24081"), /是否为 0/);
  assert.match(issue("model", "SGM7I52LAAA"), /是否为 1/);
  assert.match(issue("model", "AB12B34C"), /8/);
  assert.match(issue("certificateNo", "WMI1234II5678"), /11/);
  assert.match(issue("certificateNo", "WMI123D56789"), /0/);
  assert.equal(issue("certificateNo", "WMI12345678"), "");
  assert.equal(issue("model", "SGM7152LAAA"), "");
  assert.equal(issue("model", "ABC12D3"), "");
});

test("reads split two-column certificate dumps and recovers an 18-character VIN token", () => {
  const fields = sandbox.PlateGoCertificate.refineCertificateFields({
    rawText: [
      "1.合格证编号",
      "3. 车辆制造企业名称",
      "4. 车辆品牌/车辆名称",
      "5. 车辆型号",
      "7. 车身颜色",
      "12. 燃料种类",
      "WMI12345678",
      "某某汽车股份有限公司",
      "示例牌/DEMO",
      "ABC12D3",
      "白",
      "汽油",
      "轿车",
      "6.车辆识别代号/车架号 LSVA12345INV00001X"
    ].join("\n")
  });
  assert.equal(fields.plateKind, "小型汽车");
  assert.equal(fields.brand, "示例牌");
  assert.equal(fields.model, "ABC12D3");
  assert.equal(fields.certificateNo, "WMI12345678");
  assert.equal(fields.vin, "LSVA12345HV00001X");
});

test("locates certificate field boxes from OCR overlay words", () => {
  const fields = sandbox.PlateGoCertificate.refineCertificateFields({
    rawText: "车辆品牌：示例牌\n车辆型号：ABC12D3\n合格证编号：WMI12345678\n车辆识别代号：LSVA1234567890123"
  });
  const regions = sandbox.PlateGoCertificate.locateCertificateRegions({
    Lines: [
      { Words: [{ WordText: "车辆品牌", Left: 10, Top: 20, Width: 80, Height: 16 }, { WordText: "示例牌", Left: 100, Top: 20, Width: 48, Height: 16 }] },
      { Words: [{ WordText: "车辆识别代号", Left: 10, Top: 80, Width: 96, Height: 16 }, { WordText: "LSVA1234567890123", Left: 120, Top: 80, Width: 160, Height: 16 }] }
    ]
  }, fields);
  assert.ok(regions.brand);
  assert.ok(regions.vin);
  assert.ok(regions.vin.width > 40);
});
