"use strict";

import { readTextResult, removeStoredValue, writeText } from "./storage-adapter.js";

export function createConsentState(storageKey) {
  let sessionFallback = null;
  let hasSessionFallback = false;

  return {
    read() {
      if (hasSessionFallback) return sessionFallback;
      const result = readTextResult(storageKey);
      return result.ok ? result.value : null;
    },
    write(value) {
      const saved = writeText(storageKey, value);
      sessionFallback = saved ? null : value;
      hasSessionFallback = !saved;
      return saved;
    },
    clear() {
      sessionFallback = null;
      hasSessionFallback = false;
      return removeStoredValue(storageKey);
    },
  };
}
