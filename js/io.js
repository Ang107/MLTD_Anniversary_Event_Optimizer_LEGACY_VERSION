"use strict";

/* ============================================================
 * JSON エクスポート / インポート
 * ============================================================ */
function exportJSON() {
  const { setting } = gatherState();
  const songByName = {};
  IDOLS.forEach((name, i) => { songByName[name] = setting.SONG_TIMES_SEC_BY_IDOL[i]; });
  const rec = setting.RECOMMENDED_SONGS.map((row) =>
    row.map((idx) => (Number.isInteger(idx) && idx >= 0 && idx < CONST.IDOL_COUNT ? IDOLS[idx] : null)));

  const data = {
    setting: {
      REFRESH_START_TIME: setting.REFRESH_START_TIME,
      CAN_RUNNING_TIME_HOUR: setting.CAN_RUNNING_TIME_HOUR,
      FIRST_HALF_WORKING_TIME_SEC: setting.FIRST_HALF_WORKING_TIME_SEC,
      SECOND_HALF_WORKING_TIME_SEC: setting.SECOND_HALF_WORKING_TIME_SEC,
      ANNIVERSARY_SONG_TIME_SEC: setting.ANNIVERSARY_SONG_TIME_SEC,
      FROM_SONG_SELECT_TO_START_SONG_TIME_SEC: setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC,
      MENU_TRANSITION_TIME_SEC: setting.MENU_TRANSITION_TIME_SEC,
      TIME_SEC_BETWEEN_SONG_AND_SONG: setting.TIME_SEC_BETWEEN_SONG_AND_SONG,
      FROM_SONG_END_TO_LIVE_TIME_SEC: setting.FROM_SONG_END_TO_LIVE_TIME_SEC,
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
      RANDOM_SEED: setting.RANDOM_SEED,
      SIMULATION_COUNT: setting.SIMULATION_COUNT,
      SIMULATE_START_DAY: setting.SIMULATE_START_DAY,
      HAVING_POINTS: setting.HAVING_POINTS,
      HAVING_TRIGGER: setting.HAVING_TRIGGER,
      RECOMMENDED_SONGS: rec,
    },
  };

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
  const state = JSON.parse(JSON.stringify(DEFAULTS));
  const target = state.setting;
  // setting に統合。setting / option に分かれた形式も読み込めるよう両方をマージ（setting 優先）
  const incoming = Object.assign({}, (data && data.option) || {}, (data && data.setting) || {});

  const copyIf = (src, dst, keys) => {
    for (const k of keys) if (src[k] !== undefined && src[k] !== null) dst[k] = src[k];
  };
  copyIf(incoming, target, [
    "REFRESH_START_TIME", "CAN_RUNNING_TIME_HOUR",
    "FIRST_HALF_WORKING_TIME_SEC", "SECOND_HALF_WORKING_TIME_SEC", "ANNIVERSARY_SONG_TIME_SEC",
    "FROM_SONG_SELECT_TO_START_SONG_TIME_SEC", "MENU_TRANSITION_TIME_SEC",
    "TIME_SEC_BETWEEN_SONG_AND_SONG", "FROM_SONG_END_TO_LIVE_TIME_SEC",
    "SPARK_DRINK_10", "SPARK_DRINK_20", "SPARK_DRINK_30",
    "SPARK_DRINK_MAX", "MAX_STAMINA",
    "BOOST_MODE", "RUNNING_MODE", "TARGET_POINTS", "CONFIRMED_RECOMMENDED_SONGS_SCHEDULE",
    "RANDOM_SEED", "SIMULATION_COUNT", "SIMULATE_START_DAY", "HAVING_POINTS", "HAVING_TRIGGER",
  ]);
  // SONG_TIMES_SEC_BY_IDOL: 名前マップ → index 配列
  if (incoming.SONG_TIMES_SEC_BY_IDOL && typeof incoming.SONG_TIMES_SEC_BY_IDOL === "object") {
    const arr = DEFAULTS.setting.SONG_TIMES_SEC_BY_IDOL.slice();
    if (Array.isArray(incoming.SONG_TIMES_SEC_BY_IDOL)) {
      incoming.SONG_TIMES_SEC_BY_IDOL.forEach((v, i) => { if (i < arr.length && v != null) arr[i] = v; });
    } else {
      IDOLS.forEach((name, i) => { if (incoming.SONG_TIMES_SEC_BY_IDOL[name] != null) arr[i] = incoming.SONG_TIMES_SEC_BY_IDOL[name]; });
    }
    target.SONG_TIMES_SEC_BY_IDOL = arr;
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
  liveValidate(); // 取り込んだ値に invalid があればその場で表示
}
