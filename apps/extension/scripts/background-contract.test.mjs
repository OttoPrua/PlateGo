import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
        async set(items) { Object.assign(storage, items); },
        async get(keys) {
          if (typeof keys === "string") return { [keys]: storage[keys] };
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map((key) => [key, storage[key]]));
          }
          return { ...storage };
        }
      }
    }
  };
  const fetch = async (url, options) => {
    fetchCalls.push({ url, options });
    if (String(url).includes("ocr.space")) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            OCRExitCode: 1,
            IsErroredOnProcessing: false,
            ParsedResults: [{
              ParsedText: [
                "车辆名称：纯电动轿车",
                "车辆品牌：示例牌",
                "车辆型号：ABC12D3",
                "合格证编号：WMI12345678",
                "车辆识别代号：LSVA1234567890123",
                "制造企业：某某汽车股份有限公司"
              ].join("\n")
            }]
          };
        }
      };
    }
    return {
      ok: true,
      status: 201,
      async json() { return { accepted: true, deduplicated: false }; }
    };
  };
  const sandbox = {
    chrome,
    fetch,
    FormData,
    Blob,
    URL,
    Date,
    Set,
    Object,
    Array,
    String,
    Number,
    JSON,
    Error,
    RegExp,
    console
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.importScripts = (...names) => {
    for (const name of names) {
      vm.runInNewContext(readFileSync(resolve(extensionRoot, "public", name), "utf8"), sandbox);
    }
  };
  vm.runInNewContext(backgroundSource, sandbox);
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

  const simulationHarness = createHarness();
  const simulationResponse = await simulationHarness.dispatch({
    type: "PLATEGO_UPLOAD_PUBLIC_OBSERVATION",
    apiBase: "http://127.0.0.1:8789",
    observation: observation()
  }, "https://sh.122.gov.cn/veh1/netxh/main?gnid=1001");
  assert.equal(simulationResponse.ok, false);
  assert.equal(simulationHarness.fetchCalls.length, 0);

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

test("certificate OCR posts only to OCR.space and never to port 8789", async () => {
  const harness = createHarness();
  const response = await harness.dispatch({
    type: "PLATEGO_OCR_CERTIFICATE",
    imageDataUrl: "data:image/jpeg;base64,aaaa"
  });
  assert.equal(response.ok, true);
  assert.equal(harness.fetchCalls.length, 1);
  assert.equal(harness.fetchCalls[0].url, "https://api.ocr.space/parse/image");
  assert.equal(String(harness.fetchCalls[0].url).includes("8789"), false);
  assert.equal(harness.fetchCalls[0].options.body.get("language"), "chs");
  assert.notEqual(harness.fetchCalls[0].options.body.get("language"), "eng");
  assert.notEqual(harness.fetchCalls[0].options.body.get("language"), "auto");
  assert.equal(harness.fetchCalls[0].options.body.get("OCREngine"), "2");
  assert.equal(harness.fetchCalls[0].options.body.get("isOverlayRequired"), "true");
  assert.equal(response.fields.plateKind, "小型新能源汽车");
  assert.equal(response.fields.brand, "示例牌");
  assert.equal(response.fields.model, "ABC12D3");
  assert.equal(response.fields.certificateNo, "WMI12345678");
  assert.equal(response.fields.vin, "LSVA1234567890123");
  assert.equal(response.provider, "ocr.space");
});

test("certificate OCR is allowed from official simulation and rejected elsewhere", async () => {
  const officialHarness = createHarness();
  const officialResponse = await officialHarness.dispatch({
    type: "PLATEGO_OCR_CERTIFICATE",
    imageDataUrl: "data:image/jpeg;base64,aaaa"
  }, "https://sh.122.gov.cn/veh1/netxh/main?gnid=1001");
  assert.equal(officialResponse.ok, true);
  assert.equal(officialHarness.fetchCalls[0].url, "https://api.ocr.space/parse/image");

  const blockedHarness = createHarness();
  const blockedResponse = await blockedHarness.dispatch({
    type: "PLATEGO_OCR_CERTIFICATE",
    imageDataUrl: "data:image/jpeg;base64,aaaa"
  }, "https://example.com/");
  assert.equal(blockedResponse.ok, false);
  assert.equal(blockedHarness.fetchCalls.length, 0);
});

test("certificate OCR accepts traditional Chinese and rejects other language codes", async () => {
  const traditionalHarness = createHarness();
  const traditionalResponse = await traditionalHarness.dispatch({
    type: "PLATEGO_OCR_CERTIFICATE",
    imageDataUrl: "data:image/jpeg;base64,aaaa",
    language: "cht"
  });
  assert.equal(traditionalResponse.ok, true);
  assert.equal(traditionalHarness.fetchCalls[0].options.body.get("language"), "cht");

  const fallbackHarness = createHarness();
  const fallbackResponse = await fallbackHarness.dispatch({
    type: "PLATEGO_OCR_CERTIFICATE",
    imageDataUrl: "data:image/jpeg;base64,aaaa",
    language: "eng"
  });
  assert.equal(fallbackResponse.ok, true);
  assert.equal(fallbackHarness.fetchCalls[0].options.body.get("language"), "chs");
});
