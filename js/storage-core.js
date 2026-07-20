"use strict";
import { DEFAULTS } from "./config.js";
import { readJSON, readText, writeJSON } from "./storage-adapter.js";

/* ============================================================
 * ストレージ基盤（全ページ共通）
 *
 * - STORAGE_KEYS : 全 localStorage キー名
 * - storageScope / scopedKey : ブランチプレビュー用スコーピング
 * - initializeStorage : 初回訪問時のデフォルト保存と旧形式の移行
 * ============================================================ */

export const STORAGE_KEYS = {
  SIMULATOR: "mltd_anniversary_event_optimizer_legacy_simulator_state_v1",
  PRESET:    "mltd_anniversary_event_optimizer_legacy_preset_v1",
  COUNTER:   "mltd_anniversary_event_optimizer_legacy_counter_state_v1",
  FINAL_DAY: "mltd_anniversary_event_optimizer_legacy_finalday_state_v1",
  ANALYTICS: "mltd_anniversary_event_optimizer_legacy_analytics_consent",
};

export function storageScope(currentLocation = globalThis.location) {
  if (!currentLocation) return "";
  var PROD_BASE_PATH = "/MLTD_Anniversary_Event_Optimizer_LEGACY_VERSION/";
  if (currentLocation.hostname !== "ang107.github.io") return "";
  var dir = currentLocation.pathname.replace(/[^/]*$/, "");
  return dir === PROD_BASE_PATH ? "" : dir;
}
export function scopedKey(baseKey, currentLocation = globalThis.location) {
  var scope = storageScope(currentLocation);
  return scope ? baseKey + "@" + scope : baseKey;
}

export function shortestDefaultRecommendedSongTime() {
  var songs = DEFAULTS.RECOMMENDED_SONGS;
  var times = DEFAULTS.SONG_TIMES_SEC_BY_IDOL;
  if (!Array.isArray(songs) || !Array.isArray(times)) return DEFAULTS.SHORTEST_SONG_TIME_SEC;
  var lastDay = songs[songs.length - 1];
  if (!Array.isArray(lastDay) || lastDay.length === 0) return DEFAULTS.SHORTEST_SONG_TIME_SEC;
  var min = Infinity;
  for (var i = 0; i < lastDay.length; i++) {
    var t = times[lastDay[i]];
    if (Number.isFinite(t) && t < min) min = t;
  }
  return min === Infinity ? DEFAULTS.SHORTEST_SONG_TIME_SEC : min;
}

// オプティマイザー localStorage 用のキーセット（DEFAULTS から必要な分だけ拾う）
export const OPTIMIZER_KEYS = [
  "REFRESH_START_TIME", "CAN_RUNNING_TIME_HOUR", "MIN_ANNIVERSARY_SONG_TIME_HOUR", "DAY_BUFFER_SEC",
  "FIRST_HALF_WORKING_TIME_SEC", "SECOND_HALF_WORKING_TIME_SEC",
  "ANNIVERSARY_SONG_TIME_SEC", "MENU_TRANSITION_TIME_SEC",
  "FROM_SONG_SELECT_TO_START_SONG_TIME_SEC", "FROM_SONG_END_TO_SONG_SELECT_TIME_SEC",
  "TIME_SEC_BETWEEN_SONG_AND_SONG",
  "SPARK_DRINK_10", "SPARK_DRINK_20", "SPARK_DRINK_30", "SPARK_DRINK_MAX",
  "MAX_STAMINA", "SONG_TIMES_SEC_BY_IDOL", "SONG_NAMES_BY_IDOL",
  "BOOST_MODE", "RUNNING_MODE", "TARGET_POINTS",
  "CONFIRMED_RECOMMENDED_SONGS_SCHEDULE",
  "SIMULATE_START_DAY", "SIMULATE_START_HOUR", "SIMULATE_START_MINUTE",
  "HAVING_POINTS", "HAVING_TRIGGER",
  "START_DAY_LOGIN_TRIGGER_OBTAINED", "START_DAY_MISSION_TRIGGER_OBTAINED",
  "START_DAY_BOOST_USED", "START_DAY_ANNIV10X_DONE",
  "RECOMMENDED_SONGS",
];

export function buildOptimizerDefaults() {
  var obj = {};
  for (var i = 0; i < OPTIMIZER_KEYS.length; i++) {
    var k = OPTIMIZER_KEYS[i];
    var v = DEFAULTS[k];
    obj[k] = (typeof v === "object" && v !== null) ? JSON.parse(JSON.stringify(v)) : v;
  }
  return obj;
}

export function buildFinalDayDefaults() {
  return {
    hour: DEFAULTS.FINAL_DAY_HOUR,
    min: DEFAULTS.FINAL_DAY_MIN,
    sec: DEFAULTS.FINAL_DAY_SEC,
    buffer: DEFAULTS.FINAL_DAY_BUFFER_SEC,
    trigger: DEFAULTS.HAVING_TRIGGER,
    points: DEFAULTS.HAVING_POINTS,
    recSong: shortestDefaultRecommendedSongTime(),
    arbSong: DEFAULTS.SHORTEST_SONG_TIME_SEC,
    collect1800: DEFAULTS.SECOND_HALF_WORKING_TIME_SEC,
    anniv: DEFAULTS.ANNIVERSARY_SONG_TIME_SEC,
    menu: DEFAULTS.MENU_TRANSITION_TIME_SEC,
    entry: DEFAULTS.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC,
    exit: DEFAULTS.FROM_SONG_END_TO_SONG_SELECT_TIME_SEC,
    betw: DEFAULTS.TIME_SEC_BETWEEN_SONG_AND_SONG,
  };
}

export function buildCounterDefaults() {
  return {
    counts: {},
    initialPt: DEFAULTS.HAVING_POINTS,
    initialTr: DEFAULTS.HAVING_TRIGGER,
    history: [],
  };
}

export function migrateOptimizerData(parsed) {
  if (parsed && typeof parsed.setting === "object") return parsed.setting;
  return parsed;
}

export function loadOptimizerData() {
  var parsed = readJSON(scopedKey(STORAGE_KEYS.SIMULATOR));
  if (!parsed || typeof parsed !== "object") return null;
  var migrated = migrateOptimizerData(parsed);
  return migrated && typeof migrated === "object" ? migrated : null;
}

export function saveOptimizerData(data) {
  return writeJSON(scopedKey(STORAGE_KEYS.SIMULATOR), data);
}

export function initializeStorage() {
  var seeds = [
    { key: STORAGE_KEYS.SIMULATOR, builder: buildOptimizerDefaults },
    { key: STORAGE_KEYS.COUNTER,   builder: buildCounterDefaults },
    { key: STORAGE_KEYS.FINAL_DAY, builder: buildFinalDayDefaults },
  ];
  for (var i = 0; i < seeds.length; i++) {
    var key = scopedKey(seeds[i].key);
    if (readText(key) === null) writeJSON(key, seeds[i].builder());
  }

  // マイグレーション: 旧 { setting: {...} } → フラット
  var simKey = scopedKey(STORAGE_KEYS.SIMULATOR);
  var parsed = readJSON(simKey);
  if (parsed && typeof parsed.setting === "object") {
    writeJSON(simKey, parsed.setting);
  }
}
