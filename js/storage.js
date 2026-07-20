"use strict";
import { STORAGE_KEYS, migrateOptimizerData, scopedKey } from "./storage-core.js";
import { $ } from "./dom.js";
import { gatherState } from "./form.js";
import { isSaveSuppressed } from "./app-state.js";

/* ============================================================
 * 入力の永続化（localStorage）と結果の鮮度表示
 * ============================================================ */
export function saveState() {
  if (isSaveSuppressed()) return;
  try { localStorage.setItem(scopedKey(STORAGE_KEYS.SIMULATOR), JSON.stringify(gatherState())); } catch (e) { /* 保存できなくても継続 */ }
  const presetId = $("presetSelect")?.value;
  if (presetId) saveLastPreset(presetId);
}
export function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEYS.SIMULATOR)));
    if (!parsed || typeof parsed !== "object") return null;
    return migrateOptimizerData(parsed);
  } catch (e) { return null; }
}
export function saveLastPreset(presetId) {
  if (isSaveSuppressed()) return;
  try { localStorage.setItem(scopedKey(STORAGE_KEYS.PRESET), presetId); } catch (e) {}
}
export function loadLastPreset() {
  try { return localStorage.getItem(scopedKey(STORAGE_KEYS.PRESET)) || null; } catch (e) { return null; }
}
