"use strict";

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch (_) {
    return null;
  }
}

export function readText(key, fallback = null) {
  try {
    return storage()?.getItem(key) ?? fallback;
  } catch (_) {
    return fallback;
  }
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
    return writeText(key, JSON.stringify(value));
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
