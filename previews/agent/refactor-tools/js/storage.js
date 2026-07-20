"use strict";
import { STORAGE_KEYS, loadOptimizerData, saveOptimizerData, scopedKey } from "./storage-core.js";
import { readText, writeText } from "./storage-adapter.js";
import { $ } from "./dom.js";
import { gatherState } from "./form.js";
import { isSaveSuppressed } from "./app-state.js";

/* ============================================================
 * 入力の永続化（localStorage）と結果の鮮度表示
 * ============================================================ */
export function saveState() {
  if (isSaveSuppressed()) return;
  saveOptimizerData(gatherState());
  const presetId = $("presetSelect")?.value;
  if (presetId) saveLastPreset(presetId);
}
export function loadState() {
  return loadOptimizerData();
}
export function saveLastPreset(presetId) {
  if (isSaveSuppressed()) return;
  writeText(scopedKey(STORAGE_KEYS.PRESET), presetId);
}
export function loadLastPreset() {
  return readText(scopedKey(STORAGE_KEYS.PRESET));
}
