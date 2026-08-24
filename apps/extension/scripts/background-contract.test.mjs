import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backgroundSource = await readFile(resolve(extensionRoot, "public/background.js"), "utf8");

function createHarness() {
  let messageListener;
  let installedListener;
  const fetchCalls = [];
  const storage = {};
  const chrome = {
    runtime: {
      onInstalled: { addListener(listener) { installedListener = listener; } },
      onMessage: { addListener(listener) { messageListener = listener; } }
    },
    storage: {
      local: {
        async set(items) { Object.assign(storage, items); }
      }
    }
  };
  const fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    return {
      ok: true,
      status: 201,
      async json() { return { accepted: true, deduplicated: false }; }
    };
  };
  vm.runInNewContext(backgroundSource, { chrome, fetch, URL, Date, Set, Object, Array, String, Number, JSON, Error, RegExp, console });
  assert.equal(typeof messageListener, "function");
  assert.equal(typeof installedListener, "function");

  const dispatch = (message, senderUrl = "http://127.0.0.1:4173/official-mock") => new Promise((resolveResponse) => {
    const keepAlive = messageListener(message, { tab: { url: senderUrl } }, resolveResponse);
    if (keepAlive !== true) queueMicrotask(() => resolveResponse(undefined));
  });
  return { dispatch, fetchCalls, storage };
}

function observation(overrides = {}) {
  return {
    namespace: "simulation",
    regionCode: "310000",
    plateType: "small_blue",
    prefix: "沪A",
    transitions: { "": ["A"], A: ["8"] },
    terminals: ["A8888"],
    coverage: "complete",
    observedAt: "2026-08-24T00:00:00.000Z",
    adapterVersion: "shanghai-dom-v1-local-fixture",
    source: "official-mock",
    observationHash: "deadbeef",
    ...overrides
  };
}

test("routes only confirmed local simulation observations to port 8789", async () => {
  const harness = createHarness();
  const response = await harness.dispatch({
    type: "PLATEGO_UPLOAD_PUBLIC_OBSERVATION",
    apiBase: "http://127.0.0.1:8789",
    observation: observation()
  });
  assert.equal(response.ok, true);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0].url, "http://127.0.0.1:8789/v1/pools/observations");
  assert.equal(JSON.parse(harness.fetchCalls[0].options.body).namespace, "simulation");
  assert.equal(harness.storage.platego_last_public_observation.namespace, "simulation");
});

test("rejects the occupied legacy port without making a request", async () => {
  const harness = createHarness();
  const response = await harness.dispatch({
    type: "PLATEGO_UPLOAD_PUBLIC_OBSERVATION",
    apiBase: "http://127.0.0.1:8787",
    observation: observation()
  });
  assert.equal(response.ok, false);
  assert.equal(harness.fetchCalls.length, 0);
});

test("fails closed for the real Shanghai domain and live observations", async () => {
  const officialHarness = createHarness();
  const officialResponse = await officialHarness.dispatch({
    type: "PLATEGO_UPLOAD_PUBLIC_OBSERVATION",
    apiBase: "http://127.0.0.1:8789",
    observation: observation()
  }, "https://sh.122.gov.cn/m/vehxh");
  assert.equal(officialResponse.ok, false);
  assert.equal(officialHarness.fetchCalls.length, 0);

  const liveHarness = createHarness();
  const liveResponse = await liveHarness.dispatch({
    type: "PLATEGO_UPLOAD_PUBLIC_OBSERVATION",
    apiBase: "http://127.0.0.1:8789",
    observation: observation({ namespace: "live", source: "official-page" })
  });
  assert.equal(liveResponse.ok, false);
  assert.equal(liveHarness.fetchCalls.length, 0);
});

test("rejects private fields but keeps position-only in the public enum", async () => {
  const privateHarness = createHarness();
  const privateResponse = await privateHarness.dispatch({
    type: "PLATEGO_UPLOAD_PUBLIC_OBSERVATION",
    apiBase: "http://127.0.0.1:8789",
    observation: observation({ favorites: ["沪A88888"] })
  });
  assert.equal(privateResponse.ok, false);
  assert.equal(privateHarness.fetchCalls.length, 0);

  const forwardHarness = createHarness();
  const forwardResponse = await forwardHarness.dispatch({
    type: "PLATEGO_UPLOAD_PUBLIC_OBSERVATION",
    apiBase: "http://localhost:8789",
    observation: observation({ coverage: "position-only", terminals: [] })
  });
  assert.equal(forwardResponse.ok, true);
  assert.equal(forwardHarness.fetchCalls.length, 1);
});
