"use strict";

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch (_) {
    return null;
  }
}

export function readTextResult(key) {
  try {
    const target = storage();
    if (!target) return { ok: false, value: null };
    return { ok: true, value: target.getItem(key) };
  } catch (_) {
    return { ok: false, value: null };
  }
}

export function readText(key, fallback = null) {
  const result = readTextResult(key);
  return result.ok && result.value !== null ? result.value : fallback;
}

export function writeText(key, value) {
  try {
    const target = storage();
    if (!target) return false;
    target.setItem(key, String(value));
    return true;
  } catch (_) {
    return false;
  }
}

export function readJSON(key, fallback = null) {
  const raw = readText(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

export function writeJSON(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) return false;
    return writeText(key, serialized);
  } catch (_) {
    return false;
  }
}

export function removeStoredValue(key) {
  try {
    const target = storage();
    if (!target) return false;
    target.removeItem(key);
    return true;
  } catch (_) {
    return false;
  }
}
