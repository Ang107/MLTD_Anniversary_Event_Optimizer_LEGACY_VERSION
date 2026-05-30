"use strict";

/* ============================================================
 * DOM 構築（フォームの組み立て）
 * ============================================================ */
function buildOptionGrid() {
  const g = $("optionGrid");
  g.innerHTML = "";

  // 最適化モード（目標ポイントは稼働時間最小化のときのみ表示）
  g.appendChild(groupBlock("最適化モード", [
    selectField("opt_RUNNING_MODE", "最適化モード", [
      ["POINT_MAXIMIZE", "ポイント最大化"],
      ["TIME_MINIMIZE", "稼働時間最小化"],
    ]),
    numField("opt_TARGET_POINTS", "目標ポイント"),
  ]));

  // ブースト
  g.appendChild(groupBlock("ブースト", [
    selectField("opt_BOOST_MODE", "ブースト", [
      ["NORMAL_SONG", "通常曲（スタミナ効率優先）"],
      ["ANNIVERSARY_SONG", "周年曲（時間効率優先）"],
    ]),
  ]));

  // おすすめ楽曲スケジュール（未確定のときのみ乱数シード・回数を表示）
  g.appendChild(groupBlock("おすすめ楽曲スケジュール", [
    selectField("opt_CONFIRMED", "スケジュール", [
      ["confirmed", "確定済み"],
      ["unconfirmed", "未確定"],
    ]),
    numField("opt_RANDOM_SEED", "乱数シード"),
    numField("opt_SIMULATION_COUNT", "シミュレーション回数"),
  ]));

  // 初期状態（開始日は日付プルダウン。内部値は 0-index）
  const startDayOptions = [];
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    startDayOptions.push([String(i), dayDateLabel(i)]);
  }
  g.appendChild(groupBlock("初期状態", [
    selectField("opt_SIMULATE_START_DAY", "シミュレーション開始日", startDayOptions),
    numField("opt_HAVING_POINTS", "現在の所持ポイント"),
    numField("opt_HAVING_TRIGGER", "現在の所持トリガー"),
  ]));

  $("opt_RUNNING_MODE").addEventListener("change", updateEnabledStates);
  $("opt_CONFIRMED").addEventListener("change", () => { updateEnabledStates(); updateRecommendedDisabled(); });
}

function buildRecTable() {
  const t = $("recTable");
  t.innerHTML = "";
  const thead = el("tr", {}, [el("th", { text: "日" })]);
  for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
    thead.appendChild(el("th", { text: `楽曲 ${j + 1}` }));
  }
  t.appendChild(thead);
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const tr = el("tr", { id: `recrow_${i}` }, [el("th", { text: dayDateLabel(i) })]);
    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      const sel = el("select", { id: `rec_${i}_${j}` });
      sel.appendChild(el("option", { value: "", text: "（未選択）" }));
      IDOLS.forEach((name, idx) => sel.appendChild(el("option", { value: String(idx), text: name })));
      sel.addEventListener("change", highlightRecDuplicates);
      const span = el("span", { class: "rec-songtime", id: `rectime_${i}_${j}` });
      const td = el("td", { id: `rectd_${i}_${j}` }, [sel, span]);
      tr.appendChild(td);
    }
    t.appendChild(tr);
  }
}

function buildSettingScalar() {
  const g = $("settingScalarGrid");
  g.innerHTML = "";
  const labels = Object.fromEntries(SETTING_SCALAR_FIELDS);
  const makeField = (key) => numField("set_" + key, labels[key], FLOAT_SETTING_KEYS.has(key) ? "any" : "1");
  g.appendChild(groupBlock("チケット収集時間", [
    "FIRST_HALF_WORKING_TIME_SEC", "SECOND_HALF_WORKING_TIME_SEC",
  ].map(makeField)));
  g.appendChild(groupBlock("楽曲・画面遷移の時間", [
    "ANNIVERSARY_SONG_TIME_SEC", "FROM_SONG_SELECT_TO_START_SONG_TIME_SEC",
    "MENU_TRANSITION_TIME_SEC", "TIME_SEC_BETWEEN_SONG_AND_SONG",
    "FROM_SONG_END_TO_LIVE_TIME_SEC",
  ].map(makeField)));
  g.appendChild(groupBlock("スパークドリンク・スタミナ", [
    "SPARK_DRINK_10", "SPARK_DRINK_20", "SPARK_DRINK_30", "SPARK_DRINK_MAX", "MAX_STAMINA",
  ].map(makeField)));
}

function buildDayTable() {
  const t = $("dayTable");
  t.innerHTML = "";
  t.appendChild(el("tr", {}, [
    el("th", { text: "日" }),
    el("th", { text: "稼働可能時間 (時間)" }),
    el("th", { text: "リフレッシュ開始時刻" }),
  ]));
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const tr = el("tr", {}, [el("th", { text: dayDateLabel(i) })]);
    tr.appendChild(el("td", {}, [el("input", { type: "number", id: `canrun_${i}`, step: "any", min: "0", max: "24" })]));
    // REFRESH_START_TIME は 12 日分（最終日は無し）
    if (i < CONST.EVENT_LENGTH - 1) {
      tr.appendChild(el("td", {}, [el("input", { type: "number", id: `refresh_${i}`, step: "1", min: "0", max: "23" })]));
    } else {
      tr.appendChild(el("td", { text: "—" }));
    }
    t.appendChild(tr);
  }
}

function buildSongTimeGrid() {
  const g = $("songTimeGrid");
  IDOLS.forEach((name, idx) => {
    g.appendChild(numField("song_" + idx, name, "any"));
  });
}

/* ============================================================
 * フォーム ⇄ 内部状態
 * ============================================================ */
function setVal(id, v) {
  const e = $(id);
  if (!e) return;
  e.value = (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) ? "" : String(v);
}
function readInt(id) {
  const e = $(id);
  if (!e) return NaN;
  const v = e.value.trim();
  if (v === "" || !/^-?\d+$/.test(v)) return NaN;
  return parseInt(v, 10);
}
// 小数を許容する数値読み取り
function readNum(id) {
  const e = $(id);
  if (!e) return NaN;
  const v = e.value.trim();
  if (v === "" || !/^-?(\d+\.?\d*|\.\d+)$/.test(v)) return NaN;
  return parseFloat(v);
}

function applyState(state) {
  const s = state.setting;
  // 実行モード・初期状態
  $("opt_BOOST_MODE").value = s.BOOST_MODE;
  $("opt_RUNNING_MODE").value = s.RUNNING_MODE;
  $("opt_CONFIRMED").value = s.CONFIRMED_RECOMMENDED_SONGS_SCHEDULE ? "confirmed" : "unconfirmed";
  for (const [key] of OPTION_SCALAR_FIELDS) setVal("opt_" + key, s[key]);
  // おすすめ楽曲
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      const idx = s.RECOMMENDED_SONGS[i] && s.RECOMMENDED_SONGS[i][j];
      $(`rec_${i}_${j}`).value = (idx === undefined || idx === null || idx < 0) ? "" : String(idx);
    }
  }
  // 時間・アイテムなどの設定
  for (const [key] of SETTING_SCALAR_FIELDS) setVal("set_" + key, s[key]);
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) setVal(`canrun_${i}`, s.CAN_RUNNING_TIME_HOUR[i]);
  for (let i = 0; i < CONST.EVENT_LENGTH - 1; i++) setVal(`refresh_${i}`, s.REFRESH_START_TIME[i]);
  for (let idx = 0; idx < CONST.IDOL_COUNT; idx++) setVal("song_" + idx, s.SONG_TIMES_SEC_BY_IDOL[idx]);

  updateEnabledStates();
  updateRecommendedDisabled();
  highlightRecDuplicates();
  updateRecSongTimes();
}

function gatherState() {
  const setting = {
    REFRESH_START_TIME: [],
    CAN_RUNNING_TIME_HOUR: [],
    SONG_TIMES_SEC_BY_IDOL: [],
    BOOST_MODE: $("opt_BOOST_MODE").value,
    RUNNING_MODE: $("opt_RUNNING_MODE").value,
    CONFIRMED_RECOMMENDED_SONGS_SCHEDULE: $("opt_CONFIRMED").value === "confirmed",
    RECOMMENDED_SONGS: [],
  };
  for (const [key] of SETTING_SCALAR_FIELDS) setting[key] = (FLOAT_SETTING_KEYS.has(key) ? readNum : readInt)("set_" + key);
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) setting.CAN_RUNNING_TIME_HOUR.push(readNum(`canrun_${i}`));
  for (let i = 0; i < CONST.EVENT_LENGTH - 1; i++) setting.REFRESH_START_TIME.push(readInt(`refresh_${i}`));
  for (let idx = 0; idx < CONST.IDOL_COUNT; idx++) setting.SONG_TIMES_SEC_BY_IDOL.push(readNum("song_" + idx));
  for (const [key] of OPTION_SCALAR_FIELDS) setting[key] = readInt("opt_" + key);
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const row = [];
    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      const v = $(`rec_${i}_${j}`).value;
      row.push(v === "" ? -1 : parseInt(v, 10));
    }
    setting.RECOMMENDED_SONGS.push(row);
  }
  return { setting };
}

function updateEnabledStates() {
  // 実行モードに応じて目標ポイントの表示を切り替え
  const timeMin = $("opt_RUNNING_MODE").value === "TIME_MINIMIZE";
  setShown("field_opt_TARGET_POINTS", timeMin);
  // スケジュール確定/未確定に応じて乱数シード・回数の表示を切り替え
  const confirmed = $("opt_CONFIRMED").value === "confirmed";
  setShown("field_opt_RANDOM_SEED", !confirmed);
  setShown("field_opt_SIMULATION_COUNT", !confirmed);
}

function updateRecommendedDisabled() {
  const confirmed = $("opt_CONFIRMED").value === "confirmed";
  const start = readInt("opt_SIMULATE_START_DAY");
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    // 未確定モードでは start より後の日を無効化（自動ランダム生成対象）
    const disabled = !confirmed && Number.isInteger(start) && i > start;
    const row = $(`recrow_${i}`);
    if (row) row.classList.toggle("row-disabled", disabled);
    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      $(`rec_${i}_${j}`).disabled = disabled;
    }
  }

  // 日ごとの稼働可能時間・リフレッシュ開始時刻も開始日に応じて無効化
  // 稼働時間は開始日以降、リフレッシュ開始時刻はその前日以降が必要
  const s = Number.isInteger(start) ? start : 0;
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const canEl = $(`canrun_${i}`);
    if (canEl) canEl.disabled = i < s;
    const refEl = $(`refresh_${i}`);
    if (refEl) refEl.disabled = i < s - 1;
  }

  highlightRecDuplicates();
  updateRecSongTimes();
}

function updateRecSongTimes() {
  const start = readInt("opt_SIMULATE_START_DAY");
  const confirmed = $("opt_CONFIRMED").value === "confirmed";

  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const isActive = Number.isInteger(start) && i >= start && (confirmed || i === start);
    const times = [];

    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      const span = $(`rectime_${i}_${j}`);
      if (!span) continue;
      span.classList.remove("rec-shortest");
      $(`rectd_${i}_${j}`).classList.remove("rec-shortest-cell");

      if (!isActive) { span.textContent = ""; continue; }

      const sel = $(`rec_${i}_${j}`);
      const idx = sel && sel.value !== "" ? parseInt(sel.value, 10) : -1;
      const time = idx >= 0 ? readNum("song_" + idx) : NaN;
      times.push({ j, time });
      span.textContent = Number.isFinite(time) ? `${time}秒` : "";
    }

    if (isActive && times.length > 0) {
      const valid = times.filter((t) => Number.isFinite(t.time));
      if (valid.length > 0) {
        const min = Math.min(...valid.map((t) => t.time));
        for (const { j, time } of valid) {
          if (time === min) {
            $(`rectime_${i}_${j}`).classList.add("rec-shortest");
            $(`rectd_${i}_${j}`).classList.add("rec-shortest-cell");
          }
        }
      }
    }
  }
}

function highlightRecDuplicates() {
  const confirmed = $("opt_CONFIRMED").value === "confirmed";
  const start = readInt("opt_SIMULATE_START_DAY");
  const endDayExclusive = confirmed ? CONST.EVENT_LENGTH
    : (Number.isInteger(start) ? Math.min(CONST.EVENT_LENGTH, start + 1) : CONST.EVENT_LENGTH);
  const counts = {};
  for (let i = 0; i < endDayExclusive; i++) {
    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      const v = $(`rec_${i}_${j}`).value;
      if (v !== "") counts[v] = (counts[v] || 0) + 1;
    }
  }
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      const sel = $(`rec_${i}_${j}`);
      let bad = false;
      if (i < endDayExclusive && !sel.disabled) {
        const v = sel.value;
        if (v === "" || counts[v] > 1) bad = true;
      }
      sel.classList.toggle("invalid", bad);
    }
  }
}
