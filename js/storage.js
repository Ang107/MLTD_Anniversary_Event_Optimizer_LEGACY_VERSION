"use strict";

/* ============================================================
 * 入力の永続化（localStorage）と結果の鮮度表示
 * ============================================================ */
let hasResult = false;
let suppressSave = false;

function saveState() {
  if (suppressSave) return;
  try { localStorage.setItem(scopedKey(STORAGE_KEYS.SIMULATOR), JSON.stringify(gatherState())); } catch (e) { /* 保存できなくても継続 */ }
  const presetId = $("presetSelect")?.value;
  if (presetId) saveLastPreset(presetId);
}
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEYS.SIMULATOR)));
    if (!parsed || typeof parsed !== "object") return null;
    return migrateOptimizerData(parsed);
  } catch (e) { return null; }
}
function saveLastPreset(presetId) {
  if (suppressSave) return;
  try { localStorage.setItem(scopedKey(STORAGE_KEYS.PRESET), presetId); } catch (e) {}
}
function loadLastPreset() {
  try { return localStorage.getItem(scopedKey(STORAGE_KEYS.PRESET)) || null; } catch (e) { return null; }
}
