"use strict";

(function () {
  var PLAY_TYPES = {
    login:       { label: "ログイントリガー",      shortLabel: "ログイン",  pt: 0,  tr: 540,     buttons: [{ delta: -1 }, { delta: 1 }] },
    mission:     { label: "おすすめ楽曲ミッション",  pt: 0, tr: 1000,     buttons: [{ delta: -4 }, { delta: -1 }, { delta: 1 }, { delta: 4 }] },
    anniversary4x:     { label: "周年曲4倍ライブ",        pt: 2148, tr: -720,  buttons: [{ delta: -1 }, { delta: 1 }] },
    anniversary10x:    { label: "周年曲10倍ライブ",       pt: 5370, tr: -1800, buttons: [{ delta: -1 }, { delta: 1 }] },
    anniversaryBoost:  { label: "ブースト回数", logLabel: "周年曲ブースト", pt: 2148, tr: 0,     buttons: [{ delta: -10 }, { delta: -1 }, { delta: 1 }, { delta: 10 }],
      cap: function (c) { return c.anniversary4x; }, capLabel: "4倍のプレイ回数" },
    normal1800:  { label: "チケット450枚消費ライブ×4", pt: 4284, tr: 4284,  buttons: [{ delta: -1 }, { delta: 1 }] },
    normal450:   { label: "チケット450枚消費ライブ単発", pt: 1071, tr: 1071,  buttons: [{ delta: -1 }, { delta: 1 }] },
    normalBoost: { label: "ブースト回数", logLabel: "通常曲ブースト", pt: 1071, tr: 1071,  buttons: [{ delta: -10 }, { delta: -1 }, { delta: 1 }, { delta: 10 }],
      cap: function (c) { return c.normal1800 * 4 + c.normal450; }, capLabel: "通常曲の合計プレイ回数" },
  };

  var ROWS = [
    { group: "デイリー",             ids: ["login", "mission"] },
    { group: "通常曲（おすすめ楽曲）", ids: ["normal1800", "normal450"] },
    { group: null,                  ids: ["normalBoost"] },
    { group: "周年曲",              ids: ["anniversary4x", "anniversary10x"] },
    { group: null,                  ids: ["anniversaryBoost"] },
  ];

  var OPTIMIZER_STORAGE_KEY = "mltd9th_simulator_state_v1";
  var COUNTER_STORAGE_KEY = "mltd9th_counter_state_v1";
  var HISTORY_MAX = 1000;
  var counts = {};
  var initialPt = 0;
  var initialTr = 0;
  // ログに記録済みの初期値（手入力の差分ログ用の基準）
  var loggedInitPt = 0;
  var loggedInitTr = 0;
  var history = [];
  var pendingInitialChange = null;

  function saveCounterState() {
    try {
      var data = { counts: counts, initialPt: initialPt, initialTr: initialTr, history: history };
      localStorage.setItem(COUNTER_STORAGE_KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }

  function loadCounterState() {
    try {
      var raw = localStorage.getItem(COUNTER_STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data) return;
      if (data.counts) {
        Object.keys(PLAY_TYPES).forEach(function (id) {
          if (typeof data.counts[id] === "number") counts[id] = Math.max(0, data.counts[id]);
        });
      }
      if (typeof data.initialPt === "number") initialPt = data.initialPt;
      if (typeof data.initialTr === "number") initialTr = data.initialTr;
      if (Array.isArray(data.history)) history = data.history.slice(0, HISTORY_MAX);
    } catch (e) { /* ignore */ }
  }

  function init() {
    var container = document.getElementById("counterApp");
    if (!container) return;
    Object.keys(PLAY_TYPES).forEach(function (id) { counts[id] = 0; });
    loadCounterState();
    loggedInitPt = initialPt;
    loggedInitTr = initialTr;
    buildResultBar();
    buildUI(container);
    recalc();
  }

  function buildResultBar() {
    var bar = document.getElementById("counterResultBar");
    if (!bar) return;
    bar.className = "counter-panel";

    var heading = document.createElement("h2");
    heading.className = "tool-heading";
    heading.textContent = "プレイ後の所持ポイント・トリガー";
    bar.appendChild(heading);

    var desc = document.createElement("p");
    desc.className = "tool-desc";
    desc.textContent = "初期値を基準としてカウンターに記録された分だけプレイした後のポイント・トリガー数です。その値をオプティマイザーの初期状態に反映することができます。";
    bar.appendChild(desc);

    var toolbar = document.createElement("div");
    toolbar.className = "counter-result-toolbar";
    var applyBtn = makeActionBtn("オプティマイザーに反映", "counter-result-apply-btn", writeToOptimizer);
    applyBtn.id = "btnApplyOptimizer";
    toolbar.appendChild(applyBtn);
    bar.appendChild(toolbar);

    var cards = document.createElement("div");
    cards.className = "summary-cards";
    cards.innerHTML =
      '<div class="summary-card primary">' +
        '<div class="sc-label">ポイント</div>' +
        '<div class="sc-value" id="resultPt">0</div>' +
        '<div class="counter-result-diff" id="diffPt"></div>' +
      '</div>' +
      '<div class="summary-card primary">' +
        '<div class="sc-label">トリガー</div>' +
        '<div class="sc-value" id="resultTr">0</div>' +
        '<div class="counter-result-diff" id="diffTr"></div>' +
      '</div>';
    bar.appendChild(cards);

    buildStickyBar();
  }

  // スクロールで詳細パネルが画面外に出たときだけ上部に表示する一行バー
  function buildStickyBar() {
    if (document.getElementById("counterStickyBar")) return;
    var sticky = document.createElement("div");
    sticky.id = "counterStickyBar";
    sticky.innerHTML =
      '<div class="csb-inner">' +
        '<span class="csb-item"><span class="csb-label">ポイント</span>' +
          '<span class="csb-value" id="stickyPt">0</span></span>' +
        '<span class="csb-item"><span class="csb-label">トリガー</span>' +
          '<span class="csb-value" id="stickyTr">0</span></span>' +
      '</div>';
    document.body.appendChild(sticky);

    var panel = document.getElementById("counterResultBar");
    if (panel && "IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function (entries) {
        var entry = entries[0];
        // パネルが上方向へスクロールアウトした（上端が画面外）ときのみ表示
        var scrolledPast = !entry.isIntersecting && entry.boundingClientRect.top < 0;
        sticky.classList.toggle("visible", scrolledPast);
      });
      observer.observe(panel);
    }
  }

  function buildUI(container) {
    container.innerHTML = "";

    var details = document.createElement("div");
    details.className = "counter-panel counter-init";
    var initHeading = document.createElement("h2");
    initHeading.className = "tool-heading";
    initHeading.textContent = "初期値";
    details.appendChild(initHeading);
    var initDesc = document.createElement("p");
    initDesc.className = "tool-desc";
    initDesc.textContent = "基準となるポイント・トリガーを入力してください。";
    details.appendChild(initDesc);

    var loadRow = document.createElement("div");
    loadRow.className = "counter-init-load-row";
    loadRow.appendChild(makeActionBtn("オプティマイザーから読込", "counter-action-btn counter-action-btn-sm", loadFromOptimizer));
    details.appendChild(loadRow);

    var initGrid = document.createElement("div");
    initGrid.className = "counter-init-grid";
    initGrid.appendChild(makeNumberField("counterInitPt", "初期ポイント", initialPt, "warn_counterInitPt"));
    initGrid.appendChild(makeNumberField("counterInitTr", "初期トリガー", initialTr, "warn_counterInitTr"));
    details.appendChild(initGrid);
    container.appendChild(details);

    // 入力確定時（フォーカスアウト等）に差分があればログへ。1文字ごとには記録しない
    document.getElementById("counterInitPt").addEventListener("change", function () {
      var v = parseInt(this.value, 10) || 0;
      changeInitialValues(v, initialTr, {
        action: "initialPoint",
        op: "初期ポイントを変更",
        cancel: syncInitialInputs
      });
    });
    document.getElementById("counterInitTr").addEventListener("change", function () {
      var v = parseInt(this.value, 10) || 0;
      changeInitialValues(initialPt, v, {
        action: "initialTrigger",
        op: "初期トリガーを変更",
        cancel: syncInitialInputs
      });
    });

    var section = document.createElement("div");
    section.className = "counter-panel counter-section";

    var sectionHeading = document.createElement("h2");
    sectionHeading.className = "tool-heading";
    sectionHeading.textContent = "カウンター";
    section.appendChild(sectionHeading);
    var sectionDesc = document.createElement("p");
    sectionDesc.className = "tool-desc";
    sectionDesc.textContent = "ログインやライブなどのプレイ回数を「±」ボタンで記録してください。";
    section.appendChild(sectionDesc);

    var sectionActions = document.createElement("div");
    sectionActions.className = "counter-section-actions";
    var resetBtn = makeActionBtn("リセット", "counter-reset-btn", resetCounts);
    resetBtn.id = "btnResetCounts";
    sectionActions.appendChild(resetBtn);
    section.appendChild(sectionActions);

    ROWS.forEach(function (row) {
      if (row.group) {
        var title = document.createElement("div");
        title.className = "counter-group-title";
        var chip = document.createElement("span");
        chip.className = "counter-group-chip";
        chip.textContent = row.group;
        title.appendChild(chip);
        section.appendChild(title);
      }
      section.appendChild(buildRow(row.ids));
    });
    container.appendChild(section);

    var histSection = document.createElement("div");
    histSection.className = "counter-panel counter-history";
    var histHeading = document.createElement("h2");
    histHeading.className = "tool-heading";
    histHeading.textContent = "操作ログ";
    histSection.appendChild(histHeading);
    var histDesc = document.createElement("p");
    histDesc.className = "tool-desc";
    histDesc.textContent = "直近" + HISTORY_MAX + "件の操作ログです。";
    histSection.appendChild(histDesc);

    var histActions = document.createElement("div");
    histActions.className = "counter-section-actions";
    histActions.appendChild(makeActionBtn("CSV出力", "counter-action-btn counter-action-btn-sm", exportHistoryCsv));
    histSection.appendChild(histActions);

    var histList = document.createElement("ol");
    histList.id = "counterHistory";
    histList.className = "counter-history-list";
    histSection.appendChild(histList);
    container.appendChild(histSection);
    renderHistory();
  }

  function makeActionBtn(text, className, handler) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.className = className;
    btn.addEventListener("click", handler);
    return btn;
  }

  function makeNumberField(id, label, value, warningId) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    var lbl = document.createElement("label");
    lbl.setAttribute("for", id);
    lbl.textContent = label;
    var inp = document.createElement("input");
    inp.type = "number";
    inp.id = id;
    inp.step = "1";
    inp.value = String(value);
    wrap.appendChild(lbl);
    wrap.appendChild(inp);
    if (warningId) {
      var warning = document.createElement("div");
      warning.className = "counter-warning";
      warning.id = warningId;
      warning.style.display = "none";
      wrap.appendChild(warning);
    }
    return wrap;
  }

  function valueClass(v) {
    return v > 0 ? "counter-val-pos" : v < 0 ? "counter-val-neg" : "counter-val-zero";
  }

  function formatSigned(v) {
    var sign = v > 0 ? "+" : "";
    return sign + v.toLocaleString();
  }

  function makeSpacer() {
    var sp = document.createElement("span");
    sp.className = "counter-btn-spacer";
    return sp;
  }

  function buildRow(ids) {
    var row = document.createElement("div");
    row.className = "counter-row";

    ids.forEach(function (id) {
      var type = PLAY_TYPES[id];
      var card = document.createElement("div");
      card.className = "counter-card";
      card.id = "card_" + id;

      var info = document.createElement("div");
      info.className = "counter-card-info";

      var lbl = document.createElement("div");
      lbl.className = "counter-card-label";
      lbl.textContent = type.shortLabel || type.label;
      info.appendChild(lbl);

      var unit = document.createElement("div");
      unit.className = "counter-card-unit";
      unit.innerHTML =
        '<span class="counter-metric"><span class="counter-metric-label">Pt</span>' +
          '<span class="counter-metric-value ' + valueClass(type.pt) + '">' + formatSigned(type.pt) + '</span></span>' +
        '<span class="counter-metric"><span class="counter-metric-label">Tr</span>' +
          '<span class="counter-metric-value ' + valueClass(type.tr) + '">' + formatSigned(type.tr) + '</span></span>';
      info.appendChild(unit);

      card.appendChild(info);

      var controls = document.createElement("div");
      controls.className = "counter-card-controls";

      var minusBtns = [];
      var plusBtns = [];
      type.buttons.forEach(function (b) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "counter-btn " + (b.delta > 0 ? "counter-btn-plus" : "counter-btn-minus");
        if (Math.abs(b.delta) >= 4) btn.classList.add("counter-btn-large");
        btn.dataset.delta = String(b.delta);
        btn.textContent = (b.delta > 0 ? "+" : "") + b.delta;
        btn.addEventListener("click", function () {
          var prev = counts[id];
          counts[id] = Math.max(0, counts[id] + b.delta);
          if (counts[id] !== prev) {
            var sign = b.delta > 0 ? "+" : "";
            var label = type.logLabel || type.shortLabel || type.label;
            addHistory({
              action: id + "_" + sign + b.delta,
              op: label + " " + sign + b.delta
            });
          }
          recalc();
        });
        if (b.delta < 0) minusBtns.push(btn); else plusBtns.push(btn);
      });

      minusBtns.forEach(function (btn, i) {
        controls.appendChild(btn);
        if (i < minusBtns.length - 1) controls.appendChild(makeSpacer());
      });
      var countEl = document.createElement("span");
      countEl.className = "counter-count";
      countEl.id = "count_" + id;
      countEl.textContent = String(counts[id]);
      controls.appendChild(countEl);
      plusBtns.forEach(function (btn, i) {
        if (i > 0) controls.appendChild(makeSpacer());
        controls.appendChild(btn);
      });

      card.appendChild(controls);

      var warning = document.createElement("div");
      warning.className = "counter-warning";
      warning.id = "warn_" + id;
      warning.style.display = "none";
      card.appendChild(warning);

      row.appendChild(card);
    });

    return row;
  }

  function formatDiff(value) {
    var sign = value >= 0 ? "+" : "";
    return sign + value.toLocaleString();
  }

  // 現在のカウント状態からの合計ポイント・トリガーを算出（DOM 非依存・cap 反映）
  function computeTotals() {
    var pt = initialPt;
    var tr = initialTr;
    Object.keys(PLAY_TYPES).forEach(function (id) {
      var t = PLAY_TYPES[id];
      var c = counts[id];
      if (t.cap) c = Math.min(c, t.cap(counts));
      pt += t.pt * c;
      tr += t.tr * c;
    });
    return { pt: pt, tr: tr };
  }

  function hasAnyCount() {
    return Object.keys(PLAY_TYPES).some(function (id) { return counts[id] > 0; });
  }

  function clearCounterRecords() {
    Object.keys(PLAY_TYPES).forEach(function (id) { counts[id] = 0; });
    history = [];
    renderHistory();
  }

  function syncInitialInputs() {
    var ptEl = document.getElementById("counterInitPt");
    var trEl = document.getElementById("counterInitTr");
    if (ptEl) ptEl.value = String(initialPt);
    if (trEl) trEl.value = String(initialTr);
  }

  function applyInitialValues(nextPt, nextTr, options) {
    initialPt = nextPt;
    initialTr = nextTr;
    syncInitialInputs();
    loggedInitPt = initialPt;
    loggedInitTr = initialTr;
    if (options && options.action) {
      addHistory({ action: options.action, op: options.op });
    }
    recalc();
    if (options && options.toast) showToast(options.toast);
  }

  function changeInitialValues(nextPt, nextTr, options) {
    var changed = nextPt !== initialPt || nextTr !== initialTr;
    if (!changed) {
      syncInitialInputs();
      if (options && options.toast) showToast(options.toast);
      return;
    }

    var proceed = function (shouldReset) {
      if (shouldReset) clearCounterRecords();
      applyInitialValues(nextPt, nextTr, options);
    };

    if (hasAnyCount()) {
      showInitialChangeDialog({
        onReset: function () { proceed(true); },
        onKeep: function () { proceed(false); },
        onCancel: function () {
          if (options && typeof options.cancel === "function") options.cancel();
        }
      });
      return;
    }

    proceed(false);
  }

  function showInitialChangeDialog(handlers) {
    closeInitialChangeDialog();
    pendingInitialChange = handlers;

    var overlay = document.createElement("div");
    overlay.className = "counter-dialog-overlay";
    overlay.id = "counterInitialChangeDialog";
    overlay.setAttribute("role", "presentation");

    var dialog = document.createElement("div");
    dialog.className = "counter-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "counterInitialChangeTitle");

    var title = document.createElement("h2");
    title.className = "counter-dialog-title";
    title.id = "counterInitialChangeTitle";
    title.textContent = "カウント記録が残っています";
    dialog.appendChild(title);

    var body = document.createElement("p");
    body.className = "counter-dialog-body";
    body.textContent = "初期値を変更すると、これまでのカウントは新しい初期値からの差分として再計算されます。カウント記録をどうしますか？";
    dialog.appendChild(body);

    var actions = document.createElement("div");
    actions.className = "counter-dialog-actions";

    actions.appendChild(makeDialogBtn("リセットして変更", "counter-dialog-primary", function () {
      var current = pendingInitialChange;
      closeInitialChangeDialog();
      if (current && current.onReset) current.onReset();
    }));
    actions.appendChild(makeDialogBtn("残したまま変更", "counter-dialog-secondary", function () {
      var current = pendingInitialChange;
      closeInitialChangeDialog();
      if (current && current.onKeep) current.onKeep();
    }));
    actions.appendChild(makeDialogBtn("キャンセル", "counter-dialog-cancel", function () {
      var current = pendingInitialChange;
      closeInitialChangeDialog();
      if (current && current.onCancel) current.onCancel();
    }));

    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", handleInitialChangeDialogKeydown);
    var primary = dialog.querySelector(".counter-dialog-primary");
    if (primary) primary.focus();
  }

  function makeDialogBtn(text, className, handler) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "counter-dialog-btn " + className;
    btn.textContent = text;
    btn.addEventListener("click", handler);
    return btn;
  }

  function closeInitialChangeDialog() {
    var existing = document.getElementById("counterInitialChangeDialog");
    if (existing) existing.remove();
    document.removeEventListener("keydown", handleInitialChangeDialogKeydown);
    pendingInitialChange = null;
  }

  function handleInitialChangeDialogKeydown(event) {
    if (event.key !== "Escape") return;
    var current = pendingInitialChange;
    closeInitialChangeDialog();
    if (current && current.onCancel) current.onCancel();
  }

  function updateInitialWarnings() {
    var warnings = [
      { id: "warn_counterInitPt", value: initialPt, label: "初期ポイント" },
      { id: "warn_counterInitTr", value: initialTr, label: "初期トリガー" }
    ];
    warnings.forEach(function (warning) {
      var el = document.getElementById(warning.id);
      if (!el) return;
      if (warning.value < 0) {
        el.textContent = warning.label + "が負の値です。確認してください。";
        el.style.display = "";
      } else {
        el.style.display = "none";
      }
    });
  }

  function recalc() {
    updateInitialWarnings();

    var totals = computeTotals();
    var totalPt = totals.pt;
    var totalTr = totals.tr;

    Object.keys(PLAY_TYPES).forEach(function (id) {
      var t = PLAY_TYPES[id];
      var warnEl = document.getElementById("warn_" + id);
      if (t.cap && warnEl) {
        var capVal = t.cap(counts);
        if (counts[id] > capVal) {
          warnEl.textContent = t.capLabel + "（" + capVal + " 回）を超えています。" + capVal + " 回として計算します。";
          warnEl.style.display = "";
        } else {
          warnEl.style.display = "none";
        }
      }

      var countEl = document.getElementById("count_" + id);
      if (countEl) countEl.textContent = String(counts[id]);

      var card = document.getElementById("card_" + id);
      if (card) {
        card.querySelectorAll(".counter-btn-minus").forEach(function (btn) {
          var delta = Math.abs(parseInt(btn.dataset.delta, 10) || 0);
          btn.disabled = counts[id] < delta;
        });
      }
    });

    document.getElementById("resultPt").textContent = totalPt.toLocaleString();
    document.getElementById("resultTr").textContent = totalTr.toLocaleString();

    var stickyPtEl = document.getElementById("stickyPt");
    var stickyTrEl = document.getElementById("stickyTr");
    if (stickyPtEl) stickyPtEl.textContent = totalPt.toLocaleString();
    if (stickyTrEl) stickyTrEl.textContent = totalTr.toLocaleString();

    var deltaPt = totalPt - initialPt;
    var deltaTr = totalTr - initialTr;
    var diffPtEl = document.getElementById("diffPt");
    var diffTrEl = document.getElementById("diffTr");
    if (diffPtEl) {
      diffPtEl.textContent = formatDiff(deltaPt);
      diffPtEl.className = "counter-result-diff" + (deltaPt > 0 ? " diff-pos" : deltaPt < 0 ? " diff-neg" : "");
    }
    if (diffTrEl) {
      diffTrEl.textContent = formatDiff(deltaTr);
      diffTrEl.className = "counter-result-diff" + (deltaTr > 0 ? " diff-pos" : deltaTr < 0 ? " diff-neg" : "");
    }
    saveCounterState();
  }

  function resetCounts() {
    if (!confirm("すべてのカウントと操作ログをリセットします。よろしいですか？")) return;
    clearCounterRecords();
    // pt/tr は他の操作と同様、操作後（＝初期値に戻った後）の合計を記録する
    addHistory({ action: "reset", op: "カウントと操作ログをリセット" });
    recalc();
  }

  function loadFromOptimizer() {
    try {
      var raw = localStorage.getItem(OPTIMIZER_STORAGE_KEY);
      if (!raw) { showToast("オプティマイザーの保存データが見つかりません。"); return; }
      var data = JSON.parse(raw);
      if (!data || !data.setting) { showToast("オプティマイザーの保存データを読み込めませんでした。"); return; }
      var pt = data.setting.HAVING_POINTS;
      var tr = data.setting.HAVING_TRIGGER;
      changeInitialValues(
        (typeof pt === "number" && Number.isFinite(pt)) ? pt : initialPt,
        (typeof tr === "number" && Number.isFinite(tr)) ? tr : initialTr,
        {
          action: "loadOptimizer",
          op: "オプティマイザーから読み込み",
          toast: "オプティマイザーから読み込みました。"
        }
      );
    } catch (e) { showToast("読み込みに失敗しました。"); }
  }

  function writeToOptimizer() {
    try {
      var raw = localStorage.getItem(OPTIMIZER_STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (!data || !data.setting) {
        showToast("オプティマイザーの保存データが見つかりません。先にオプティマイザーを一度開いてください。");
        return;
      }
      var totals = computeTotals();
      var resultPt = totals.pt;
      var resultTr = totals.tr;
      if (resultPt < 0) {
        showToast("ポイントが負の値のため、オプティマイザーへ反映できません。");
        return;
      }
      if (resultTr < 0) {
        showToast("トリガーが負の値のため、オプティマイザーへ反映できません。");
        return;
      }
      data.setting.HAVING_POINTS = resultPt;
      data.setting.HAVING_TRIGGER = resultTr;
      localStorage.setItem(OPTIMIZER_STORAGE_KEY, JSON.stringify(data));
      addHistory({ action: "applyOptimizer", pt: resultPt, tr: resultTr, op: "オプティマイザーへ反映" });
      saveCounterState(); // 遷移前に永続化（recalc は走らない）
      window.location.href = "index.html#highlight=HAVING";
    } catch (e) { showToast("反映に失敗しました。"); }
  }

  // fields: { op（操作列）, action（操作の識別子）, pt, tr（省略時はその時点の合計を算出） }
  function addHistory(fields) {
    var totals = (fields.pt != null && fields.tr != null)
      ? { pt: fields.pt, tr: fields.tr }
      : computeTotals();
    var entry = { ts: Date.now(), pt: totals.pt, tr: totals.tr };
    if (fields.op != null) entry.op = fields.op;
    if (fields.action != null) entry.action = fields.action;
    history.unshift(entry);
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    renderHistory();
    // 永続化は呼び出し側の recalc() に一本化する（二重書き込みを避ける）
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  // 保存済みエントリは新形式（ts）と旧形式（time 文字列のみ）が混在しうる
  function entryDate(entry) {
    return typeof entry.ts === "number" ? new Date(entry.ts) : null;
  }

  function formatEntryTime(entry) {
    var d = entryDate(entry);
    if (!d) return entry.time || "";
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
  }

  function formatEntryDateTime(entry) {
    var d = entryDate(entry);
    if (!d) return entry.time || "";
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) + " " + formatEntryTime(entry);
  }

  function csvEscape(value) {
    var s = String(value);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportHistoryCsv() {
    if (history.length === 0) { showToast("出力できる操作ログがありません。"); return; }
    var rows = [["datetime", "action", "point", "trigger"]];
    // 画面は新しい順だが、CSV は古い順（時系列）で出力する
    history.slice().reverse().forEach(function (entry) {
      rows.push([
        formatEntryDateTime(entry),
        entry.action != null ? entry.action : "",
        entry.pt != null ? entry.pt : "",
        entry.tr != null ? entry.tr : ""
      ]);
    });
    var csv = rows.map(function (row) {
      return row.map(csvEscape).join(",");
    }).join("\r\n");

    var now = new Date();
    var stamp = now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) +
      "-" + pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds());

    // 先頭に BOM を付与して Excel での文字化けを防ぐ
    var blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "counter-history-" + stamp + ".csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function makeHistoryCell(className, text) {
    var span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    return span;
  }

  function renderHistory() {
    var list = document.getElementById("counterHistory");
    if (!list) return;
    list.innerHTML = "";

    // ヘッダー行（スクロールしても固定）
    var head = document.createElement("li");
    head.className = "counter-history-head";
    head.appendChild(makeHistoryCell("counter-history-time", "時刻"));
    head.appendChild(makeHistoryCell("counter-history-op", "操作"));
    head.appendChild(makeHistoryCell("counter-history-num", "ポイント"));
    head.appendChild(makeHistoryCell("counter-history-num", "トリガー"));
    list.appendChild(head);

    if (history.length === 0) {
      var empty = document.createElement("li");
      empty.className = "counter-history-empty";
      empty.textContent = "操作ログはありません。";
      list.appendChild(empty);
      return;
    }

    // history は新しい順で保持。表示は古い→新しいで下に積む
    for (var i = history.length - 1; i >= 0; i--) {
      var entry = history[i];
      var li = document.createElement("li");
      li.className = "counter-history-item";

      li.appendChild(makeHistoryCell("counter-history-time", formatEntryTime(entry)));

      // 旧形式（text のみ）のエントリは操作列にまとめて表示する
      li.appendChild(makeHistoryCell("counter-history-op", entry.op != null ? entry.op : (entry.text || "")));

      // Pt / Tr は操作後の合計
      li.appendChild(makeNumberCell(entry.pt));
      li.appendChild(makeNumberCell(entry.tr));

      list.appendChild(li);
    }

    // 最新（＝一番下）が見えるようにスクロール位置を末尾へ
    list.scrollTop = list.scrollHeight;
  }

  function makeNumberCell(value) {
    var span = document.createElement("span");
    span.className = "counter-history-num";
    if (value == null) {
      span.textContent = "–";
      span.classList.add("is-empty");
      return span;
    }
    span.textContent = value.toLocaleString();
    return span;
  }

  function showToast(msg) {
    var existing = document.querySelector(".counter-toast");
    if (existing) existing.remove();
    var toast = document.createElement("div");
    toast.className = "counter-toast";
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.add("counter-toast-show"); }, 10);
    setTimeout(function () {
      toast.classList.remove("counter-toast-show");
      setTimeout(function () { toast.remove(); }, 300);
    }, 2500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
