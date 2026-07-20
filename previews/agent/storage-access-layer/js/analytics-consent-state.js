"use strict";

import { readTextResult, removeStoredValue, writeText } from "./storage-adapter.js";

export function createConsentState(storageKey) {
  let sessionFallback = null;

  return {
    read() {
      const result = readTextResult(storageKey);
      return result.ok ? result.value : sessionFallback;
    },
    write(value) {
      const saved = writeText(storageKey, value);
      sessionFallback = saved ? null : value;
      return saved;
    },
    clear() {
      sessionFallback = null;
      return removeStoredValue(storageKey);
    },
  };
}
