"use strict";

function defaultPlaceholder(value, allowFloat = false) {
  if (!Number.isFinite(value)) return "";
  const text = allowFloat && Number.isInteger(value) ? `${value}.0` : String(value);
  return text;
}

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
    numField("opt_TARGET_POINTS", "目標ポイント", "1", defaultPlaceholder(DEFAULTS.TARGET_POINTS)),
  ]));

  // ブースト
  g.appendChild(groupBlock("ブースト", [
    selectField("opt_BOOST_MODE", "ブースト", [
      ["NORMAL_SONG", "通常曲（スタミナ効率優先）"],
      ["ANNIVERSARY_SONG", "周年曲（時間効率優先）"],
    ]),
  ]));

  // おすすめ楽曲スケジュール
  g.appendChild(groupBlock("おすすめ楽曲スケジュール", [
    selectField("opt_CONFIRMED", "スケジュール", [
      ["confirmed", "確定済み"],
      ["unconfirmed", "未確定"],
    ]),
  ]));

  // 初期状態（開始日は日付プルダウン + 開始時刻 + 現在日時ボタン）
  const startDateField = el("div", { class: "field", id: "field_opt_SIMULATE_START_DAY" });
  startDateField.appendChild(el("label", { text: "シミュレーション開始日時" }));
  const startRow = el("div", { class: "start-datetime-row" });
  const startDaySel = el("select", { id: "opt_SIMULATE_START_DAY" });
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    startDaySel.appendChild(el("option", { value: String(i), text: dayDateLabel(i) }));
  }
  const startTimeInput = el("input", { type: "time", id: "opt_SIMULATE_START_TIME", value: "00:00" });
  // 時計アイコン以外をクリックしても時刻ピッカーを開けるようにする（対応ブラウザのみ）
  startTimeInput.addEventListener("click", () => {
    if (typeof startTimeInput.showPicker === "function") {
      try { startTimeInput.showPicker(); } catch (e) { /* ユーザー操作以外などで失敗しても無視 */ }
    }
  });
  const setNowBtn = el("button", { type: "button", id: "setCurrentTimeBtn", text: "現在日時に設定" });
  startRow.appendChild(startDaySel);
  startRow.appendChild(startTimeInput);
  startRow.appendChild(setNowBtn);
  startDateField.appendChild(startRow);
  const startDatetimeMsg = el("div", { class: "start-datetime-msg", id: "startDatetimeMsg" });
  startDatetimeMsg.style.display = "none";
  startDateField.appendChild(startDatetimeMsg);

  setNowBtn.addEventListener("click", () => {
    const now = new Date();
    let day, h, m, clippedMessage;
    if (now < CONST.START_DAY) {
      day = 0; h = "00"; m = "00";
      clippedMessage = "イベント開始日時より前のため、6/30（火）00:00 に設定しました。";
    } else if (now >= CONST.EVENT_END_EXCLUSIVE) {
      day = 0; h = "00"; m = "00";
      clippedMessage = "イベント終了日時よりも後のため、6/30（火）00:00 に設定しました。";
    } else {
      const msPerDay = 24 * 3600 * 1000;
      day = Math.min(CONST.EVENT_LENGTH - 1, Math.floor((now - CONST.START_DAY) / msPerDay));
      h = String(now.getHours()).padStart(2, "0");
      m = String(now.getMinutes()).padStart(2, "0");
      clippedMessage = "";
    }
    startDaySel.value = String(day);
    startTimeInput.value = `${h}:${m}`;
    const msgEl = $("startDatetimeMsg");
    if (msgEl) {
      clearTimeout(msgEl._hideTimer);
      if (clippedMessage) {
        msgEl.textContent = clippedMessage;
        msgEl.style.display = "";
        msgEl._hideTimer = setTimeout(() => { msgEl.style.display = "none"; }, 4000);
      } else {
        msgEl.style.display = "none";
      }
    }
    startDaySel.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const initialGroup = el("div", { class: "group" });
  initialGroup.appendChild(el("p", { class: "group-title", text: "初期状態" }));
  initialGroup.appendChild(startDateField);
  const havingGrid = el("div", { class: "grid" });
  havingGrid.style.marginTop = "8px";
  // 2行目: 開始日に既に消化済みの要素（取得済み/使用済みなら開始日の収支から除外）
  const startStatusGrid = el("div", { class: "grid" });
  startStatusGrid.style.marginTop = "8px";
  startStatusGrid.appendChild(selectField("opt_START_DAY_LOGIN_TRIGGER_OBTAINED", "ログイントリガー（540）", [
    ["not_obtained", "未取得"],
    ["obtained", "取得済み"],
  ]));
  startStatusGrid.appendChild(selectField("opt_START_DAY_MISSION_TRIGGER_OBTAINED", "ミッショントリガー（1000×4）", [
    ["not_obtained", "未取得"],
    ["obtained", "取得済み"],
  ]));
  startStatusGrid.appendChild(selectField("opt_START_DAY_BOOST_USED", "ブースト", [
    ["not_used", "未使用"],
    ["used", "使用済み"],
  ]));
  startStatusGrid.appendChild(selectField("opt_START_DAY_ANNIV10X_DONE", "周年曲10倍", [
    ["not_played", "未プレイ"],
    ["played", "プレイ済み"],
  ]));
  initialGroup.appendChild(startStatusGrid);

  // 3行目: 現在の所持ポイント・トリガー
  havingGrid.appendChild(numField("opt_HAVING_POINTS", "現在の所持ポイント", "1", defaultPlaceholder(DEFAULTS.HAVING_POINTS)));
  havingGrid.appendChild(numField("opt_HAVING_TRIGGER", "現在の所持トリガー", "1", defaultPlaceholder(DEFAULTS.HAVING_TRIGGER)));
  initialGroup.appendChild(havingGrid);
  g.appendChild(initialGroup);

  $("opt_RUNNING_MODE").addEventListener("change", updateEnabledStates);
  $("opt_CONFIRMED").addEventListener("change", () => { updateEnabledStates(); updateRecommendedDisabled(); });
}

function buildPresetBar() {
  const bar = $("presetBar");
  if (!bar) return;
  bar.innerHTML = "";

  const sel = el("select", { id: "presetSelect" });
  for (const p of SONG_PRESETS) {
    sel.appendChild(el("option", { value: p.id, text: p.label }));
  }

  const reshuffleBtn = el("button", { type: "button", id: "reshuffleBtn", text: "↺ 再シャッフル" });
  reshuffleBtn.style.display = "none";
  reshuffleBtn.addEventListener("click", () => {
    applyPreset("random");
    liveValidate();
  });

  sel.addEventListener("change", () => {
    applyPreset(sel.value);
    saveLastPreset(sel.value);
    liveValidate();
    reshuffleBtn.style.display = sel.value === "random" ? "" : "none";
  });

  bar.appendChild(el("div", { class: "preset-bar" }, [sel, reshuffleBtn]));
}

// プリセットドロップダウンの表示状態のみを反映する（rec の値は変更しない）。
// 有効なプリセット ID なら true を返す。
function setPresetDisplay(presetId) {
  const sel = $("presetSelect");
  if (!sel || !SONG_PRESETS.some((p) => p.id === presetId)) return false;
  sel.value = presetId;
  const reshuffleBtn = $("reshuffleBtn");
  if (reshuffleBtn) reshuffleBtn.style.display = presetId === "random" ? "" : "none";
  return true;
}

function applyPreset(presetId) {
  if (!SONG_PRESETS.some((p) => p.id === presetId)) return;
  const rows = recommendedRowsFromPreset(presetId);
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      const idx = rows[i][j];
      $(`rec_${i}_${j}`).value = (idx == null || idx < 0) ? "" : String(idx);
    }
  }
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
    const tr = el("tr", { id: `recrow_${i}` }, [dayDateHeaderCell(i)]);
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
  const makeField = (key) => {
    const allowFloat = FLOAT_SETTING_KEYS.has(key);
    const range = key === "MAX_STAMINA" ? { min: 1, max: 240 }
      : key === "ANNIVERSARY_SONG_TIME_SEC" ? { min: 60, max: 180 }
        : {};
    return numField("set_" + key, labels[key], allowFloat ? "any" : "1", defaultPlaceholder(DEFAULTS[key], allowFloat), range);
  };
  g.appendChild(groupBlock("チケット収集時間", [
    "FIRST_HALF_WORKING_TIME_SEC", "SECOND_HALF_WORKING_TIME_SEC",
  ].map(makeField)));
  g.appendChild(groupBlock("楽曲・画面遷移の時間", [
    "ANNIVERSARY_SONG_TIME_SEC", "MENU_TRANSITION_TIME_SEC",
    "FROM_SONG_SELECT_TO_START_SONG_TIME_SEC", "FROM_SONG_END_TO_SONG_SELECT_TIME_SEC",
    "TIME_SEC_BETWEEN_SONG_AND_SONG",
  ].map(makeField)));
  g.appendChild(groupBlock("スパークドリンク・スタミナ", [
    "SPARK_DRINK_10", "SPARK_DRINK_20", "SPARK_DRINK_30", "SPARK_DRINK_MAX", "MAX_STAMINA",
  ].map(makeField)));
}

function buildDayTable() {
  const t = $("dayTable");
  t.innerHTML = "";
  const cg = el("colgroup");
  cg.appendChild(el("col", { class: "daytable-day-col" }));
  cg.appendChild(el("col"));
  cg.appendChild(el("col"));
  t.appendChild(cg);
  const thCanrun = el("th", { text: "稼働可能時間(時間)" });
  const thRefresh = el("th", { text: "リフレッシュ開始時刻" });
  t.appendChild(el("tr", {}, [
    el("th", { text: "日" }),
    thCanrun,
    thRefresh,
  ]));
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const tr = el("tr", {}, [dayDateHeaderCell(i)]);
    tr.appendChild(el("td", {}, [el("input", {
      type: "number",
      id: `canrun_${i}`,
      step: "any",
      min: "0",
      max: "24",
      placeholder: defaultPlaceholder(DEFAULTS.CAN_RUNNING_TIME_HOUR[i], true),
    })]));
    if (i < CONST.EVENT_LENGTH - 1) {
      tr.appendChild(el("td", {}, [el("input", {
        type: "number",
        id: `refresh_${i}`,
        step: "1",
        min: "0",
        max: "23",
        placeholder: defaultPlaceholder(DEFAULTS.REFRESH_START_TIME[i]),
      })]));
    } else {
      tr.appendChild(el("td", { text: "—" }));
    }
    t.appendChild(tr);
  }
}

function buildAnnivMinTable() {
  const t = $("annivMinTable");
  if (!t) return;
  t.innerHTML = "";
  const cg = el("colgroup");
  cg.appendChild(el("col", { class: "daytable-day-col" }));
  cg.appendChild(el("col"));
  t.appendChild(cg);
  t.appendChild(el("tr", {}, [
    el("th", { text: "日" }),
    el("th", { text: "周年曲最低時間(時間)" }),
  ]));
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const tr = el("tr", {}, [dayDateHeaderCell(i)]);
    tr.appendChild(el("td", {}, [el("input", {
      type: "number",
      id: `annivmin_${i}`,
      step: "any",
      min: "0",
      max: "24",
      placeholder: defaultPlaceholder(DEFAULTS.MIN_ANNIVERSARY_SONG_TIME_HOUR[i], true),
    })]));
    t.appendChild(tr);
  }
}

function buildBufferTable() {
  const t = $("bufferTable");
  if (!t) return;
  t.innerHTML = "";
  const cg = el("colgroup");
  cg.appendChild(el("col", { class: "daytable-day-col" }));
  cg.appendChild(el("col"));
  t.appendChild(cg);
  t.appendChild(el("tr", {}, [
    el("th", { text: "日" }),
    el("th", { text: "バッファ(秒)" }),
  ]));
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const tr = el("tr", {}, [dayDateHeaderCell(i)]);
    tr.appendChild(el("td", {}, [el("input", {
      type: "number",
      id: `buffer_${i}`,
      step: "any",
      min: "-86400",
      max: "86400",
      placeholder: defaultPlaceholder(DEFAULTS.DAY_BUFFER_SEC[i], true),
    })]));
    t.appendChild(tr);
  }
}

function buildSongTimeGrid() {
  const g = $("songTimeGrid");
  IDOLS.forEach((name, idx) => {
    const wrap = el("div", { class: "field", id: `field_song_${idx}` });
    wrap.appendChild(el("label", { for: `songname_${idx}`, text: name }));
    wrap.appendChild(el("input", { type: "text", id: `songname_${idx}`, placeholder: "曲名（省略可）" }));
    wrap.appendChild(el("input", {
      type: "number",
      id: `song_${idx}`,
      step: "any",
      min: "60",
      max: "180",
      placeholder: defaultPlaceholder(DEFAULTS.SONG_TIMES_SEC_BY_IDOL[idx], true),
    }));
    g.appendChild(wrap);
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

function applyState(s) {
  // 実行モード・初期状態
  $("opt_BOOST_MODE").value = s.BOOST_MODE;
  $("opt_RUNNING_MODE").value = s.RUNNING_MODE;
  $("opt_CONFIRMED").value = s.CONFIRMED_RECOMMENDED_SONGS_SCHEDULE ? "confirmed" : "unconfirmed";
  $("opt_START_DAY_LOGIN_TRIGGER_OBTAINED").value = s.START_DAY_LOGIN_TRIGGER_OBTAINED ? "obtained" : "not_obtained";
  $("opt_START_DAY_MISSION_TRIGGER_OBTAINED").value = s.START_DAY_MISSION_TRIGGER_OBTAINED ? "obtained" : "not_obtained";
  $("opt_START_DAY_BOOST_USED").value = s.START_DAY_BOOST_USED ? "used" : "not_used";
  $("opt_START_DAY_ANNIV10X_DONE").value = s.START_DAY_ANNIV10X_DONE ? "played" : "not_played";
  for (const [key] of OPTION_SCALAR_FIELDS) setVal("opt_" + key, s[key]);
  const timeEl = $("opt_SIMULATE_START_TIME");
  if (timeEl) {
    const h = String(s.SIMULATE_START_HOUR ?? 0).padStart(2, "0");
    const m = String(s.SIMULATE_START_MINUTE ?? 0).padStart(2, "0");
    timeEl.value = `${h}:${m}`;
  }
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
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) setVal(`annivmin_${i}`, s.MIN_ANNIVERSARY_SONG_TIME_HOUR[i]);
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) setVal(`buffer_${i}`, (s.DAY_BUFFER_SEC && s.DAY_BUFFER_SEC[i]));
  for (let i = 0; i < CONST.EVENT_LENGTH - 1; i++) setVal(`refresh_${i}`, s.REFRESH_START_TIME[i]);
  for (let idx = 0; idx < CONST.IDOL_COUNT; idx++) {
    setVal("song_" + idx, s.SONG_TIMES_SEC_BY_IDOL[idx]);
    const nameEl = $("songname_" + idx);
    if (nameEl) nameEl.value = (s.SONG_NAMES_BY_IDOL && s.SONG_NAMES_BY_IDOL[idx]) || "";
  }

  updateEnabledStates();
  updateRecommendedDisabled();
  highlightRecDuplicates();
  updateRecSongTimes();
}

function gatherState() {
  const setting = {
    REFRESH_START_TIME: [],
    CAN_RUNNING_TIME_HOUR: [],
    MIN_ANNIVERSARY_SONG_TIME_HOUR: [],
    DAY_BUFFER_SEC: [],
    SONG_TIMES_SEC_BY_IDOL: [],
    BOOST_MODE: $("opt_BOOST_MODE").value,
    RUNNING_MODE: $("opt_RUNNING_MODE").value,
    CONFIRMED_RECOMMENDED_SONGS_SCHEDULE: $("opt_CONFIRMED").value === "confirmed",
    START_DAY_LOGIN_TRIGGER_OBTAINED: $("opt_START_DAY_LOGIN_TRIGGER_OBTAINED").value === "obtained",
    START_DAY_MISSION_TRIGGER_OBTAINED: $("opt_START_DAY_MISSION_TRIGGER_OBTAINED").value === "obtained",
    START_DAY_BOOST_USED: $("opt_START_DAY_BOOST_USED").value === "used",
    START_DAY_ANNIV10X_DONE: $("opt_START_DAY_ANNIV10X_DONE").value === "played",
    RECOMMENDED_SONGS: [],
  };
  for (const [key] of SETTING_SCALAR_FIELDS) setting[key] = (FLOAT_SETTING_KEYS.has(key) ? readNum : readInt)("set_" + key);
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) setting.CAN_RUNNING_TIME_HOUR.push(readNum(`canrun_${i}`));
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) setting.MIN_ANNIVERSARY_SONG_TIME_HOUR.push(readNum(`annivmin_${i}`));
  // バッファは空欄をデフォルト0扱い（正負・小数可）。空欄以外で不正な値は NaN のままバリデーションで検出する
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const raw = ($(`buffer_${i}`)?.value ?? "").trim();
    setting.DAY_BUFFER_SEC.push(raw === "" ? 0 : readNum(`buffer_${i}`));
  }
  for (let i = 0; i < CONST.EVENT_LENGTH - 1; i++) setting.REFRESH_START_TIME.push(readInt(`refresh_${i}`));
  setting.SONG_NAMES_BY_IDOL = [];
  for (let idx = 0; idx < CONST.IDOL_COUNT; idx++) {
    setting.SONG_TIMES_SEC_BY_IDOL.push(readNum("song_" + idx));
    setting.SONG_NAMES_BY_IDOL.push(($("songname_" + idx)?.value ?? "").trim());
  }
  for (const [key] of OPTION_SCALAR_FIELDS) setting[key] = readInt("opt_" + key);
  const rawTime = ($("opt_SIMULATE_START_TIME")?.value || "00:00").split(":");
  setting.SIMULATE_START_HOUR = parseInt(rawTime[0] || "0", 10);
  setting.SIMULATE_START_MINUTE = parseInt(rawTime[1] || "0", 10);
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const row = [];
    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      const v = $(`rec_${i}_${j}`).value;
      row.push(v === "" ? -1 : parseInt(v, 10));
    }
    setting.RECOMMENDED_SONGS.push(row);
  }
  return setting;
}

function updateEnabledStates() {
  // 実行モードに応じて目標ポイントの表示を切り替え
  const timeMin = $("opt_RUNNING_MODE").value === "TIME_MINIMIZE";
  setShown("field_opt_TARGET_POINTS", timeMin);
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
    if (canEl) {
      canEl.disabled = i < s;
      canEl.parentElement?.classList.toggle("cell-disabled", canEl.disabled);
    }
    const annivEl = $(`annivmin_${i}`);
    if (annivEl) {
      annivEl.disabled = i < s;
      annivEl.parentElement?.classList.toggle("cell-disabled", annivEl.disabled);
    }
    const bufEl = $(`buffer_${i}`);
    if (bufEl) {
      bufEl.disabled = i < s;
      bufEl.parentElement?.classList.toggle("cell-disabled", bufEl.disabled);
    }
    const refEl = $(`refresh_${i}`);
    if (refEl) {
      refEl.disabled = i < s - 1;
      refEl.parentElement?.classList.toggle("cell-disabled", refEl.disabled);
    }
  }

  highlightRecDuplicates();
  updateRecSongTimes();
}

function updateRecSongTimes() {
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const times = [];

    for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
      const span = $(`rectime_${i}_${j}`);
      if (!span) continue;
      span.classList.remove("rec-shortest");
      $(`rectd_${i}_${j}`).classList.remove("rec-shortest-cell");

      const sel = $(`rec_${i}_${j}`);
      const idx = sel && sel.value !== "" ? parseInt(sel.value, 10) : -1;
      const time = idx >= 0 ? readNum("song_" + idx) : NaN;
      const songName = idx >= 0 ? ($("songname_" + idx)?.value ?? "").trim() : "";
      times.push({ j, time });
      const label = Number.isFinite(time) ? `${time}秒${songName ? `（${songName}）` : ""}` : "";
      span.textContent = label;
      span.title = label;
    }

    if (times.length > 0) {
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
