import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NullAdProvider, PlateGoApp } from "@platego/client-app";
import "@platego/client-app/styles.css";

const CONFIG_LOCAL_KEY = "platego:config:v1";
const API_LOCAL_KEY = "platego:api-base:v1";
const CAPTURED_LOCAL_KEY = "platego:captured-pool:v1";
const POSITION_PATTERNS_STORAGE_KEY = "platego_position_patterns";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readLocalConfig(): Record<string, unknown> | undefined {
  try {
    const raw = localStorage.getItem(CONFIG_LOCAL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function positionPatternsFromConfig(config: unknown): unknown[] {
  if (!isRecord(config) || !isRecord(config.composePrefs) || !Array.isArray(config.composePrefs.positionPatterns)) return [];
  return config.composePrefs.positionPatterns;
}

function mergePrivatePositionPatterns(config: unknown, patterns: unknown): unknown {
  if (!isRecord(config)) return config;
  const composePrefs = isRecord(config.composePrefs) ? config.composePrefs : {};
  return {
    ...config,
    composePrefs: {
      ...composePrefs,
      positionPatterns: Array.isArray(patterns) ? patterns : []
    }
  };
}

function chromeStorageGet(keys: string[]): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (items) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(items);
    });
  });
}

async function hydrateExtensionStorage() {
  try {
    const stored = await chromeStorageGet(["platego_config", POSITION_PATTERNS_STORAGE_KEY, "platego_api_base", "platego_captured_pool"]);
    const config = mergePrivatePositionPatterns(stored.platego_config, stored[POSITION_PATTERNS_STORAGE_KEY]);
    if (config && typeof config === "object" && (config as { schemaVersion?: number }).schemaVersion === 1) {
      localStorage.setItem(CONFIG_LOCAL_KEY, JSON.stringify(config));
    }
    if (typeof stored.platego_api_base === "string") {
      localStorage.setItem(API_LOCAL_KEY, stored.platego_api_base);
    }
    if (stored.platego_captured_pool && typeof stored.platego_captured_pool === "object") {
      localStorage.setItem(CAPTURED_LOCAL_KEY, JSON.stringify(stored.platego_captured_pool));
    }
  } catch {
    // The bundled fixed pool still makes the workbench usable if storage hydration fails.
  }
}

function watchExternalStorageChanges() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    let shouldReload = false;
    const sharedConfigChanged = Boolean(changes.platego_config?.newValue);
    const privatePatternsChanged = Boolean(changes[POSITION_PATTERNS_STORAGE_KEY]);
    if (sharedConfigChanged || privatePatternsChanged) {
      const currentConfig = readLocalConfig();
      const sharedConfig = sharedConfigChanged ? changes.platego_config.newValue : currentConfig;
      const privatePatterns = privatePatternsChanged
        ? changes[POSITION_PATTERNS_STORAGE_KEY]?.newValue
        : positionPatternsFromConfig(currentConfig);
      const serialized = JSON.stringify(mergePrivatePositionPatterns(sharedConfig, privatePatterns));
      if (localStorage.getItem(CONFIG_LOCAL_KEY) !== serialized) {
        localStorage.setItem(CONFIG_LOCAL_KEY, serialized);
        shouldReload = true;
      }
    }
    if (typeof changes.platego_api_base?.newValue === "string"
      && localStorage.getItem(API_LOCAL_KEY) !== changes.platego_api_base.newValue) {
      localStorage.setItem(API_LOCAL_KEY, changes.platego_api_base.newValue);
      shouldReload = true;
    }
    if (changes.platego_captured_pool) {
      if (changes.platego_captured_pool.newValue) {
        localStorage.setItem(CAPTURED_LOCAL_KEY, JSON.stringify(changes.platego_captured_pool.newValue));
      } else {
        localStorage.removeItem(CAPTURED_LOCAL_KEY);
      }
      shouldReload = true;
    }
    if (shouldReload) window.location.reload();
  });
}

async function startDashboard() {
  await hydrateExtensionStorage();
  watchExternalStorageChanges();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <NullAdProvider>
        <PlateGoApp surface="extension" officialMockUrl="http://127.0.0.1:4173/official-mock" />
      </NullAdProvider>
    </StrictMode>
  );
}

void startDashboard();
