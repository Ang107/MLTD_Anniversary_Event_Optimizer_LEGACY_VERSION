"use strict";

export function trackEvent(name, params) {
  try {
    if (typeof globalThis.gtag !== "function") return;
    globalThis.gtag("event", name, params);
  } catch (_) {}
}
