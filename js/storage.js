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

// GitHub Pages のブランチプレビュー（/<branch>/配下）では本番(main)と
// localStorage のキーを分け、互いのデータを汚染しないようにする。
// 本番・ローカル開発では従来どおり無印のキーを使う。
function storageScope() {
  const PROD_BASE_PATH = "/MLTD_9th_Optimizer/";
  if (location.hostname !== "ang107.github.io") return "";
  const dir = location.pathname.replace(/[^/]*$/, "");
  return dir === PROD_BASE_PATH ? "" : dir;
}
function scopedKey(baseKey) {
  const scope = storageScope();
  return scope ? `${baseKey}@${scope}` : baseKey;
}

function saveState() {
  if (suppressSave) return; // 共有URL読み込み中は自分の localStorage を上書きしない
  try { localStorage.setItem(scopedKey(STORAGE_KEY), JSON.stringify(gatherState())); } catch (e) { /* 保存できなくても継続 */ }
  const presetId = $("presetSelect")?.value;
  if (presetId) saveLastPreset(presetId);
}
function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(scopedKey(STORAGE_KEY)));
    return parsed && typeof parsed.setting === "object" ? parsed : null;
  } catch (e) { return null; }
}
function saveLastPreset(presetId) {
  if (suppressSave) return; // 共有URL読み込み中は保存しない（saveState と挙動を揃える）
  try { localStorage.setItem(scopedKey(PRESET_STORAGE_KEY), presetId); } catch (e) {}
}
function loadLastPreset() {
  try { return localStorage.getItem(scopedKey(PRESET_STORAGE_KEY)) || null; } catch (e) { return null; }
}
