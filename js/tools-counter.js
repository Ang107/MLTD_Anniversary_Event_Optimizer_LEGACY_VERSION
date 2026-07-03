"use strict";

(function () {
  var PLAY_TYPES = {
    login:       { label: "ログイントリガー",      shortLabel: "ログイン",  pt: 0,  tr: 540,     buttons: [{ delta: -1 }, { delta: 1 }] },
    mission:     { label: "おすすめ楽曲ミッション",  pt: 0, tr: 1000,     buttons: [{ delta: -4 }, { delta: -1 }, { delta: 1 }, { delta: 4 }] },
    anniv4x:     { label: "周年曲4倍ライブ",        pt: 2148, tr: -720,  buttons: [{ delta: -1 }, { delta: 1 }] },
    anniv10x:    { label: "周年曲10倍ライブ",       pt: 5370, tr: -1800, buttons: [{ delta: -1 }, { delta: 1 }] },
    annivBoost:  { label: "ブースト回数",           pt: 2148, tr: 0,     buttons: [{ delta: -10 }, { delta: -1 }, { delta: 1 }, { delta: 10 }],
      cap: function (c) { return c.anniv4x; }, capLabel: "4倍のプレイ回数" },
    normal1800:  { label: "チケット450枚消費ライブ×4", pt: 4284, tr: 4284,  buttons: [{ delta: -1 }, { delta: 1 }] },
    normal450:   { label: "チケット450枚消費",       pt: 1071, tr: 1071,  buttons: [{ delta: -1 }, { delta: 1 }] },
    normalBoost: { label: "ブースト回数",           pt: 1071, tr: 1071,  buttons: [{ delta: -10 }, { delta: -1 }, { delta: 1 }, { delta: 10 }],
      cap: function (c) { return c.normal1800 * 4 + c.normal450; }, capLabel: "通常曲の合計プレイ回数" },
  };

  var ROWS = [
    { group: "デイリー",             ids: ["login", "mission"] },
    { group: "通常曲（おすすめ楽曲）", ids: ["normal1800", "normal450"] },
    { group: null,                  ids: ["normalBoost"] },
    { group: "周年曲",              ids: ["anniv4x", "anniv10x"] },
    { group: null,                  ids: ["annivBoost"] },
  ];

  var OPTIMIZER_STORAGE_KEY = "mltd9th_simulator_state_v1";
  var COUNTER_STORAGE_KEY = "mltd9th_counter_state_v1";
  var HISTORY_MAX = 100;
  var counts = {};
  var initialPt = 0;
  var initialTr = 0;
  var history = [];

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
    desc.textContent = "初期値とカウンターの合計です。そのままオプティマイザーへ反映できます。";
    bar.appendChild(desc);

    var toolbar = document.createElement("div");
    toolbar.className = "counter-result-toolbar";
    var applyBtn = makeActionBtn("オプティマイザーに反映", "counter-result-apply-btn", writeToOptimizer);
    applyBtn.id = "btnApplyOptimizer";
    applyBtn.style.display = "none";
    toolbar.appendChild(applyBtn);
    bar.appendChild(toolbar);

    var cards = document.createElement("div");
    cards.className = "summary-cards";
    cards.innerHTML =
      '<div class="summary-card primary">' +
        '<div class="sc-label">プレイ後ポイント</div>' +
        '<div class="sc-value" id="resultPt">0</div>' +
        '<div class="counter-result-diff" id="diffPt"></div>' +
      '</div>' +
      '<div class="summary-card primary">' +
        '<div class="sc-label">プレイ後トリガー</div>' +
        '<div class="sc-value" id="resultTr">0</div>' +
        '<div class="counter-result-diff" id="diffTr"></div>' +
      '</div>';
    bar.appendChild(cards);
  }

  function buildUI(container) {
    container.innerHTML = "";

    // 初期値入力
    var details = document.createElement("div");
    details.className = "counter-panel counter-init";
    var initHeading = document.createElement("h2");
    initHeading.className = "tool-heading";
    initHeading.textContent = "初期値";
    details.appendChild(initHeading);
    var initDesc = document.createElement("p");
    initDesc.className = "tool-desc";
    initDesc.textContent = "現在の所持ポイント・トリガーを入力してください。";
    details.appendChild(initDesc);

    var loadRow = document.createElement("div");
    loadRow.className = "counter-init-load-row";
    loadRow.appendChild(makeActionBtn("オプティマイザーから読込", "counter-action-btn counter-action-btn-sm", loadFromOptimizer));
    details.appendChild(loadRow);

    var initGrid = document.createElement("div");
    initGrid.className = "counter-init-grid";
    initGrid.appendChild(makeNumberField("counterInitPt", "初期ポイント", initialPt));
    initGrid.appendChild(makeNumberField("counterInitTr", "初期トリガー", initialTr));
    details.appendChild(initGrid);
    container.appendChild(details);

    document.getElementById("counterInitPt").addEventListener("input", function () {
      initialPt = parseInt(this.value, 10) || 0; recalc();
    });
    document.getElementById("counterInitTr").addEventListener("input", function () {
      initialTr = parseInt(this.value, 10) || 0; recalc();
    });

    // カウンター
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

    // 更新履歴
    var histSection = document.createElement("div");
    histSection.className = "counter-panel counter-history";
    var histHeading = document.createElement("h2");
    histHeading.className = "tool-heading";
    histHeading.textContent = "更新履歴";
    histSection.appendChild(histHeading);
    var histDesc = document.createElement("p");
    histDesc.className = "tool-desc";
    histDesc.textContent = "現在までの更新履歴です。";
    histSection.appendChild(histDesc);
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

  function makeNumberField(id, label, value) {
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
        btn.textContent = (b.delta > 0 ? "+" : "") + b.delta;
        btn.addEventListener("click", function () {
          var prev = counts[id];
          counts[id] = Math.max(0, counts[id] + b.delta);
          if (counts[id] !== prev) {
            var sign = b.delta > 0 ? "+" : "";
            addHistory((type.shortLabel || type.label) + " " + sign + b.delta + "（" + prev + " → " + counts[id] + "）");
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

  function recalc() {
    var totalPt = initialPt;
    var totalTr = initialTr;

    Object.keys(PLAY_TYPES).forEach(function (id) {
      var t = PLAY_TYPES[id];
      var effectiveCount = counts[id];
      var warnEl = document.getElementById("warn_" + id);

      if (t.cap) {
        var capVal = t.cap(counts);
        if (warnEl) {
          if (effectiveCount > capVal) {
            warnEl.textContent = t.capLabel + "（" + capVal + " 回）を超えています。" + capVal + " 回として計算します。";
            warnEl.style.display = "";
          } else {
            warnEl.style.display = "none";
          }
        }
        effectiveCount = Math.min(effectiveCount, capVal);
      }

      totalPt += t.pt * effectiveCount;
      totalTr += t.tr * effectiveCount;

      var countEl = document.getElementById("count_" + id);
      if (countEl) countEl.textContent = String(counts[id]);

      var card = document.getElementById("card_" + id);
      if (card) {
        card.querySelectorAll(".counter-btn-minus").forEach(function (btn) {
          btn.disabled = counts[id] === 0;
        });
      }
    });

    document.getElementById("resultPt").textContent = totalPt.toLocaleString();
    document.getElementById("resultTr").textContent = totalTr.toLocaleString();

    // 差分表示
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
    var applyBtn = document.getElementById("btnApplyOptimizer");
    if (applyBtn) applyBtn.style.display = (deltaPt === 0 && deltaTr === 0) ? "none" : "";

    saveCounterState();
  }

  function resetCounts() {
    if (!confirm("すべてのカウントをリセットします。よろしいですか？")) return;
    Object.keys(PLAY_TYPES).forEach(function (id) { counts[id] = 0; });
    addHistory("カウントをリセット");
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
      if (typeof pt === "number" && Number.isFinite(pt)) {
        initialPt = pt; document.getElementById("counterInitPt").value = String(pt);
      }
      if (typeof tr === "number" && Number.isFinite(tr)) {
        initialTr = tr; document.getElementById("counterInitTr").value = String(tr);
      }
      recalc();
      addHistory("オプティマイザーから読み込み（pt:" + initialPt + " tr:" + initialTr + "）");
      showToast("オプティマイザーから読み込みました。");
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
      var resultPt = parseInt(document.getElementById("resultPt").textContent.replace(/,/g, ""), 10) || 0;
      var resultTr = parseInt(document.getElementById("resultTr").textContent.replace(/,/g, ""), 10) || 0;
      data.setting.HAVING_POINTS = resultPt;
      data.setting.HAVING_TRIGGER = resultTr;
      localStorage.setItem(OPTIMIZER_STORAGE_KEY, JSON.stringify(data));
      addHistory("オプティマイザーへ反映（pt:" + resultPt + " tr:" + resultTr + "）");
      window.location.href = "index.html#highlight=HAVING";
    } catch (e) { showToast("反映に失敗しました。"); }
  }

  function addHistory(text) {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, "0");
    var m = String(now.getMinutes()).padStart(2, "0");
    var s = String(now.getSeconds()).padStart(2, "0");
    history.unshift({ time: h + ":" + m + ":" + s, text: text });
    if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
    renderHistory();
  }

  function renderHistory() {
    var list = document.getElementById("counterHistory");
    if (!list) return;
    list.innerHTML = "";
    if (history.length === 0) {
      var empty = document.createElement("li");
      empty.className = "counter-history-empty";
      empty.textContent = "更新履歴はありません。";
      list.appendChild(empty);
      return;
    }
    history.forEach(function (entry) {
      var li = document.createElement("li");
      var timeSpan = document.createElement("span");
      timeSpan.className = "counter-history-time";
      timeSpan.textContent = entry.time;
      li.appendChild(timeSpan);
      li.appendChild(document.createTextNode(entry.text));
      list.appendChild(li);
    });
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
