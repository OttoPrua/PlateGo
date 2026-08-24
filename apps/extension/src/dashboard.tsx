import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NullAdProvider, PlateGoApp } from "@platego/client-app";
import "@platego/client-app/styles.css";

const CONFIG_LOCAL_KEY = "platego:config:v1";
const API_LOCAL_KEY = "platego:api-base:v1";

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
    const stored = await chromeStorageGet(["platego_config", "platego_api_base"]);
    const config = stored.platego_config;
    if (config && typeof config === "object" && (config as { schemaVersion?: number }).schemaVersion === 1) {
      localStorage.setItem(CONFIG_LOCAL_KEY, JSON.stringify(config));
    }
    if (typeof stored.platego_api_base === "string") {
      localStorage.setItem(API_LOCAL_KEY, stored.platego_api_base);
    }
  } catch {
    // The bundled fixed pool still makes the workbench usable if storage hydration fails.
  }
}

function watchExternalStorageChanges() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    let shouldReload = false;
    if (changes.platego_config?.newValue) {
      const serialized = JSON.stringify(changes.platego_config.newValue);
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
