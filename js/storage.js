"use strict";

/* ============================================================
 * 入力の永続化（localStorage）と結果の鮮度表示
 * ============================================================ */
const STORAGE_KEY = "mltd9th_simulator_state_v1";
let hasResult = false; // 結果を表示中かどうか（鮮度バッジの制御用）

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(gatherState())); } catch (e) { /* 保存できなくても継続 */ }
}
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return parsed && typeof parsed.setting === "object" ? parsed : null;
  } catch (e) { return null; }
}
