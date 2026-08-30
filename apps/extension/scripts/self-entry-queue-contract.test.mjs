import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentSource = await readFile(resolve(extensionRoot, "public/content.js"), "utf8");

function normalize(value, prefix, expectedLength) {
  const token = String(value || "").toUpperCase().replace(/[·.\-\s]/g, "");
  let suffix = token;
  if (token.startsWith(prefix)) suffix = token.slice(prefix.length);
  else if (token.startsWith("沪")) return "";
  else if (prefix.length > 1 && token.startsWith(prefix.slice(1))) suffix = token.slice(prefix.length - 1);
  if (suffix.length !== expectedLength || !/^[A-HJ-NP-Z0-9]+$/.test(suffix)) return "";
  return `${prefix}${suffix}`;
}

function combine(manual, filtered, consumed, prefix = "沪", expectedLength = 6, selected = []) {
  const clean = (values) => values.map((value) => normalize(value, prefix, expectedLength)).filter(Boolean);
  const consumedSet = new Set(clean(consumed));
  const selectedValues = clean(selected);
  const source = selectedValues.length
    ? [...selectedValues, ...clean(manual)]
    : [...clean(manual), ...clean(filtered)];
  return [...new Set(source)].filter((value) => !consumedSet.has(value));
}

function matches(value, slots, mode = "fixed", prefix = "沪") {
  const suffix = value.slice(prefix.length);
  if (mode === "ordered") {
    const first = slots.findIndex(Boolean);
    if (first < 0) return false;
    let last = slots.length - 1;
    while (last > first && !slots[last]) last -= 1;
    const template = slots.slice(first, last + 1);
    if (template.length > suffix.length) return false;
    for (let offset = 0; offset <= suffix.length - template.length; offset += 1) {
      if (template.every((token, index) => !token || suffix[offset + index] === token)) return true;
    }
    return false;
  }
  if (suffix.length > slots.length) slots = [...Array(suffix.length - slots.length).fill(""), ...slots];
  if (suffix.length < slots.length) {
    const removed = slots.slice(0, slots.length - suffix.length);
    if (removed.some(Boolean)) return false;
    slots = slots.slice(slots.length - suffix.length);
  }
  return slots.every((token, index) => !token || suffix[index] === token);
}

function reorder(values, dragged, target, placeAfter = false) {
  const next = [...values];
  const from = next.indexOf(dragged);
  if (from < 0 || !next.includes(target) || dragged === target) return next;
  next.splice(from, 1);
  const to = next.indexOf(target);
  next.splice(to + (placeAfter ? 1 : 0), 0, dragged);
  return next;
}

function groupsOfFive(values) {
  return Array.from({ length: Math.ceil(values.length / 5) }, (_, index) => values.slice(index * 5, index * 5 + 5));
}

test("manual self-selection numbers lead, filtered candidates follow, and batches cap at five", () => {
  const combined = combine(
    ["A10001", "沪A10002", "A10001"],
    ["沪A10002", "沪A10003", "沪A10004", "沪A10005", "沪A10006", "沪A10007"],
    ["沪A10004"]
  );
  assert.deepEqual(combined, ["沪A10001", "沪A10002", "沪A10003", "沪A10005", "沪A10006", "沪A10007"]);
  assert.deepEqual(combined.slice(0, 5), ["沪A10001", "沪A10002", "沪A10003", "沪A10005", "沪A10006"]);
});

test("manual parser rejects wrong length and I/O while accepting full plates or suffixes", () => {
  assert.equal(normalize("沪AB2C23", "沪", 6), "沪AB2C23");
  assert.equal(normalize("ab2c23", "沪", 6), "沪AB2C23");
  assert.equal(normalize("A1234", "沪", 6), "");
  assert.equal(normalize("AI2C23", "沪", 6), "");
  assert.equal(normalize("沪BA12345", "沪A", 5), "");
});

test("selected rule results become the only automatic source while manual additions remain available", () => {
  assert.deepEqual(combine(
    ["A10009"],
    ["A10001", "A10002", "A10003"],
    [],
    "沪",
    6,
    ["A10003", "A10001"]
  ), ["沪A10003", "沪A10001", "沪A10009"]);
});

test("submitted unavailable numbers stay excluded when manual and filtered sources add them again", () => {
  assert.deepEqual(combine(
    ["A10001", "A10003"],
    ["A10001", "A10002", "A10003"],
    ["沪A10001", "沪A10003"]
  ), ["沪A10002"]);
});

test("fixed rules bind each position and ordered rules use a movable contiguous template", () => {
  const slots = ["", "", "0", "", "8", "9", "4"];
  assert.equal(matches("沪AA0A894", slots), true);
  assert.equal(matches("沪AB0D894", slots), true);
  assert.equal(matches("沪A0A894A", slots), false);
  assert.equal(matches("沪A0A894A", slots, "ordered"), true);
  assert.equal(matches("沪A089A4A", slots, "ordered"), false);
  assert.equal(matches("沪A094A8A", slots, "ordered"), false);
  assert.equal(matches("沪AAQ1031", ["", "", "1", "0", "3", "1"]), true);
  assert.equal(matches("沪AAQ1032", ["", "", "1", "0", "3", "1"]), false);

  const contiguous = ["", "1", "0", "3", "1", "", ""];
  assert.equal(matches("沪AA1031B", contiguous, "ordered"), true);
  assert.equal(matches("沪AA10A31", contiguous, "ordered"), false);

  const oneWildcard = ["", "1", "0", "", "3", "1", ""];
  assert.equal(matches("沪AA10231", oneWildcard, "ordered"), true);
  assert.equal(matches("沪AA10A31", oneWildcard, "ordered"), true);
  assert.equal(matches("沪AA1031B", oneWildcard, "ordered"), false);
});

test("selected numbers can be reordered and remain grouped in official five-number rounds", () => {
  const values = ["沪A10001", "沪A10002", "沪A10003", "沪A10004", "沪A10005", "沪A10006", "沪A10007"];
  const ordered = reorder(values, "沪A10006", "沪A10002");
  assert.deepEqual(ordered, ["沪A10001", "沪A10006", "沪A10002", "沪A10003", "沪A10004", "沪A10005", "沪A10007"]);
  assert.deepEqual(groupsOfFive(ordered), [ordered.slice(0, 5), ordered.slice(5)]);
});

test("content script persists the local queue and exposes only non-submit batch controls", () => {
  assert.match(contentSource, /platego_self_entry_queue/);
  assert.match(contentSource, /manual-self-pool/);
  assert.match(contentSource, /save-self-pool/);
  assert.match(contentSource, /fill-self-batch/);
  assert.match(contentSource, /maybeAdvanceSubmittedSelfBatch/);
  assert.match(contentSource, /readSelfComposeRemaining/);
  assert.match(contentSource, /restore-self-batch/);
  assert.match(contentSource, /lastConsumedValues/);
  assert.match(contentSource, /reset-self-batch/);
  assert.match(contentSource, /platego_position_patterns/);
  assert.match(contentSource, /platego_self_rule_selection/);
  assert.match(contentSource, /position-pattern-slot/);
  assert.match(contentSource, /role="switch"/);
  assert.match(contentSource, /aria-checked/);
  assert.match(contentSource, /toggle-rule-result/);
  assert.match(contentSource, /select-rule-top-five/);
  assert.match(contentSource, /queueMicrotask/);
  assert.match(contentSource, /slotIndex \+ 1/);
  assert.match(contentSource, /event\.key !== "Backspace"/);
  assert.match(contentSource, /data-selected-drag/);
  assert.match(contentSource, /reorderSelectedValues/);
  assert.match(contentSource, /已选填入顺序/);
  assert.match(contentSource, /index \+= 5/);
  assert.match(contentSource, /assistantScrollTop/);
  assert.match(contentSource, /ruleResultsScrollTop/);
  assert.match(contentSource, /classList\.contains\("shell"\)/);
  assert.match(contentSource, /classList\.contains\("rule-results"\)/);
  assert.match(contentSource, /positionPatternMatches/);
  assert.match(contentSource, /const template = slots\.slice\(first, last \+ 1\)/);
  assert.match(contentSource, /suffix\[offset \+ index\]/);
  assert.match(contentSource, /token \|\| "□"/);
  assert.match(contentSource, /selfEntryQueueMatchesPage/);
  assert.match(contentSource, /selfEntryConsumedValues/);
  assert.match(contentSource, /selfRuleResultMarkup/);
  assert.match(contentSource, /rule-result\.unavailable/);
  assert.match(contentSource, /已在上一轮提交且未选中，不会再次加入/);
  assert.match(contentSource, /if \(selfEntryConsumedValues\(page\)\.has\(normalized\)\) return/);
  assert.match(contentSource, /preserveProgress \? state\.selfEntryQueue\.consumedValues : \[\]/);
  assert.match(contentSource, /refreshSelfRuleMatches/);
  assert.match(contentSource, /data-self-rule-match-count/);
  assert.match(contentSource, /correctedFromPlateType/);
  assert.match(contentSource, /migrateCorrectedPoolPatterns/);
  assert.match(contentSource, /declaredLength >= 6/);
  assert.match(contentSource, /enabledRandom/);
  assert.match(contentSource, /enabledSelf/);
  assert.match(contentSource, /toggle-position-pattern-enabled/);
  assert.match(contentSource, /example-520/);
  assert.match(contentSource, /example-2233/);
  assert.match(contentSource, /example-114514/);
  assert.match(contentSource, /rule-slots \$\{fixed \? "fixed" : "ordered"\}/);
  assert.match(contentSource, /platego_pool_snapshots_v1/);
  assert.match(contentSource, /currentSelfEntryBatch/);
  assert.match(contentSource, /slice\(0, selfEntryBatchSize\(page\)\)/);
  assert.match(contentSource, /fillOfficialSelfEntryBatch/);
  assert.match(contentSource, /officialIntentSlotSuffixes/);
  assert.match(contentSource, /插件不会点击验证、确认选号或提交/);
  assert.doesNotMatch(contentSource, /data-action="submit-self-batch"/);
  assert.doesNotMatch(contentSource, /data-action="advance-self-batch"/);
});
