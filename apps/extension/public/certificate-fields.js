"use strict";

const FIELD_LABEL_LINE = /^(?:\d+[\.、.\s]*)?(?:合格证编号|合格证号|发证日期|车辆制造企业名称|车辆品牌|车辆名称|车辆型号|车辆识别代号|车架号|车身颜色|底盘型号|底盘ID|底盘合格证编号|发动机号|发动机型号|燃料种类|排放标准|油耗|外廓尺寸|货厢内部尺寸|钢板弹簧片数|轮胎规格|轮胎数|轮距|轴距|轴荷|轴数|转向形式|总质量|整备质量|额定载质量|载质量利用系数|准牵引总质量|驾驶室准乘人数|额定载客|最高设计车速|车辆制造日期|二维条码|排量和功率|备注)/;

function compactCertificateAlnum(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function indexOfLabel(source, label) {
  const haystack = String(source || "");
  let from = 0;
  while (from < haystack.length) {
    const index = haystack.toLowerCase().indexOf(label.toLowerCase(), from);
    if (index < 0) return -1;
    const before = haystack.slice(Math.max(0, index - 2), index);
    if (label === "合格证编号" && /底盘$/.test(before)) {
      from = index + label.length;
      continue;
    }
    return index;
  }
  return -1;
}

function linesAfterLabel(text, labels) {
  const source = String(text || "");
  for (const label of labels) {
    const index = indexOfLabel(source, label);
    if (index < 0) continue;
    const restOfLine = source.slice(index + label.length).split(/\r?\n/, 1)[0] || "";
    const after = source.slice(index + label.length + restOfLine.length);
    return [restOfLine, ...after.split(/\r?\n/)].map((line) => line.trim()).filter(Boolean);
  }
  return [];
}

function firstTokenAfterLabels(text, labels, pick) {
  for (const line of linesAfterLabel(text, labels)) {
    if (FIELD_LABEL_LINE.test(line) && !/[A-Z0-9]{8,}/i.test(line)) continue;
    const direct = pick(line);
    if (direct) return direct;
    for (const token of line.split(/[\s/,，]+/)) {
      const value = pick(token);
      if (value) return value;
    }
  }
  return "";
}

function recoverVin(token) {
  const raw = compactCertificateAlnum(token);
  const candidates = [raw];
  if (raw.length === 18) {
    candidates.push(raw.replace("IN", "H"), raw.replace("II", "H"), raw.replace("I", ""), raw.replace("O", ""));
  }
  for (const item of candidates) {
    if (item.length !== 17) continue;
    const normalized = item.includes("I") || item.includes("O") || item.includes("Q")
      ? item.replace(/I/g, "1").replace(/O/g, "0").replace(/Q/g, "0")
      : item;
    if (normalized.length === 17 && /[A-HJ-NPR-Z]/.test(normalized) && /\d/.test(normalized)) {
      return normalized;
    }
  }
  return "";
}

function firstVin(value) {
  const source = String(value || "");
  const labeled = firstTokenAfterLabels(source, ["车辆识别代号", "车架号"], recoverVin);
  if (labeled) return labeled;
  const matches = source.toUpperCase().match(/[A-Z0-9]{16,18}/g) || [];
  for (const token of matches) {
    const vin = recoverVin(token);
    if (vin) return vin;
  }
  return "";
}

function labeledValue(text, labels, pattern) {
  const source = String(text || "");
  for (const label of labels) {
    const match = source.match(new RegExp(`${label}\\s*[:：#/]?\\s*(${pattern})`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function plateKindFromCertificateHints(vehicleName, fuelType, rawText) {
  const text = `${vehicleName || ""} ${fuelType || ""} ${rawText || ""}`;
  if (/混合动力|插电|燃料电池|BEV|PHEV/.test(text) && !/汽油|柴油/.test(text)) return "小型新能源汽车";
  if (/纯电动|新能源车辆|新能源汽车/.test(text)) return "小型新能源汽车";
  if (/燃料种类\s*[:：]?\s*电/.test(text) && /轿车|乘用车/.test(text)) return "小型新能源汽车";
  if (/汽油|柴油/.test(text) && /轿车|小型汽车/.test(text) && !/新能源|纯电动|插电/.test(text)) {
    return "小型汽车";
  }
  return "";
}

function mapPrintedPlateKind(value) {
  const text = String(value || "");
  if (/新能源|纯电动|插电|燃料电池/.test(text)) return "小型新能源汽车";
  if (/小型汽车|蓝牌/.test(text) && !/新能源/.test(text)) return "小型汽车";
  return "";
}

function pickCertificateBrand(rawText, suggested) {
  const suggestedBrand = String(suggested || "").trim();
  if (/牌$/.test(suggestedBrand) && !/专用|企业|公司|合格证|品牌$/.test(suggestedBrand)) {
    return suggestedBrand.slice(0, 40);
  }
  const labeled = labeledValue(rawText, ["车辆品牌", "中文品牌"], "[^\\s/，,。]{1,12}牌");
  if (labeled && !/专用|企业|公司|合格证|品牌$/.test(labeled)) return labeled.slice(0, 40);
  const brands = [...String(rawText || "").matchAll(/([\u4e00-\u9fffA-Za-z0-9]{1,10}牌)/g)]
    .map((item) => item[1])
    .filter((item) => !/专用|企业|公司|合格证|品牌$/.test(item));
  return (brands[0] || "").slice(0, 40);
}

function isCertificateNumber(value) {
  const compact = compactCertificateAlnum(value);
  return compact.length >= 10 && compact.length <= 18
    && /[A-Z]/.test(compact)
    && /\d/.test(compact)
    && compact.length !== 17;
}

function isVehicleModel(value, knownCert, knownVin) {
  const compact = String(value || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (compact.length < 5 || compact.length > 16) return "";
  if (compact === knownCert || compact === knownVin || compact.length === 17) return "";
  if (!/[A-Z]/.test(compact) || !/\d/.test(compact)) return "";
  if (/^(GB|Q31)/.test(compact)) return "";
  return compact;
}

function pickCertificateNo(rawText, suggested) {
  const labeled = firstTokenAfterLabels(rawText, ["合格证编号", "合格证号"], (token) => (
    isCertificateNumber(token) ? compactCertificateAlnum(token) : ""
  ));
  if (labeled) return labeled.slice(0, 40);
  const compactSuggested = compactCertificateAlnum(suggested);
  if (isCertificateNumber(compactSuggested)) return compactSuggested.slice(0, 40);
  return "";
}

function pickCertificateModel(rawText, suggested, knownCert, knownVin) {
  const labeled = firstTokenAfterLabels(rawText, ["车辆型号"], (token) => isVehicleModel(token, knownCert, knownVin));
  if (labeled) return labeled.slice(0, 40);
  const compactSuggested = isVehicleModel(suggested, knownCert, knownVin);
  if (compactSuggested) return compactSuggested.slice(0, 40);
  return "";
}

function pickVehicleName(rawText, suggested) {
  const suggestedName = String(suggested || "").trim();
  if (/轿车|客车|汽车|乘用车/.test(suggestedName) && !/公司|牌$/.test(suggestedName)) {
    return suggestedName.slice(0, 40);
  }
  return labeledValue(rawText, ["车辆名称"], "[^\\s/，,。]{2,20}").slice(0, 40);
}

function ocrConfusionIssue(key, compact) {
  if (key !== "certificateNo" && key !== "model") return "";
  if (/OO/.test(compact)) return "OO 很像 00，请核对";
  if (/II/.test(compact)) return "II 很像 11，请核对";
  const afterDigit = compact.slice(Math.max(0, compact.search(/\d/)));
  if (key === "certificateNo" && /O/.test(afterDigit)) return "含字母 O，请核对是否为 0";
  if (key === "certificateNo" && /I/.test(afterDigit)) return "含字母 I，请核对是否为 1";
  if (/\dO\d/.test(compact)) return "含字母 O，请核对是否为 0";
  if (/\dI\d/.test(compact)) return "含字母 I，请核对是否为 1";
  if (/\dB\d/.test(compact)) return "数字中的 B 很像 8，请核对";
  if (/\dS\d/.test(compact)) return "数字中的 S 很像 5，请核对";
  if (/\dZ\d/.test(compact)) return "数字中的 Z 很像 2，请核对";
  if (/\dG\d/.test(compact)) return "数字中的 G 很像 6，请核对";
  if (/\dQ\d/.test(compact)) return "数字中的 Q 很像 0，请核对";
  if (key === "certificateNo" && /\dD\d/.test(compact)) return "数字中的 D 很像 0，请核对";
  return "";
}

function vehicleFieldIssue(key, value, options) {
  const text = String(value || "").trim();
  const required = Boolean(options && options.required);
  if (!text) {
    if (required && (key === "vin" || key === "certificateNo" || key === "model")) return "未读出，请检查";
    return "";
  }
  if (key === "vin") {
    const compact = compactCertificateAlnum(text);
    if (compact.length !== 17) return "应为 17 位";
    if (/[IOQ]/.test(compact)) return "不应包含 I/O/Q";
    if (!/[A-Z]/.test(compact) || !/\d/.test(compact)) return "请检查识别代号";
    return "";
  }
  if (key === "certificateNo") {
    const compact = compactCertificateAlnum(text);
    if (compact.length < 10 || compact.length > 18) return "编号位数不符";
    if (!/[A-Z]/.test(compact) || !/\d/.test(compact)) return "请检查合格证编号";
    return ocrConfusionIssue(key, compact);
  }
  if (key === "model") {
    const compact = text.toUpperCase().replace(/[^A-Z0-9-]/g, "");
    if (compact.length < 5 || compact.length > 16) return "型号位数不符";
    if (!/[A-Z]/.test(compact) || !/\d/.test(compact)) return "请检查车辆型号";
    return ocrConfusionIssue(key, compact);
  }
  if (key === "brand") {
    if (text.length < 2) return "请检查品牌";
    if (/公司|企业|制造/.test(text)) return "请检查品牌";
    return "";
  }
  if (key === "plateKind") {
    if (!/小型汽车|小型新能源汽车/.test(text)) return "请检查号牌种类";
    return "";
  }
  return "";
}

const REGION_LABELS = {
  certificateNo: ["合格证编号", "合格证号"],
  vin: ["车辆识别代号", "车架号"],
  model: ["车辆型号"],
  brand: ["车辆品牌", "中文品牌"],
  plateKind: ["车辆名称", "燃料种类"]
};

function flattenOverlayWords(overlay) {
  const words = [];
  for (const line of overlay?.Lines || []) {
    for (const word of line.Words || []) {
      const text = String(word.WordText || "").trim();
      if (!text) continue;
      words.push({
        compact: text.replace(/\s+/g, ""),
        left: Number(word.Left) || 0,
        top: Number(word.Top) || 0,
        width: Number(word.Width) || 0,
        height: Number(word.Height) || 0
      });
    }
  }
  return words;
}

function boxOf(words) {
  if (!words.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const word of words) {
    left = Math.min(left, word.left);
    top = Math.min(top, word.top);
    right = Math.max(right, word.left + word.width);
    bottom = Math.max(bottom, word.top + word.height);
  }
  return {
    left: Math.max(0, left - 18),
    top: Math.max(0, top - 12),
    width: (right - left) + 36,
    height: (bottom - top) + 24
  };
}

function findSequence(words, value) {
  const needle = String(value || "").replace(/\s+/g, "").toUpperCase();
  if (needle.length < 2) return [];
  for (let start = 0; start < words.length; start += 1) {
    let joined = "";
    const taken = [];
    for (let index = start; index < words.length && joined.length < needle.length + 6; index += 1) {
      joined += String(words[index].compact || "").toUpperCase();
      taken.push(words[index]);
      if (joined.includes(needle)) return taken;
    }
  }
  return [];
}

function findAfterLabel(words, labels) {
  for (const label of labels) {
    const compactLabel = label.replace(/\s+/g, "");
    const index = words.findIndex((word, wordIndex) => {
      let joined = word.compact;
      for (let offset = 1; offset < 4 && wordIndex + offset < words.length; offset += 1) {
        if (joined.includes(compactLabel)) return true;
        joined += words[wordIndex + offset].compact;
      }
      return joined.includes(compactLabel);
    });
    if (index < 0) continue;
    const labelTop = words[index].top;
    const after = [];
    for (let cursor = index + 1; cursor < words.length && after.length < 8; cursor += 1) {
      const word = words[cursor];
      if (after.length && Math.abs(word.top - labelTop) > Math.max(28, words[index].height * 2.2)) break;
      if (after.length && FIELD_LABEL_LINE.test(word.compact)) break;
      after.push(word);
    }
    if (after.length) return after;
  }
  return [];
}

function locateCertificateRegions(overlay, fields) {
  const words = flattenOverlayWords(overlay);
  const values = fields && typeof fields === "object" ? fields : {};
  const regions = {};
  for (const [key, labels] of Object.entries(REGION_LABELS)) {
    const matched = findSequence(words, values[key]);
    const box = boxOf(matched.length ? matched : findAfterLabel(words, labels));
    if (box) regions[key] = box;
  }
  return regions;
}

function refineCertificateFields(input) {
  const source = input && typeof input === "object" ? input : {};
  const rawText = [
    source.rawText, source.vehicleName, source.fuelType, source.brand,
    source.model, source.certificateNo, source.vin, source.plateKind
  ].filter(Boolean).join("\n");
  const vehicleName = pickVehicleName(rawText, source.vehicleName);
  const certificateNo = pickCertificateNo(rawText, source.certificateNo);
  const vin = firstVin(`${source.vin || ""}\n${rawText}`);
  return {
    plateKind: plateKindFromCertificateHints(vehicleName, source.fuelType, rawText)
      || mapPrintedPlateKind(source.plateKind),
    brand: pickCertificateBrand(rawText, source.brand),
    model: pickCertificateModel(rawText, source.model, certificateNo, vin),
    certificateNo,
    vin
  };
}

const root = typeof self !== "undefined" ? self : globalThis;
root.PlateGoCertificate = {
  refineCertificateFields,
  locateCertificateRegions,
  plateKindFromCertificateHints,
  firstVin,
  vehicleFieldIssue,
  ocrConfusionIssue
};
