"use strict";

import assert from "node:assert/strict";
import {
  readJSON, readText, removeStoredValue, writeJSON, writeText,
} from "../js/storage-adapter.js";
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
  assert.equal(writeText("text", 123), true);
  assert.equal(readText("text"), "123");

  assert.equal(writeJSON("json", { enabled: true }), true);
  assert.deepEqual(readJSON("json"), { enabled: true });
  memory.setItem("broken", "{");
  assert.deepEqual(readJSON("broken", { fallback: true }), { fallback: true });

  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(writeJSON("cyclic", cyclic), false);
  assert.equal(removeStoredValue("text"), true);
  assert.equal(readText("text"), null);

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
  assert.equal(readText("blocked"), null);
  assert.equal(writeText("blocked", "value"), false);
  assert.equal(removeStoredValue("blocked"), false);
  assert.doesNotThrow(() => initializeStorage());
  assert.equal(loadOptimizerData(), null);
  assert.equal(saveOptimizerData({}), false);
} finally {
  restoreGlobal("localStorage", originalStorage);
  restoreGlobal("location", originalLocation);
}

console.log("PASS storage adapter and migration tests");
