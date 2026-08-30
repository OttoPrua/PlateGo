(() => {
  "use strict";

  const SUPPORTED_FRAME_PATHS = new Set([
    "/veh1/netxh/zbxhTest",
    "/veh1/netxh/zbxh"
  ]);
  if (window.top === window
    || !SUPPORTED_FRAME_PATHS.has(window.location.pathname)
    || window.__PLATEGO_OFFICIAL_RULE_BRIDGE_V1__) return;
  window.__PLATEGO_OFFICIAL_RULE_BRIDGE_V1__ = true;

  const ORIGIN = window.location.origin;
  const REQUEST_SOURCE = "platego-rule-snapshot-request";
  const RESPONSE_SOURCE = "platego-rule-snapshot";
  const MAX_HD_TEMPLATES = 64;
  const MAX_FILTERS = 128;

  function sanitizeHdTemplate(value) {
    const template = String(value || "").toUpperCase().trim();
    return /^[A-HJ-NP-Z0-9!@#*]{1,12}$/.test(template) ? template : "";
  }

  function sanitizeHdArr(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.slice(0, MAX_HD_TEMPLATES).map(sanitizeHdTemplate).filter(Boolean))];
  }

  function regexDescriptor(value) {
    if (value instanceof RegExp) {
      const source = String(value.source || "").slice(0, 1000);
      const flags = String(value.flags || "").replace(/[^gimsuy]/g, "").slice(0, 6);
      return source ? { source, flags } : null;
    }
    if (typeof value === "string") {
      const source = value.slice(0, 1000);
      return source ? { source, flags: "" } : null;
    }
    return null;
  }

  function snapshotFromOptions(options, source) {
    if (!options || typeof options !== "object") return null;
    const hdArr = sanitizeHdArr(options.hdArr);
    if (!hdArr.length) return null;
    const rawFilterInput = Array.isArray(options.hphmRegex)
      ? options.hphmRegex
      : (options.hphmRegex instanceof RegExp || typeof options.hphmRegex === "string"
        ? [options.hphmRegex]
        : null);
    const rawFilters = rawFilterInput?.slice(0, MAX_FILTERS) || null;
    const hphmRegexes = rawFilters ? rawFilters.map(regexDescriptor).filter(Boolean) : [];
    const hphmRegexCount = rawFilterInput ? rawFilterInput.length : -1;
    return {
      hdArr,
      hphmRegexes,
      hphmRegexCount,
      filterComplete: Boolean(rawFilters && hphmRegexCount <= MAX_FILTERS && hphmRegexes.length === hphmRegexCount),
      hphmLength: Number(options.hphmLength || hdArr[0].length || 0),
      plateType: String(options.hpzl || options.plateType || "").slice(0, 32),
      source: String(source || "amd-cache").slice(0, 32)
    };
  }

  function definedModuleEntries() {
    const entries = [];
    const loaders = [window.requirejs, window.require].filter((item, index, all) => (
      typeof item === "function" && all.indexOf(item) === index
    ));
    for (const loader of loaders) {
      const contexts = loader?.s?.contexts;
      if (!contexts || typeof contexts !== "object") continue;
      for (const context of Object.values(contexts)) {
        const defined = context?.defined;
        if (!defined || typeof defined !== "object") continue;
        for (const [name, moduleValue] of Object.entries(defined)) {
          if (!/(?:^|\/)zbxh(?:faker|comm)$/.test(name)) continue;
          entries.push([name, moduleValue]);
        }
      }
    }
    return entries;
  }

  function snapshotFromSimulationFields() {
    if (window.location.pathname !== "/veh1/netxh/zbxhTest") return null;
    const issuingPrefix = String(document.querySelector("#fzjg")?.value || "").trim().toUpperCase();
    const rawFilterValue = String(document.querySelector("#hphmRegex")?.value || "").trim();
    if (issuingPrefix.length < 2 || !rawFilterValue) return null;
    const stem = issuingPrefix.slice(1);
    const hdArr = sanitizeHdArr([`${stem}A!@!!`, `${stem}B!@!!`]);
    const rawFilterInput = rawFilterValue.split(";").map((item) => item.trim()).filter(Boolean);
    const rawFilters = rawFilterInput.slice(0, MAX_FILTERS);
    const hphmRegexes = rawFilters.map(regexDescriptor).filter(Boolean);
    if (!hdArr.length || !hphmRegexes.length) return null;
    return {
      hdArr,
      hphmRegexes,
      hphmRegexCount: rawFilterInput.length,
      filterComplete: rawFilterInput.length <= MAX_FILTERS && hphmRegexes.length === rawFilterInput.length,
      hphmLength: hdArr[0].length,
      plateType: String(document.querySelector("#hpzl")?.value || "").slice(0, 32),
      source: "dom:simulation-config"
    };
  }

  function readSnapshot() {
    const snapshots = [];
    for (const [name, moduleValue] of definedModuleEntries()) {
      const direct = snapshotFromOptions(moduleValue?.options, `amd:${name.split("/").pop()}`);
      if (direct) snapshots.push(direct);
      const nested = snapshotFromOptions(moduleValue?.zbxh?.options, `amd-nested:${name.split("/").pop()}`);
      if (nested) snapshots.push(nested);
    }
    const knownGlobal = snapshotFromOptions(window.zbxh?.options, "global:zbxh");
    if (knownGlobal) snapshots.push(knownGlobal);
    const simulationFields = snapshotFromSimulationFields();
    if (simulationFields) snapshots.push(simulationFields);
    snapshots.sort((left, right) => (
      Number(right.filterComplete) - Number(left.filterComplete)
      || right.hphmRegexCount - left.hphmRegexCount
      || right.hdArr.length - left.hdArr.length
    ));
    return snapshots[0] || null;
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== ORIGIN) return;
    const data = event.data;
    if (!data || data.source !== REQUEST_SOURCE || !/^pg[a-z0-9]{8,40}$/.test(String(data.nonce || ""))) return;
    const payload = readSnapshot();
    window.parent.postMessage({ source: RESPONSE_SOURCE, nonce: data.nonce, payload }, ORIGIN);
  });
})();
