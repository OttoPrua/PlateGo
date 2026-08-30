import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentSource = await readFile(resolve(extensionRoot, "public/content.js"), "utf8");

test("assistant landing nav appears outside selection and keeps confirm-info archive", () => {
  assert.match(contentSource, /function entryNavMarkup/);
  assert.match(contentSource, /function landingMarkup/);
  assert.match(contentSource, /const showEntryNav = !onSelectStep/);
  assert.match(contentSource, /const showLanding = !onSelectStep && !showVehicleArchive/);
  assert.match(contentSource, /12123 选号站/);
  assert.match(contentSource, /号段公示/);
  assert.match(contentSource, /https:\/\/sh\.122\.gov\.cn\/veh1\/netxh\/main\?gnid=1001/);
  assert.match(contentSource, /https:\/\/sh\.122\.gov\.cn\/m\/pub\/vehxhhdpub/);
  assert.match(contentSource, /1024/);
  assert.match(contentSource, /2048/);
  assert.match(contentSource, /data-action="toggle-compose-combo"/);
  assert.match(contentSource, /data-action="toggle-compose-segment"/);
  assert.match(contentSource, /打开号池创建候选/);
  assert.match(contentSource, /vehicleArchiveMarkup/);
  assert.match(contentSource, /function presetRuleBuilderMarkup/);
  assert.match(contentSource, /data-action="set-preset-rule-context"/);
  assert.match(contentSource, /!onSelectStep \? presetRuleBuilderMarkup/);
  assert.doesNotMatch(contentSource, /showLanding \? landingMarkup\(\)[\s\S]{0,80}onSelectStep && page\.mode === "random"/);
});
