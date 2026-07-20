"use strict";
import { STORAGE_KEYS, buildFinalDayDefaults, loadOptimizerData, scopedKey } from "./storage-core.js";
import { readJSON, writeJSON } from "./storage-adapter.js";
import { makeDialogDiffItem, showDialog, toolsEl } from "./tools-dialog.js";
import { trackEvent } from "./analytics.js";

import {
  POINT_BY_STANDARD_TRIGGER, STAMINA_NON, STAMINA_REC, loopTime, solve,
} from "./final-day-solver.js";

// JST 2026-07-13 00:00 = UTC 2026-07-12T15:00:00Z（TZ非依存にするためUTC指定）
var EVENT_END = new Date(Date.UTC(2026, 6, 12, 15, 0, 0));
var MAX_EVENT_SEC = 24 * 3600;

function saveState() {
  writeJSON(scopedKey(STORAGE_KEYS.FINAL_DAY), readInput());
}

function loadState() {
  return readJSON(scopedKey(STORAGE_KEYS.FINAL_DAY));
}

var DEF = buildFinalDayDefaults();

// ============================================================
// UI
// ============================================================
  var el = toolsEl;

  // 入力検証ルール。オプティマイザー本体（validation.js）の範囲に合わせる:
  //   - 楽曲時間そのもの（周年曲・おすすめ楽曲）は実際の楽曲尺に合わせ 60〜180秒
  //   - 画面遷移系は 0 以上（上限なし）
  //   - バッファは負値を許容（-86400〜86400）
  //   - それ以外は 0 以上
  var VALIDATION_RULES = {
    fdHour: { min: 0, integer: true },
    fdMin: { min: 0, integer: true },
    fdSec: { min: 0, integer: true },
    fdBuffer: { min: -86400, max: 86400, integer: true },
    fdTrigger: { min: 0, integer: true },
    fdPoints: { min: 0, integer: true },
    fdCollect: { min: 0 },
    fdRecSong: { min: 60, max: 180 },
    fdAnniv: { min: 60, max: 180 },
    fdArbSong: { min: 60, max: 180 },
    fdMenu: { min: 0 },
    fdEntry: { min: 0 },
    fdExit: { min: 0 },
    fdBetw: { min: 0 },
  };

  function numField(id, label, value, opts) {
    opts = opts || {};
    var wrap = el("div", "field");
    var lbl = el("label");
    lbl.setAttribute("for", id);
    lbl.textContent = label;
    var inp = document.createElement("input");
    inp.type = "number";
    inp.id = id;
    inp.step = opts.step || "1";
    if (opts.min != null) inp.min = String(opts.min);
    if (opts.max != null) inp.max = String(opts.max);
    inp.placeholder = opts.placeholder != null ? String(opts.placeholder) : String(value);
    inp.value = String(value);
    inp.addEventListener("input", function () { validateField(inp); });
    inp.addEventListener("change", saveState);
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    return wrap;
  }

  // ===== 入力検証（未入力・非数値・範囲外を即時フィードバック） =====
  function validateField(input) {
    var rule = VALIDATION_RULES[input.id] || {};
    var raw = input.value.trim();
    var valid = true;
    var msg = "";
    if (raw === "") {
      valid = false;
      msg = "値を入力してください。";
    } else {
      var n = Number(raw);
      if (!Number.isFinite(n)) {
        valid = false;
        msg = "数値を入力してください。";
      } else if (rule.integer && !Number.isInteger(n)) {
        valid = false;
        msg = "整数を入力してください。";
      } else if (rule.min != null && n < rule.min) {
        valid = false;
        msg = rule.min + "以上の値を入力してください。";
      } else if (rule.max != null && n > rule.max) {
        valid = false;
        msg = rule.max + "以下の値を入力してください。";
      }
    }
    setFieldValidity(input, valid, msg);
    return valid;
  }

  function setFieldValidity(input, valid, msg) {
    var wrap = input.parentNode;
    var errEl = wrap.querySelector(".field-error");
    if (valid) {
      input.classList.remove("invalid");
      if (errEl) errEl.remove();
    } else {
      input.classList.add("invalid");
      if (!errEl) {
        errEl = el("div", "field-error");
        wrap.appendChild(errEl);
      }
      errEl.textContent = msg;
    }
  }

  function validateAllFields() {
    var allValid = true;
    Object.keys(VALIDATION_RULES).forEach(function (id) {
      var input = document.getElementById(id);
      if (!input) return;
      if (!validateField(input)) allValid = false;
    });
    return allValid;
  }

  function actionBtn(text, cls, handler) {
    var b = el("button", cls, text);
    b.type = "button";
    b.addEventListener("click", handler);
    return b;
  }

  function num(id, fallback) {
    var e = document.getElementById(id);
    if (!e) return fallback;
    var v = parseFloat(e.value);
    return isFinite(v) ? v : fallback;
  }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.round(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var ss = sec % 60;
    var parts = [];
    if (h > 0) parts.push(h + "時間");
    if (h > 0 || m > 0) parts.push(m + "分");
    parts.push(ss + "秒");
    return parts.join("");
  }

  function fmtNum(n) { return Math.round(n).toLocaleString(); }

  // ===== ステップ構成ヘルパー（既存の tool-heading の縦棒グラデーションを流用） =====
  function buildStep(title, desc) {
    var wrap = el("div", "final-day-step");
    wrap.appendChild(el("h2", "tool-heading", title));
    if (desc) wrap.appendChild(el("p", "tool-desc final-day-step-desc", desc));
    var body = el("div", "final-day-step-body");
    wrap.appendChild(body);
    return { el: wrap, body: body };
  }

  // 「各種時間」ブロック内の小分類（チケット収集時間／楽曲時間／画面遷移時間）
  function settingsSubgroup(title, fieldNodes, isLast, gridCls) {
    var wrap = el("div", "final-day-settings-subgroup" + (isLast ? " is-last" : ""));
    wrap.appendChild(el("p", "group-title", title));
    var grid = el("div", "grid final-day-settings-grid" + (gridCls ? " " + gridCls : ""));
    for (var i = 0; i < fieldNodes.length; i++) grid.appendChild(fieldNodes[i]);
    wrap.appendChild(grid);
    return wrap;
  }

  // ===== 入力パネル（ステップウィザード形式） =====
  function buildInputPanel(container, saved) {
    var v = saved || DEF;
    var wizard = el("div", "final-day-wizard");

    // --- 1. 残りのイベント時間 ---
    var step1 = buildStep(
      "1. 残りのイベント時間",
      "イベント終了時刻（2026/7/13 0:00 JST）までの残り時間を設定します。ボタンから現在時刻を元に自動で入力することもできます。"
    );
    var step1Row = el("div", "final-day-step1-row");
    var timeGrid = el("div", "final-day-time-grid");
    timeGrid.appendChild(numField("fdHour", "時間", v.hour || 0, { min: 0 }));
    timeGrid.appendChild(numField("fdMin", "分", v.min || 0, { min: 0 }));
    timeGrid.appendChild(numField("fdSec", "秒", v.sec || 0, { min: 0 }));
    step1Row.appendChild(timeGrid);
    step1Row.appendChild(actionBtn("現在時刻を元に自動で入力", "counter-action-btn counter-action-btn-sm final-day-autofill-btn", fillFromNow));
    step1.body.appendChild(step1Row);
    wizard.appendChild(step1.el);

    // --- 2. 独自設定（このツール固有で、オプティマイザーには無い項目） ---
    var step2 = buildStep(
      "2. 独自設定",
      "このツール独自の設定で、オプティマイザーには存在しない項目です。"
    );

    var bufferWrap = el("div", "final-day-field-block");
    bufferWrap.appendChild(numField("fdBuffer", "バッファ (秒)", v.buffer != null ? v.buffer : DEF.buffer, { min: -86400, max: 86400 }));
    bufferWrap.appendChild(el("p", "group-desc", "計画完遂後の残り時間の最小値。大きくするほど余裕のある計画、小さくするほど時間ギリギリの計画が出力される。実際のゲームではイベント終了時刻までに開始したライブはそれを過ぎてもポイントが加算されるため、最後の1回分を滑り込ませる想定で負の値を設定することもできる。"));
    step2.body.appendChild(bufferWrap);

    step2.body.appendChild(el("div", "final-day-divider"));

    var arbWrap = el("div", "final-day-field-block");
    arbWrap.appendChild(numField("fdArbSong", "全体最短曲の曲時間 (秒)", v.arbSong != null ? v.arbSong : DEF.arbSong, { min: 60, max: 180 }));
    arbWrap.appendChild(el("p", "group-desc", "おすすめの有無に関わらず、全ての曲の中で最短時間の曲（例: REALISE！！！、Sentimental Venus）の時間。"));
    step2.body.appendChild(arbWrap);

    wizard.appendChild(step2.el);

    // --- 3. オプティマイザーとの共通設定 ---
    var step3 = buildStep(
      "3. オプティマイザーとの共通設定",
      "オプティマイザーと共通の設定です。ボタンをクリックすると、オプティマイザーで保存済みの対応する各項目を読み込めます。"
    );

    var loadRow = el("div", "counter-init-load-row final-day-load-row");
    loadRow.appendChild(actionBtn("オプティマイザーから読み込み", "counter-action-btn counter-action-btn-sm", loadFromOptimizer));
    step3.body.appendChild(loadRow);

    step3.body.appendChild(settingsSubgroup("初期状態", [
      numField("fdPoints", "現在の所持ポイント", v.points != null ? v.points : DEF.points, { min: 0 }),
      numField("fdTrigger", "現在の所持トリガー", v.trigger != null ? v.trigger : DEF.trigger, { min: 0 }),
    ]));
    step3.body.appendChild(el("div", "final-day-divider"));
    step3.body.appendChild(settingsSubgroup("チケット収集時間", [
      numField("fdCollect", "3倍お仕事時の1800枚収集時間 (秒)", v.collect1800 != null ? v.collect1800 : DEF.collect1800, { min: 0, step: "any" }),
    ]));
    step3.body.appendChild(el("div", "final-day-divider"));
    step3.body.appendChild(settingsSubgroup("楽曲時間", [
      numField("fdRecSong", "最終日の最短おすすめ楽曲の曲時間 (秒)", v.recSong != null ? v.recSong : DEF.recSong, { min: 60, max: 180, step: "any" }),
      numField("fdAnniv", "周年曲の曲時間 (秒)", v.anniv != null ? v.anniv : DEF.anniv, { min: 60, max: 180, step: "any" }),
    ]));
    step3.body.appendChild(el("div", "final-day-divider"));
    step3.body.appendChild(settingsSubgroup("画面遷移時間", [
      numField("fdMenu", "メニュー遷移 (秒)", v.menu != null ? v.menu : DEF.menu, { min: 0, step: "any" }),
      numField("fdEntry", "楽曲選択画面→曲開始 (秒)", v.entry != null ? v.entry : DEF.entry, { min: 0, step: "any" }),
      numField("fdExit", "曲終了→楽曲選択画面 (秒)", v.exit != null ? v.exit : DEF.exit, { min: 0, step: "any" }),
      numField("fdBetw", "曲終了→次曲開始（再演） (秒)", v.betw != null ? v.betw : DEF.betw, { min: 0, step: "any" }),
    ], true, "final-day-settings-grid-2col"));

    wizard.appendChild(step3.el);

    // 計算するボタンはカードの外に、中央寄せで置く
    var calcRow = el("div", "final-day-calc-row");
    var calcBtn = actionBtn("▶ 最適化", "primary final-day-calc-btn", runCalc);
    calcBtn.id = "fdCalcBtn";
    calcRow.appendChild(calcBtn);
    wizard.appendChild(calcRow);

    var err = el("div", "final-day-error");
    err.id = "fdError";
    err.style.display = "none";
    wizard.appendChild(err);

    container.appendChild(wizard);
  }

  function fillFromNow() {
    var now = new Date();
    var diff = Math.floor((EVENT_END.getTime() - now.getTime()) / 1000);
    if (diff < 0) diff = 0;
    document.getElementById("fdHour").value = String(Math.floor(diff / 3600));
    document.getElementById("fdMin").value = String(Math.floor((diff % 3600) / 60));
    document.getElementById("fdSec").value = String(diff % 60);
    saveState();
  }

  // オプティマイザーは「最短おすすめ楽曲の曲時間」を単独の設定値として持たず、
  // 最終日（RECOMMENDED_SONGS の最終行）に割り当てられたアイドルの楽曲時間から都度算出している。
  function shortestRecommendedSongTime(s) {
    if (!Array.isArray(s.RECOMMENDED_SONGS) || !Array.isArray(s.SONG_TIMES_SEC_BY_IDOL)) return null;
    var lastDay = s.RECOMMENDED_SONGS[s.RECOMMENDED_SONGS.length - 1];
    if (!Array.isArray(lastDay) || lastDay.length === 0) return null;
    var times = lastDay
      .map(function (idx) { return s.SONG_TIMES_SEC_BY_IDOL[idx]; })
      .filter(function (t) { return Number.isFinite(t); });
    if (times.length === 0) return null;
    return Math.min.apply(null, times);
  }

  function loadFromOptimizer() {
    try {
      var s = loadOptimizerData();
      if (!s) { alert("オプティマイザーの保存データを読み込めません。"); return; }
      var scheduleConfirmed = s.CONFIRMED_RECOMMENDED_SONGS_SCHEDULE !== false;
      var fields = [
        { id: "fdPoints", label: "現在の所持ポイント", value: s.HAVING_POINTS },
        { id: "fdTrigger", label: "現在の所持トリガー", value: s.HAVING_TRIGGER },
        { id: "fdCollect", label: "3倍お仕事時の1800枚収集時間 (秒)", value: s.SECOND_HALF_WORKING_TIME_SEC },
        { id: "fdRecSong", label: "最終日の最短おすすめ楽曲の曲時間 (秒)", value: shortestRecommendedSongTime(s),
          skipReason: !scheduleConfirmed ? "おすすめ楽曲スケジュールが未確定のため" : null },
        { id: "fdAnniv", label: "周年曲の曲時間 (秒)", value: s.ANNIVERSARY_SONG_TIME_SEC },
        { id: "fdMenu", label: "メニュー遷移 (秒)", value: s.MENU_TRANSITION_TIME_SEC },
        { id: "fdEntry", label: "楽曲選択画面→曲開始 (秒)", value: s.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC },
        { id: "fdExit", label: "曲終了→楽曲選択画面 (秒)", value: s.FROM_SONG_END_TO_SONG_SELECT_TIME_SEC },
        { id: "fdBetw", label: "曲終了→次曲開始（再演） (秒)", value: s.TIME_SEC_BETWEEN_SONG_AND_SONG },
      ];
      var changes = [];
      var skipped = [];
      fields.forEach(function (f) {
        if (f.skipReason) {
          skipped.push({ label: f.label, reason: f.skipReason });
        } else if (f.value != null && Number.isFinite(f.value)) {
          changes.push({ id: f.id, label: f.label, prev: num(f.id, 0), next: f.value });
        } else {
          skipped.push({ label: f.label, reason: "オプティマイザーで未定義のため" });
        }
      });
      showLoadDialog(changes, skipped, function () {
        changes.forEach(function (c) {
          var input = document.getElementById(c.id);
          if (input) input.value = String(c.next);
        });
        validateAllFields();
        saveState();
      });
    } catch (e) { alert("読み込みに失敗しました。"); }
  }

  // ===== 読み込み確認モーダル（tools-dialog.js の共通基盤を利用） =====
  var loadDialogHandle = null;

  function showLoadDialog(changes, skipped, onConfirm) {
    closeLoadDialog();

    var body = [];

    body.push(el("p", "counter-dialog-body", "次の項目をオプティマイザーの設定値で上書きします。"));
    var diffList = el("ul", "counter-dialog-diff-list");
    changes.forEach(function (c) {
      diffList.appendChild(makeDialogDiffItem(c.label, c.prev, c.next));
    });
    body.push(diffList);

    if (skipped.length > 0) {
      body.push(el("p", "counter-dialog-body fd-dialog-skip-heading", "次の項目は読み込みをスキップします。"));
      var skipList = el("ul", "counter-dialog-diff-list fd-dialog-skip-list");
      skipped.forEach(function (s) {
        skipList.appendChild(makeDialogSkipItem(s.label, s.reason));
      });
      body.push(skipList);
    }

    var buttons = [];
    buttons.push({ text: "読み込む", className: "counter-dialog-primary", handler: function () {
      closeLoadDialog();
      if (onConfirm) onConfirm();
    }});
    buttons.push({ text: "キャンセル", className: "counter-dialog-cancel", handler: function () {
      closeLoadDialog();
    }});

    loadDialogHandle = showDialog({
      id: "finalDayLoadDialog",
      title: "オプティマイザーから読み込みますか？",
      body: body,
      buttons: buttons,
    });
  }

  function makeDialogSkipItem(label, reason) {
    var li = el("li", "counter-dialog-diff-item fd-dialog-skip-item");
    li.appendChild(el("span", "counter-dialog-diff-label", label));
    li.appendChild(el("span", "fd-dialog-skip-reason", reason));
    return li;
  }

  function closeLoadDialog() {
    if (loadDialogHandle) loadDialogHandle.close();
    loadDialogHandle = null;
  }

  function showError(msg) {
    var e = document.getElementById("fdError");
    e.textContent = msg;
    e.style.display = msg ? "block" : "none";
  }

  function readInput() {
    var h = Math.max(0, Math.round(num("fdHour", 0)));
    var m = Math.max(0, Math.round(num("fdMin", 0)));
    var sc = Math.max(0, Math.round(num("fdSec", 0)));
    var remainSec = h * 3600 + m * 60 + sc;
    var buffer = Math.round(num("fdBuffer", DEF.buffer));
    return {
      hour: h, min: m, sec: sc,
      remainSec: remainSec,
      buffer: buffer,
      T: remainSec - buffer,
      trigger: Math.max(0, Math.round(num("fdTrigger", 0))),
      points: Math.max(0, Math.round(num("fdPoints", 0))),
      recSong: Math.max(0, num("fdRecSong", DEF.recSong)),
      arbSong: Math.max(0, num("fdArbSong", DEF.arbSong)),
      collect1800: Math.max(0, num("fdCollect", DEF.collect1800)),
      anniv: Math.max(0, num("fdAnniv", DEF.anniv)),
      menu: Math.max(0, num("fdMenu", DEF.menu)),
      entry: Math.max(0, num("fdEntry", DEF.entry)),
      exit: Math.max(0, num("fdExit", DEF.exit)),
      betw: Math.max(0, num("fdBetw", DEF.betw)),
    };
  }

  function runCalc() {
    trackEvent("final_day_calc");
    showError("");
    if (!validateAllFields()) {
      showError("入力内容にエラーがあります。該当項目をご確認ください。");
      renderResult(null);
      return;
    }
    var inp = readInput();
    saveState();
    if (inp.remainSec > MAX_EVENT_SEC) {
      showError("残り時間が24時間より大きいです。このツールは最終日（残り24時間以下）用です。");
      renderResult(null);
      return;
    }
    if (inp.T <= 0) {
      showError("バッファを差し引いた稼働可能時間が0以下です。");
      renderResult(null);
      return;
    }
    var btn = document.getElementById("fdCalcBtn");
    btn.disabled = true;
    btn.classList.add("is-loading");
    btn.textContent = "計算中…";
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      try {
        var res = solve(inp);
        renderResult(res);
      } finally {
        btn.disabled = false;
        btn.classList.remove("is-loading");
        btn.textContent = "▶ 最適化";
      }
    }); });
  }

  // ===== 結果描画 =====
  function renderResult(res) {
    var host = document.getElementById("finalDayResult");
    host.innerHTML = "";
    if (!res) return;

    var panel = el("div", "final-day-step final-day-result-step");
    panel.appendChild(el("h2", "tool-heading", "最適化結果"));

    // サマリーカード
    var cards = el("div", "summary-cards");
    cards.appendChild(summaryCard("最終ポイント", fmtNum(res.settings.points + res.finalGain), true));
    cards.appendChild(summaryCard("追加獲得ポイント", fmtNum(res.finalGain), false));
    var usedTime = totalStepTime(buildSteps(res));
    cards.appendChild(summaryCard("所要時間", fmtDuration(usedTime), false));
    cards.appendChild(summaryCard("残り時間", fmtDuration(res.T - usedTime + res.settings.buffer), false));
    panel.appendChild(cards);

    // 行動詳細表
    panel.appendChild(buildDetailTable(res));

    host.appendChild(panel);
    host.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function summaryCard(label, value, primary) {
    var c = el("div", "summary-card" + (primary ? " primary" : ""));
    c.appendChild(el("div", "sc-label", label));
    c.appendChild(el("div", "sc-value", value));
    return c;
  }

  function totalStepTime(steps) {
    return steps.reduce(function (sum, step) { return sum + step.time; }, 0);
  }

  // ===== 行動詳細表（オプティマイザーの detail-table 形式に準拠） =====
  function buildDetailTable(res) {
    var steps = buildSteps(res);

    var scroll = el("div", "detail-table-scroll");
    var table = el("table", "detail-table");

    var thead = document.createElement("thead");
    var htr = el("tr");
    htr.appendChild(el("th", "detail-no", ""));
    htr.appendChild(el("th", "detail-act", "行動"));
    htr.appendChild(el("th", null, "獲得ポイント"));
    htr.appendChild(el("th", null, "所要時間"));
    htr.appendChild(el("th", null, "累積所要時間"));
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    var cumTime = 0;
    for (var i = 0; i < steps.length; i++) {
      var st = steps[i];
      cumTime += st.time;
      var tr = el("tr");
      tr.appendChild(el("td", "detail-no", String(i + 1)));
      var actTd = el("td", "detail-act");
      actTd.appendChild(document.createTextNode(st.desc));
      if (st.bullets) {
        var blist = el("div", "detail-bullets");
        for (var b = 0; b < st.bullets.length; b++) {
          blist.appendChild(el("div", null, "・" + st.bullets[b]));
        }
        actTd.appendChild(blist);
      }
      tr.appendChild(actTd);
      tr.appendChild(el("td", null, fmtNum(st.points)));
      tr.appendChild(el("td", null, fmtDuration(st.time)));
      tr.appendChild(el("td", null, fmtDuration(cumTime)));
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    return scroll;
  }

  // 行動ステップを チケット系 → スタミナ消費系 → トリガー消費系（周年曲）の順に生成
  function buildSteps(res) {
    var s = res.settings;
    var steps = [];
    var itemById = {};
    res.items.forEach(function (it) { itemById[it.id] = it; });

    // --- チケット系（1800枚のものを先、それ未満を後に） ---
    var ticketIds = Object.keys(res.ticketUsed).sort(function (a, b) {
      return itemById[b].r - itemById[a].r;
    });
    ticketIds.forEach(function (id) {
      var it = itemById[id];
      var cnt = res.ticketUsed[id];
      var bullets = [];
      bullets.push("お仕事でライブチケットを" + it.r + "枚集める。");
      if (it.c1 > 0) {
        bullets.push("チケット" + it.s1 + "枚消費ライブで" + it.variantName + "を" + it.c1 + "回プレイ。");
      }
      if (it.c2 > 0) {
        bullets.push("チケット" + it.s2 + "枚消費ライブで" + it.variantName + "を" + it.c2 + "回プレイ。");
      }
      var desc = cnt > 1 ? "以下を" + cnt + "回繰り返す。" : "";
      steps.push({ desc: desc, bullets: bullets.length > 0 ? bullets : null, points: it.value * cnt, time: it.cost * cnt });
    });

    // --- スタミナ消費系（最終日おすすめ最短曲を先に） ---
    if (res.recPlays > 0) {
      steps.push({
        desc: "スタミナ3倍消費ライブの難易度MMで最終日おすすめ最短曲を" + res.recPlays + "回プレイ。",
        bullets: null,
        points: STAMINA_REC * res.recPlays,
        time: loopTime(s.recSong, res.recPlays, s),
      });
    }
    if (res.arbPlays > 0) {
      steps.push({
        desc: "スタミナ3倍消費ライブの難易度MMで全体最短曲を" + res.arbPlays + "回プレイ。",
        bullets: null,
        points: STAMINA_NON * res.arbPlays,
        time: loopTime(s.arbSong, res.arbPlays, s),
      });
    }

    // --- トリガー消費系（周年曲）: 倍率降順（4倍→2倍→1倍）で別セッション ---
    var term = res.term;
    if (term.n4 > 0) {
      steps.push({
        desc: "周年曲4倍ライブを" + term.n4 + "回プレイ。",
        bullets: null,
        points: term.n4 * 4 * POINT_BY_STANDARD_TRIGGER,
        time: loopTime(s.anniv, term.n4, s),
      });
    }
    if (term.n2 > 0) {
      steps.push({
        desc: "周年曲2倍ライブを" + term.n2 + "回プレイ。",
        bullets: null,
        points: term.n2 * 2 * POINT_BY_STANDARD_TRIGGER,
        time: loopTime(s.anniv, term.n2, s),
      });
    }
    if (term.n1 > 0) {
      steps.push({
        desc: "周年曲1倍ライブを" + term.n1 + "回プレイ。",
        bullets: null,
        points: term.n1 * POINT_BY_STANDARD_TRIGGER,
        time: loopTime(s.anniv, term.n1, s),
      });
    }

    return steps;
  }

  function init() {
    var container = document.getElementById("finalDayApp");
    if (!container) return;
    var saved = loadState();
    buildInputPanel(container, saved);
    var result = el("div");
    result.id = "finalDayResult";
    container.appendChild(result);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
