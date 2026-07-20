"use strict";

import assert from "node:assert/strict";
import {
  readJSON, readText, readTextResult, removeStoredValue, writeJSON, writeText,
} from "../js/storage-adapter.js";
import { createConsentState } from "../js/analytics-consent-state.js";
import {
  STORAGE_KEYS, initializeStorage, loadOptimizerData, saveOptimizerData, scopedKey,
} from "../js/storage-core.js";

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalLocation = Object.getOwnPropertyDescriptor(globalThis, "location");

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}

function restoreGlobal(name, descriptor) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}

try {
  const memory = new MemoryStorage();
  setGlobal("localStorage", memory);

  assert.equal(readText("missing"), null);
  assert.equal(readText("missing", "fallback"), "fallback");
  assert.deepEqual(readTextResult("missing"), { ok: true, value: null });
  assert.equal(writeText("text", 123), true);
  assert.equal(readText("text"), "123");

  assert.equal(writeJSON("json", { enabled: true }), true);
  assert.deepEqual(readJSON("json"), { enabled: true });
  assert.equal(writeJSON("undefined", undefined), false);
  assert.equal(writeJSON("function", () => {}), false);
  assert.equal(writeJSON("symbol", Symbol("value")), false);
  assert.equal(readText("undefined"), null);
  assert.equal(readText("function"), null);
  assert.equal(readText("symbol"), null);
  memory.setItem("broken", "{");
  assert.deepEqual(readJSON("broken", { fallback: true }), { fallback: true });

  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(writeJSON("cyclic", cyclic), false);
  assert.equal(removeStoredValue("text"), true);
  assert.equal(readText("text"), null);

  const persistentConsent = createConsentState("consent");
  assert.equal(persistentConsent.write("granted"), true);
  assert.equal(persistentConsent.read(), "granted");
  assert.equal(persistentConsent.clear(), true);
  assert.equal(persistentConsent.read(), null);

  assert.equal(scopedKey("key", { hostname: "localhost", pathname: "/index.html" }), "key");
  assert.equal(
    scopedKey("key", {
      hostname: "ang107.github.io",
      pathname: "/MLTD_Anniversary_Event_Optimizer_LEGACY_VERSION/index.html",
    }),
    "key",
  );
  assert.equal(
    scopedKey("key", { hostname: "ang107.github.io", pathname: "/preview/branch/index.html" }),
    "key@/preview/branch/",
  );

  const initialized = new MemoryStorage([
    [STORAGE_KEYS.SIMULATOR, JSON.stringify({ setting: { HAVING_POINTS: 12345 } })],
    [STORAGE_KEYS.COUNTER, JSON.stringify({ custom: true })],
  ]);
  setGlobal("localStorage", initialized);
  setGlobal("location", { hostname: "localhost", pathname: "/index.html" });

  initializeStorage();
  assert.deepEqual(readJSON(STORAGE_KEYS.SIMULATOR), { HAVING_POINTS: 12345 });
  assert.deepEqual(loadOptimizerData(), { HAVING_POINTS: 12345 });
  assert.deepEqual(readJSON(STORAGE_KEYS.COUNTER), { custom: true });
  assert.equal(typeof readJSON(STORAGE_KEYS.FINAL_DAY), "object");

  assert.equal(saveOptimizerData({ HAVING_POINTS: 67890 }), true);
  assert.deepEqual(loadOptimizerData(), { HAVING_POINTS: 67890 });
  initializeStorage();
  assert.deepEqual(loadOptimizerData(), { HAVING_POINTS: 67890 });

  setGlobal("localStorage", {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  });
  assert.deepEqual(readTextResult("blocked"), { ok: false, value: null });
  assert.equal(readText("blocked"), null);
  assert.equal(writeText("blocked", "value"), false);
  assert.equal(removeStoredValue("blocked"), false);
  assert.doesNotThrow(() => initializeStorage());
  assert.equal(loadOptimizerData(), null);
  assert.equal(saveOptimizerData({}), false);

  const consent = createConsentState("consent");
  assert.equal(consent.write("denied"), false);
  assert.equal(consent.read(), "denied");
  assert.equal(consent.clear(), false);
  assert.equal(consent.read(), null);
} finally {
  restoreGlobal("localStorage", originalStorage);
  restoreGlobal("location", originalLocation);
}

console.log("PASS storage adapter and migration tests");
