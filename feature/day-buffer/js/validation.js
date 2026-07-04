"use strict";

/* ============================================================
 * 実行前バリデーション
 * ============================================================ */
function validate(state) {
  // errors は上部表示用の重複排除済みメッセージ、fieldErrors は入力欄単位のエラー。
  // 同じメッセージが複数フィールドに紐づく場合、errors.length と fieldErrors の件数は一致しない。
  const errors = [];
  // fieldErrors: { 入力欄id: メッセージ } 変更位置の近くに表示するため
  const fieldErrors = {};
  const s = state.setting;

  // id 付きで失敗を記録（上部集約 errors と フィールド別 fieldErrors の両方へ）
  const errorSet = new Set();
  const fail = (id, msg) => {
    if (!errorSet.has(msg)) { errorSet.add(msg); errors.push(msg); }
    if (id && !(id in fieldErrors)) fieldErrors[id] = msg;
    return false;
  };

  const reqInt = (val, label, opts = {}, id = null) => {
    const { min = null, max = null, gt = null, integer = true } = opts;
    if (!Number.isFinite(val) || (integer && !Number.isInteger(val))) {
      return fail(id, `${label}: ${integer ? "整数" : "数値"}を入力してください`);
    }
    if (gt !== null && !(val > gt)) return fail(id, `${label}: ${gt} より大きい値を入力してください`);
    if (min !== null && val < min) return fail(id, `${label}: ${min} 以上にしてください`);
    if (max !== null && val > max) return fail(id, `${label}: ${max} 以下にしてください`);
    return true;
  };

  // 設定スカラー（時間系は小数を許容 integer:false）
  reqInt(s.FIRST_HALF_WORKING_TIME_SEC, "前半戦 1800枚収集時間", { gt: 0, integer: false }, "set_FIRST_HALF_WORKING_TIME_SEC");
  reqInt(s.SECOND_HALF_WORKING_TIME_SEC, "後半戦 1800枚収集時間", { gt: 0, integer: false }, "set_SECOND_HALF_WORKING_TIME_SEC");
  reqInt(s.ANNIVERSARY_SONG_TIME_SEC, "周年曲の曲時間", { min: 60, max: 180, integer: false }, "set_ANNIVERSARY_SONG_TIME_SEC");
  reqInt(s.MENU_TRANSITION_TIME_SEC, "メニュー遷移", { gt: 0, integer: false }, "set_MENU_TRANSITION_TIME_SEC");
  reqInt(s.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC, "楽曲選択画面→曲開始", { gt: 0, integer: false }, "set_FROM_SONG_SELECT_TO_START_SONG_TIME_SEC");
  reqInt(s.FROM_SONG_END_TO_SONG_SELECT_TIME_SEC, "曲終了→楽曲選択画面", { gt: 0, integer: false }, "set_FROM_SONG_END_TO_SONG_SELECT_TIME_SEC");
  reqInt(s.TIME_SEC_BETWEEN_SONG_AND_SONG, "曲終了→次曲開始（再演）", { gt: 0, integer: false }, "set_TIME_SEC_BETWEEN_SONG_AND_SONG");
  reqInt(s.SPARK_DRINK_10, "スパークドリンク10", { min: 0 }, "set_SPARK_DRINK_10");
  reqInt(s.SPARK_DRINK_20, "スパークドリンク20", { min: 0 }, "set_SPARK_DRINK_20");
  reqInt(s.SPARK_DRINK_30, "スパークドリンク30", { min: 0 }, "set_SPARK_DRINK_30");
  reqInt(s.SPARK_DRINK_MAX, "スパークドリンクMAX", { min: 0 }, "set_SPARK_DRINK_MAX");
  reqInt(s.MAX_STAMINA, "スタミナ最大量", { min: 1, max: 240 }, "set_MAX_STAMINA");

  // 開始日に応じて検証対象を限定（稼働時間は開始日以降、リフレッシュ開始時刻はその前日以降）
  const startV = Number.isInteger(s.SIMULATE_START_DAY) ? s.SIMULATE_START_DAY : 0;
  for (let i = Math.max(0, startV); i < CONST.EVENT_LENGTH; i++) {
    reqInt(s.CAN_RUNNING_TIME_HOUR[i], `${dayDateLabel(i)} の稼働可能時間`, { min: 0, max: 24, integer: false }, `canrun_${i}`);
    const annivVal = s.MIN_ANNIVERSARY_SONG_TIME_HOUR[i];
    const annivOk = reqInt(annivVal, `${dayDateLabel(i)} の周年曲最低時間`, { min: 0, max: 24, integer: false }, `annivmin_${i}`);
    if (annivOk && Number.isFinite(annivVal) && annivVal > 0 && Number.isFinite(s.CAN_RUNNING_TIME_HOUR[i]) && annivVal > s.CAN_RUNNING_TIME_HOUR[i]) {
      const msg = `${dayDateLabel(i)} の周年曲最低時間が稼働可能時間を超えています`;
      fail(`annivmin_${i}`, msg);
      fail(`canrun_${i}`, msg);
    }
    // バッファ（秒・正負可・小数可）。空欄は gatherState で 0 に補完済み
    reqInt(s.DAY_BUFFER_SEC[i], `${dayDateLabel(i)} の時間バッファ`, { min: -86400, max: 86400, integer: false }, `buffer_${i}`);
  }
  for (let i = Math.max(0, startV - 1); i < CONST.EVENT_LENGTH - 1; i++) {
    reqInt(s.REFRESH_START_TIME[i], `${dayDateLabel(i)} のリフレッシュ開始時刻`, { min: 0, max: 23 }, `refresh_${i}`);
  }
  for (let idx = 0; idx < CONST.IDOL_COUNT; idx++) {
    reqInt(s.SONG_TIMES_SEC_BY_IDOL[idx], `${IDOLS[idx]} の楽曲時間`, { min: 60, max: 180, integer: false }, `song_${idx}`);
  }

  // 実行モード・初期状態
  reqInt(s.SIMULATE_START_DAY, "シミュレーション開始日", { min: 0, max: CONST.EVENT_LENGTH - 1 }, "opt_SIMULATE_START_DAY");
  reqInt(s.HAVING_POINTS, "現在の所持ポイント", { min: 0 }, "opt_HAVING_POINTS");
  reqInt(s.HAVING_TRIGGER, "現在の所持トリガー", { min: 0 }, "opt_HAVING_TRIGGER");
  if (s.RUNNING_MODE === "TIME_MINIMIZE") {
    if (!reqInt(s.TARGET_POINTS, "目標ポイント", {}, "opt_TARGET_POINTS")) { /* already reported */ }
    else if (s.TARGET_POINTS <= 0) fail("opt_TARGET_POINTS", "目標ポイント: 稼働時間最小化では0より大きい値が必要です");
  }

  // リフレッシュ開始時刻の前後関係（検証対象の値がすべて入力済みのときのみ判定）
  if (Number.isInteger(s.SIMULATE_START_DAY)) {
    const start = s.SIMULATE_START_DAY;
    const needFrom = Math.max(0, start - 1);
    let allFinite = true;
    for (let i = needFrom; i < CONST.EVENT_LENGTH - 1; i++) {
      if (!Number.isFinite(s.REFRESH_START_TIME[i])) { allFinite = false; break; }
    }
    if (allFinite) {
      for (let i = Math.max(start, 0); i < CONST.EVENT_LENGTH - 1; i++) {
        const yesterdayEnd = i > 0 ? Math.max(0, s.REFRESH_START_TIME[i - 1] + CONST.REFRESH_TIME_HOUR - 24) : 0;
        if (s.REFRESH_START_TIME[i] < yesterdayEnd) {
          fail(`refresh_${i}`, `${dayDateLabel(i)} のリフレッシュ開始時刻は前日のリフレッシュ終了時刻（${yesterdayEnd}時）以上にしてください`);
        }
      }
    }
    // 周年曲最低時間が物理的稼働可能時間を超えていないか。
    // まずリフレッシュだけで判定し、次に開始日だけ開始時刻を追加で判定する。
    for (let i = Math.max(start, 0); i < CONST.EVENT_LENGTH; i++) {
      const annivVal = s.MIN_ANNIVERSARY_SONG_TIME_HOUR[i];
      if (!(Number.isFinite(annivVal) && annivVal > 0)) continue;
      const prevRefresh = i > 0 ? s.REFRESH_START_TIME[i - 1] : null;
      const curRefresh = i < CONST.EVENT_LENGTH - 1 ? s.REFRESH_START_TIME[i] : null;
      if ((i > 0 && !Number.isFinite(prevRefresh)) || (i < CONST.EVENT_LENGTH - 1 && !Number.isFinite(curRefresh))) continue;
      const yesterdayEnd = i > 0 ? Math.max(0, prevRefresh + CONST.REFRESH_TIME_HOUR - 24) : 0;
      let refreshUnavailableHour = yesterdayEnd;
      if (i < CONST.EVENT_LENGTH - 1) {
        refreshUnavailableHour += Math.max(0, Math.min(24, curRefresh + CONST.REFRESH_TIME_HOUR) - curRefresh);
      }
      const refreshPhysicalHour = 24 - refreshUnavailableHour;
      if (annivVal > refreshPhysicalHour && !(`annivmin_${i}` in fieldErrors)) {
        const msg = `${dayDateLabel(i)} の周年曲最低時間がリフレッシュタイムを考慮した物理的稼働可能時間（${refreshPhysicalHour}時間）を超えています`;
        fail(`annivmin_${i}`, msg);
        if (i > 0 && yesterdayEnd > 0) fail(`refresh_${i - 1}`, msg);
        if (i < CONST.EVENT_LENGTH - 1) fail(`refresh_${i}`, msg);
        continue;
      }

      if (i === start) {
        const startClockHour = (s.SIMULATE_START_HOUR || 0) + (s.SIMULATE_START_MINUTE || 0) / 60;
        if (startClockHour <= 0) continue;
        let startUnavailableHour = Math.max(yesterdayEnd, startClockHour);
        if (i < CONST.EVENT_LENGTH - 1) {
          startUnavailableHour += Math.max(0, Math.min(24, curRefresh + CONST.REFRESH_TIME_HOUR) - Math.max(curRefresh, startClockHour));
        }
        const startPhysicalHour = 24 - startUnavailableHour;
        if (annivVal > startPhysicalHour && !(`annivmin_${i}` in fieldErrors)) {
          const msg = `${dayDateLabel(i)} の周年曲最低時間がシミュレーション開始時刻を考慮した物理的稼働可能時間（${startPhysicalHour}時間）を超えています`;
          fail(`annivmin_${i}`, msg);
          fail("opt_SIMULATE_START_TIME", msg);
        }
      }
    }
  }

  // おすすめ楽曲の重複・範囲チェック
  const start = s.SIMULATE_START_DAY;
  if (Number.isInteger(start)) {
    const endDayExclusive = s.CONFIRMED_RECOMMENDED_SONGS_SCHEDULE ? CONST.EVENT_LENGTH : start + 1;
    const seen = new Set();
    let ok = true;
    for (let i = 0; i < endDayExclusive; i++) {
      for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
        const v = s.RECOMMENDED_SONGS[i][j];
        if (!(Number.isInteger(v) && v >= 0 && v < CONST.IDOL_COUNT)) { ok = false; }
        else seen.add(v);
      }
    }
    const need = endDayExclusive * CONST.RECOMMENDED_SONGS_COUNT_PER_DAY;
    if (!ok || seen.size !== need) {
      if (s.CONFIRMED_RECOMMENDED_SONGS_SCHEDULE) {
        errors.push("おすすめ楽曲: 確定モードでは13日 × 4枠の全52枠を重複なく埋めてください");
      } else {
        errors.push(`おすすめ楽曲: 未確定モードでは ${dayDateLabel(0)}〜${dayDateLabel(start)} の楽曲を重複なく埋めてください`);
      }
    }
  }

  return { errors, fieldErrors };
}

// フィールド別エラーを各入力欄に反映（赤ハイライト＋直下にメッセージ）
function applyFieldErrors(fieldErrors) {
  // 既存表示をクリア（rec の select.invalid は highlightRecDuplicates が管理するため対象外）
  document.querySelectorAll(".field-error").forEach((e) => e.remove());
  document.querySelectorAll("input.invalid").forEach((e) => e.classList.remove("invalid"));
  for (const [id, msg] of Object.entries(fieldErrors)) {
    const inp = $(id);
    if (!inp) continue;
    inp.classList.add("invalid");
    inp.insertAdjacentElement("afterend", el("div", { class: "field-error", text: msg }));
  }
}
