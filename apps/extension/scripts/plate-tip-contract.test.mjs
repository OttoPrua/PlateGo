import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentSource = await readFile(resolve(extensionRoot, "public/content.js"), "utf8");
const cssSource = await readFile(resolve(extensionRoot, "public/content.css"), "utf8");

function plateBody(value) {
  return String(value || "").toUpperCase().replace(/^沪[A-Z]/, "").replace(/[·.\s]/g, "");
}

function plateDigits(value) {
  return plateBody(value).replace(/\D/g, "");
}

function matchingDigitCounts(value, minimum, wanted = []) {
  const counts = new Map();
  for (const digit of plateDigits(value)) counts.set(digit, (counts.get(digit) || 0) + 1);
  return [...counts.entries()].filter(([digit, count]) => count >= minimum && (!wanted.length || wanted.includes(digit)));
}

function hasRepeatedDigit(value, minimum, wanted = []) {
  return matchingDigitCounts(value, minimum, wanted).length > 0;
}

function hasPairLike(value, wanted = []) {
  return hasRepeatedDigit(value, 2, wanted);
}

function hasStrongPairLike(value, wanted = []) {
  const body = plateBody(value);
  const allowed = (digit) => !wanted.length || wanted.includes(digit);
  const hasTriple = [...body.matchAll(/(\d)\1{2,}/g)].some((match) => allowed(match[1]));
  const hasDoublePair = [...body.matchAll(/(\d)\1(\d)\2/g)]
    .some((match) => match[1] !== match[2] && (allowed(match[1]) || allowed(match[2])));
  return hasPairLike(value, wanted) && (hasTriple || hasDoublePair);
}

function isConsecutiveDigits(value) {
  const digits = String(value || "");
  if (digits.length < 3 || digits.includes("0")) return false;
  const numbers = digits.split("").map(Number);
  const step = numbers[1] - numbers[0];
  return (step === 1 || step === -1)
    && numbers.slice(1).every((number, index) => number - numbers[index] === step);
}

function hasSequence(value, targets = []) {
  const digits = plateDigits(value);
  if (targets.length) return targets.some((target) => digits.includes(target));
  for (let index = 0; index <= digits.length - 3; index += 1) {
    if (isConsecutiveDigits(digits.slice(index, index + 3))) return true;
  }
  return false;
}

function hasConsecutiveRun(value, minimum) {
  const digits = plateDigits(value);
  for (let index = 0; index <= digits.length - minimum; index += 1) {
    if (isConsecutiveDigits(digits.slice(index, index + minimum))) return true;
  }
  return false;
}

function hasLoopSequence(value) {
  const digits = plateDigits(value);
  for (let length = 4; length <= digits.length; length += 1) {
    for (let index = 0; index <= digits.length - length; index += 1) {
      const candidate = digits.slice(index, index + length);
      if (new Set(candidate).size > 1 && candidate === [...candidate].reverse().join("")) return true;
    }
  }
  return false;
}

function hasStrongSequence(value, targets = []) {
  const digits = plateDigits(value);
  const hasStrongTarget = targets.some((target) => target.length >= 4 && digits.includes(target));
  return hasStrongTarget || (!targets.length && hasConsecutiveRun(value, 4)) || hasLoopSequence(value);
}

function hasManySameDigit(value, wanted = []) {
  return hasRepeatedDigit(value, 3, wanted);
}

function hasStrongManySameDigit(value, wanted = []) {
  const matches = matchingDigitCounts(value, 3, wanted);
  return matches.some(([, count]) => count >= 4) || matches.length >= 2;
}

test("classifies 相同数字, 顺序号 and 好多数 without scoring in the assistant", () => {
  assert.equal(hasPairLike("沪A88888"), true);
  assert.equal(hasPairLike("沪A11223"), true);
  assert.equal(hasPairLike("沪A12121"), true);
  assert.equal(hasPairLike("沪A12341"), true);
  assert.equal(hasPairLike("沪A12341", ["8"]), false);
  assert.equal(hasPairLike("沪A12341", ["1"]), true);
  assert.equal(hasPairLike("沪A13579"), false);
  assert.equal(hasStrongPairLike("沪A12341"), false);
  assert.equal(hasStrongPairLike("沪A11123"), true);
  assert.equal(hasStrongPairLike("沪A11223"), true);
  assert.equal(hasStrongPairLike("沪A12121"), false);
  assert.equal(hasSequence("沪A12345"), true);
  assert.equal(hasSequence("沪A54321"), true);
  assert.equal(hasSequence("沪A13579"), false);
  assert.equal(hasSequence("沪A12957"), false);
  assert.equal(hasSequence("沪A94012"), false);
  assert.equal(hasSequence("沪A89012"), false);
  assert.equal(hasSequence("沪A90123"), true);
  assert.equal(hasSequence("沪A12357", ["567", "876"]), false);
  assert.equal(hasSequence("沪A12357", ["123"]), true);
  assert.equal(hasStrongSequence("沪A12357"), false);
  assert.equal(hasStrongSequence("沪A12345"), true);
  assert.equal(hasStrongSequence("沪A54321"), true);
  assert.equal(hasStrongSequence("沪A12345", ["567"]), false);
  assert.equal(hasStrongSequence("沪A12345", ["1234"]), true);
  assert.equal(hasLoopSequence("沪A1221"), true);
  assert.equal(hasLoopSequence("沪A12321"), true);
  assert.equal(hasLoopSequence("沪A12341"), false);
  assert.equal(hasStrongSequence("沪A1221"), true);
  assert.equal(hasStrongSequence("沪A12321"), true);
  assert.match(contentSource, /digits\.length < 3 \|\| digits\.includes\("0"\)/);
  assert.match(contentSource, /0 不参与/);
  assert.equal(hasManySameDigit("沪A99A094"), true);
  assert.equal(hasManySameDigit("沪A999AV01"), true);
  assert.equal(hasManySameDigit("沪A99A094", ["8"]), false);
  assert.equal(hasManySameDigit("沪A99A094", ["9"]), true);
  assert.equal(hasManySameDigit("沪A13579"), false);
  assert.equal(hasStrongManySameDigit("沪A99A094"), false);
  assert.equal(hasStrongManySameDigit("沪A9999V01"), true);
  assert.equal(hasStrongManySameDigit("沪A669969"), true);
  assert.match(contentSource, /hasPairLike/);
  assert.match(contentSource, /hasStrongPairLike/);
  assert.match(contentSource, /hasRepeatedDigit/);
  assert.match(contentSource, /hasManySameDigit/);
  assert.match(contentSource, /hasStrongManySameDigit/);
  assert.match(contentSource, /hasLoopSequence/);
  assert.match(contentSource, /classifyStrongNumberTips/);
  assert.match(contentSource, /highlightRandomNumberFrames/);
  assert.match(contentSource, /randomPositionRuleMarkup/);
  assert.match(contentSource, /tips\.push\("position"\)/);
  assert.match(contentSource, /tips\.push\("many"\)/);
  assert.match(contentSource, /data-action="pair-digits"/);
  assert.match(contentSource, /data-action="sequence-targets"/);
  assert.match(contentSource, /data-action="many-digits"/);
  assert.doesNotMatch(contentSource, /data-action="number-specifics"/);
  assert.doesNotMatch(contentSource, /data-action="remove-highlight-combo"/);
  assert.match(contentSource, /data-platego-number-tip/);
  assert.match(contentSource, /data-platego-number-tip-strong/);
  assert.match(contentSource, /codes \.code/);
  assert.match(contentSource, /function compactPlateText/);
  assert.match(contentSource, /function ensureNumberTipStyles/);
  assert.match(contentSource, /watchRandomBatchChanges/);
  assert.match(contentSource, /#btnRand/);
  assert.doesNotMatch(contentSource, /btnRand[\s\S]{0,80}\.click\s*\(/);
  assert.doesNotMatch(contentSource, /page\.mode === "random" && page\.randomNumbers\.length/);
  assert.equal("沪A21896", String("沪 A21896").toUpperCase().replace(/[·.\s]/g, ""));
  assert.doesNotMatch(contentSource, /只读评分/);
  assert.match(cssSource, /data-platego-number-tip~="pair"/);
  assert.match(cssSource, /data-platego-number-tip~="sequence"/);
  assert.match(cssSource, /data-platego-number-tip~="many"/);
  assert.match(cssSource, /data-platego-number-tip~="position"/);
  assert.match(cssSource, /data-platego-number-tip-strong~="pair"/);
  assert.match(cssSource, /data-platego-number-tip-strong~="sequence"/);
  assert.match(cssSource, /data-platego-number-tip-strong~="many"/);
  assert.match(cssSource, /data-platego-number-tip-strong~="position"/);
});
