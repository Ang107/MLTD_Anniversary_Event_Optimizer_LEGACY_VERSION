"use strict";

/* ============================================================
 * JSON エクスポート / インポート
 * ============================================================ */
// 現在の入力状態を書き出し/共有用のプレーンなデータオブジェクトに変換する。
// exportJSON（ファイル）と共有URLの双方から使う。
function buildExportData() {
  const setting = gatherState();
  const songByName = {};
  IDOLS.forEach((name, i) => {
    songByName[name] = { name: setting.SONG_NAMES_BY_IDOL[i] || "", time: setting.SONG_TIMES_SEC_BY_IDOL[i] };
  });
  const rec = setting.RECOMMENDED_SONGS.map((row) =>
    row.map((idx) => (Number.isInteger(idx) && idx >= 0 && idx < CONST.IDOL_COUNT ? IDOLS[idx] : null)));

  return {
    preset: ($("presetSelect")?.value) || DEFAULT_SONG_PRESET_ID,
    setting: {
      REFRESH_START_TIME: setting.REFRESH_START_TIME,
      CAN_RUNNING_TIME_HOUR: setting.CAN_RUNNING_TIME_HOUR,
      MIN_ANNIVERSARY_SONG_TIME_HOUR: setting.MIN_ANNIVERSARY_SONG_TIME_HOUR,
      DAY_BUFFER_SEC: setting.DAY_BUFFER_SEC,
      FIRST_HALF_WORKING_TIME_SEC: setting.FIRST_HALF_WORKING_TIME_SEC,
      SECOND_HALF_WORKING_TIME_SEC: setting.SECOND_HALF_WORKING_TIME_SEC,
      ANNIVERSARY_SONG_TIME_SEC: setting.ANNIVERSARY_SONG_TIME_SEC,
      MENU_TRANSITION_TIME_SEC: setting.MENU_TRANSITION_TIME_SEC,
      FROM_SONG_SELECT_TO_START_SONG_TIME_SEC: setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC,
      FROM_SONG_END_TO_SONG_SELECT_TIME_SEC: setting.FROM_SONG_END_TO_SONG_SELECT_TIME_SEC,
      TIME_SEC_BETWEEN_SONG_AND_SONG: setting.TIME_SEC_BETWEEN_SONG_AND_SONG,
      SPARK_DRINK_10: setting.SPARK_DRINK_10,
      SPARK_DRINK_20: setting.SPARK_DRINK_20,
      SPARK_DRINK_30: setting.SPARK_DRINK_30,
      SPARK_DRINK_MAX: setting.SPARK_DRINK_MAX,
      MAX_STAMINA: setting.MAX_STAMINA,
      SONG_TIMES_SEC_BY_IDOL: songByName,
      BOOST_MODE: setting.BOOST_MODE,
      RUNNING_MODE: setting.RUNNING_MODE,
      TARGET_POINTS: setting.TARGET_POINTS,
      CONFIRMED_RECOMMENDED_SONGS_SCHEDULE: setting.CONFIRMED_RECOMMENDED_SONGS_SCHEDULE,
      SIMULATE_START_DAY: setting.SIMULATE_START_DAY,
      SIMULATE_START_HOUR: setting.SIMULATE_START_HOUR,
      SIMULATE_START_MINUTE: setting.SIMULATE_START_MINUTE,
      HAVING_POINTS: setting.HAVING_POINTS,
      HAVING_TRIGGER: setting.HAVING_TRIGGER,
      START_DAY_LOGIN_TRIGGER_OBTAINED: setting.START_DAY_LOGIN_TRIGGER_OBTAINED,
      START_DAY_MISSION_TRIGGER_OBTAINED: setting.START_DAY_MISSION_TRIGGER_OBTAINED,
      START_DAY_BOOST_USED: setting.START_DAY_BOOST_USED,
      START_DAY_ANNIV10X_DONE: setting.START_DAY_ANNIV10X_DONE,
      RECOMMENDED_SONGS: rec,
    },
  };
}

function exportJSON() {
  const data = buildExportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: "mltd_9th_config.json" });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importJSON(text) {
  let data;
  try { data = JSON.parse(text); }
  catch (e) { showErrors(["JSON の解析に失敗しました: " + e.message]); return; }

  // デフォルトに上書きする形でマージ
  const state = buildOptimizerDefaults();
  const target = state;
  // setting と option の両形式に対応するため両方をマージ（setting 優先）
  const incoming = Object.assign({}, (data && data.option) || {}, (data && data.setting) || {});

  const copyIf = (src, dst, keys) => {
    for (const k of keys) if (src[k] !== undefined && src[k] !== null) dst[k] = src[k];
  };
  copyIf(incoming, target, [
    "REFRESH_START_TIME", "CAN_RUNNING_TIME_HOUR", "MIN_ANNIVERSARY_SONG_TIME_HOUR", "DAY_BUFFER_SEC",
    "FIRST_HALF_WORKING_TIME_SEC", "SECOND_HALF_WORKING_TIME_SEC", "ANNIVERSARY_SONG_TIME_SEC",
    "MENU_TRANSITION_TIME_SEC", "FROM_SONG_SELECT_TO_START_SONG_TIME_SEC",
    "FROM_SONG_END_TO_SONG_SELECT_TIME_SEC", "TIME_SEC_BETWEEN_SONG_AND_SONG",
    "SPARK_DRINK_10", "SPARK_DRINK_20", "SPARK_DRINK_30",
    "SPARK_DRINK_MAX", "MAX_STAMINA",
    "BOOST_MODE", "RUNNING_MODE", "TARGET_POINTS", "CONFIRMED_RECOMMENDED_SONGS_SCHEDULE",
    "SIMULATE_START_DAY", "SIMULATE_START_HOUR", "SIMULATE_START_MINUTE",
    "HAVING_POINTS", "HAVING_TRIGGER",
    "START_DAY_LOGIN_TRIGGER_OBTAINED", "START_DAY_MISSION_TRIGGER_OBTAINED", "START_DAY_BOOST_USED",
    "START_DAY_ANNIV10X_DONE",
  ]);
  // SONG_TIMES_SEC_BY_IDOL: { name, time } マップ or 数値マップ or index 配列
  if (incoming.SONG_TIMES_SEC_BY_IDOL && typeof incoming.SONG_TIMES_SEC_BY_IDOL === "object") {
    const timeArr = DEFAULTS.SONG_TIMES_SEC_BY_IDOL.slice();
    const nameArr = DEFAULTS.SONG_NAMES_BY_IDOL.slice();
    if (Array.isArray(incoming.SONG_TIMES_SEC_BY_IDOL)) {
      incoming.SONG_TIMES_SEC_BY_IDOL.forEach((v, i) => { if (i < timeArr.length && v != null) timeArr[i] = v; });
    } else {
      IDOLS.forEach((name, i) => {
        const v = incoming.SONG_TIMES_SEC_BY_IDOL[name];
        if (v == null) return;
        if (typeof v === "object") {
          if (v.time != null) timeArr[i] = v.time;
          if (v.name != null) nameArr[i] = v.name;
        } else {
          timeArr[i] = v;
        }
      });
    }
    target.SONG_TIMES_SEC_BY_IDOL = timeArr;
    target.SONG_NAMES_BY_IDOL = nameArr;
  }

  // RECOMMENDED_SONGS: 名前 → index
  if (Array.isArray(incoming.RECOMMENDED_SONGS)) {
    const nameToIdx = new Map(IDOLS.map((n, i) => [n, i]));
    const rows = [];
    for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
      const srcRow = incoming.RECOMMENDED_SONGS[i] || [];
      const row = [];
      for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
        const cell = srcRow[j];
        if (typeof cell === "number") row.push(cell);
        else if (typeof cell === "string" && nameToIdx.has(cell)) row.push(nameToIdx.get(cell));
        else row.push(-1);
      }
      rows.push(row);
    }
    target.RECOMMENDED_SONGS = rows;
  }

  applyState(state);
  // プリセット選択状態の復元（rec の値は applyState 済みなので表示のみ反映）
  if (typeof data.preset === "string" && setPresetDisplay(data.preset)) {
    saveLastPreset(data.preset);
  }
  liveValidate(); // 取り込んだ値に invalid があればその場で表示
}
