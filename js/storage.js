"use strict";

/* ============================================================
 * 入力の永続化（localStorage）と結果の鮮度表示
 * ============================================================ */
const STORAGE_KEY = "mltd9th_simulator_state_v1";
const PRESET_STORAGE_KEY = "mltd9th_simulator_preset_v1";
let hasResult = false; // 結果を表示中かどうか（鮮度バッジの制御用）
// 共有URLからの読み込み中だけ true。「開いた時」ではなく「ユーザーが触った時」に
// 保存したいので、共有データの取り込み中に走る自動保存（saveState）だけを抑止する。
let suppressSave = false;

function saveState() {
  if (suppressSave) return; // 共有URL読み込み中は自分の localStorage を上書きしない
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(gatherState())); } catch (e) { /* 保存できなくても継続 */ }
  const presetId = $("presetSelect")?.value;
  if (presetId) saveLastPreset(presetId);
}
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && typeof parsed.setting === "object" ? parsed : null;
  } catch (e) { return null; }
}
function saveLastPreset(presetId) {
  if (suppressSave) return; // 共有URL読み込み中は保存しない（saveState と挙動を揃える）
  try { localStorage.setItem(PRESET_STORAGE_KEY, presetId); } catch (e) {}
}
function loadLastPreset() {
  try { return localStorage.getItem(PRESET_STORAGE_KEY) || null; } catch (e) { return null; }
}
