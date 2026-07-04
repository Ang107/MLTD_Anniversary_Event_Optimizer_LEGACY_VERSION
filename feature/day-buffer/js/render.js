"use strict";

/* ============================================================
 * 出力整形
 * ============================================================ */
// 直近の最適化結果の表示文字列（X共有の文言で使う）
let lastFinalPointsText = "";
let lastTotalTimeText = "";

function secToTimeStr(sec) {
  const s = Math.round(sec); // 小数秒は丸めて表示
  const hour = Math.floor(s / 3600);
  const minute = Math.floor((s % 3600) / 60);
  const second = ((s % 60) + 60) % 60;
  return `${hour}時間${minute}分${second}秒`;
}

// 数値をカンマ区切りに（小数は最大2桁）。非数値はそのまま
function fmtN(n) {
  return typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("ja-JP", { maximumFractionDigits: 2 })
    : String(n);
}

function summaryCard(label, value, primary = false) {
  return el("div", { class: "summary-card" + (primary ? " primary" : "") }, [
    el("div", { class: "sc-label", text: label }),
    el("div", { class: "sc-value", text: value }),
  ]);
}

function showResultNode(node) {
  const r = $("result");
  r.classList.remove("empty", "loading");
  r.innerHTML = "";
  r.appendChild(node);
  hasResult = true;
  setStale(false);
  setShareButtonVisible(true); // 結果が出たら共有ボタンを表示
  // 結果内の横スクロールテーブルに影アフォーダンスを付与
  bindScrollShadows(r);
  // 結果は縦に長くなるため、パネル先頭を基準にスクロールする（center だと上部が見切れる）。
  // スティッキーなツールバーに隠れないよう、パネル側の scroll-margin-top で余白を確保している。
  (r.closest(".panel") || r).scrollIntoView({ behavior: "smooth", block: "start" });
}

// 結果が現在の入力と食い違っている旨のバッジ表示切り替え
function setStale(stale) {
  const b = $("staleBadge");
  if (b) b.style.display = stale ? "" : "none";
}

function formatAction(action, setting) {
  const songName = (idx) => setting.SONG_NAMES_BY_IDOL[idx] || `${IDOLS[idx]}に対応する曲`;
  switch (action.kind) {
    case "loginTrigger":
      return { desc: ["ログインで貰えるトリガーを受け取る。"] };
    case "boost":
      return { desc: ["ブーストを使用する。"] };
    case "workTickets":
      return { desc: [`${action.workMultiplier}倍お仕事でライブチケットを1800枚集める。`] };
    case "recommendedSong":
      return { desc: [`チケット450枚消費ライブで「${songName(action.idolIndex)}」を1回プレイ。`] };
    case "routine":
      return {
        desc: [`以下を${action.count}回繰り返す。`],
        bullets: [
          `${action.workMultiplier}倍お仕事でライブチケットを1800枚集める。`,
          `チケット450枚消費ライブで「${songName(action.idolIndex)}」を4回プレイ。`,
        ],
      };
    case "anniv10x":
      return { desc: [`周年曲10倍ライブを${action.count}回プレイ。`] };
    case "anniv4x":
      return {
        desc: [`周年曲4倍ライブを${action.count}回プレイ。`],
        note: action.flags && action.flags.includes("splitAnniv4x")
          ? "※若干のロスになるが、確実にブーストを消化するために分割して周年曲4倍ライブを行う。"
          : null,
      };
    default:
      return { desc: ["不明な行動。"] };
  }
}

// 増減セル：正の値は + 付きで表示（負の値は fmtN が - を付ける）
// 展開行に表示する行動詳細表。pointsCum / triggerCum はイベント全体の累積（前日まで）の基準に使う。
function buildDayDetail(i, ans, setting, pointsCum, triggerCum) {
  const start = setting.SIMULATE_START_DAY;
  const wrap = el("div", { class: "day-detail" });

  const t = el("table", { class: "detail-table" });
  t.appendChild(el("tr", {}, [
    el("th", { class: "detail-no", text: "" }),
    el("th", { class: "detail-act", text: "行動" }),
    el("th", { text: "ポイント累積和" }),
    el("th", { text: "トリガー累積和" }),
  ]));

  const initial = ans.initialState || { points: 0, trigger: 0 };
  let cumPt = i > start ? pointsCum[i - 1] : initial.points;
  let cumTrig = i > start ? triggerCum[i - 1] : initial.trigger;
  const rows = ans.dayActions[i] || [];
  rows.forEach((action, n) => {
    const r = formatAction(action, setting);
    cumPt += action.pointsDelta;
    cumTrig += action.triggerDelta;
    const act = el("td", { class: "detail-act" });
    act.appendChild(document.createTextNode(r.desc[0]));
    for (let li = 1; li < r.desc.length; li++) {
      act.appendChild(el("br"));
      act.appendChild(document.createTextNode(r.desc[li]));
    }
    if (r.bullets) {
      const list = el("div", { class: "detail-bullets" });
      for (const b of r.bullets) list.appendChild(el("div", { text: "・" + b }));
      act.appendChild(list);
    }
    if (r.note) {
      act.appendChild(el("div", { class: "detail-note-inline", text: r.note }));
    }
    t.appendChild(el("tr", {}, [
      el("td", { class: "detail-no", text: String(n + 1) }),
      act,
      el("td", { text: fmtN(cumPt) }),
      el("td", { text: fmtN(cumTrig) }),
    ]));
  });

  wrap.appendChild(el("div", { class: "detail-table-scroll" }, [t]));
  return wrap;
}

// 日次結果テーブル（確定／未確定で共通）。
// opts.firstDay..lastDay の範囲のみ描画、defaultExpanded で初期展開、showTotals で合計行の有無を制御。
function appendResultTable(root, ans, setting, opts = {}) {
  const startDay = setting.SIMULATE_START_DAY;
  const firstDay = opts.firstDay != null ? opts.firstDay : startDay;
  const lastDay = opts.lastDay != null ? opts.lastDay : (CONST.EVENT_LENGTH - 1);
  const defaultExpanded = !!opts.defaultExpanded;
  const showTotals = opts.showTotals !== false;
  const availableTimeSec = opts.availableTimeSec;

  const triggerCum = ans.triggerCumulative;
  const pointsCum = ans.pointsCumulative;
  const last = CONST.EVENT_LENGTH - 1;
  const totalUsed = ans.totalUsedTimeSec;
  const initial = ans.initialState || { points: 0, trigger: 0, shouldDisplay: false };
  const showBaseline = initial.shouldDisplay && firstDay === startDay;

  const cols = [
    ["通常曲450x4", ans.normalRoutineCounts, fmtN, sum(ans.normalRoutineCounts.slice(startDay))],
    ["周年曲4倍", ans.anniv4xCounts, fmtN, sum(ans.anniv4xCounts.slice(startDay))],
    ["周年曲10倍", ans.anniv10xCounts, fmtN, sum(ans.anniv10xCounts.slice(startDay))],
    ["ポイント増加", ans.pointsIncreases, fmtN, ans.calcFinalPoints()],
    ["ポイント累積和", pointsCum, fmtN, pointsCum[last]],
    ["トリガー累積和", triggerCum, fmtN, triggerCum[last]],
    ["稼働時間", ans.usedTimeSec, secToTimeStr, secToTimeStr(totalUsed)],
  ];

  const t = el("table", { class: "result-table" });
  const head = el("tr", {}, [el("th", { text: "日付" })]);
  for (const [name] of cols) head.appendChild(el("th", { text: name }));
  t.appendChild(head);

  const expandables = []; // 一括展開／折りたたみ用に開閉可能な行を集める
  // 1つでも開いていれば「すべて折りたたむ」、すべて閉じていれば「すべて展開」を表示する
  const expandAllBtn = el("button", { type: "button", class: "detail-toggle-all" });
  const anyOpen = () => expandables.some(({ tr }) => tr.classList.contains("open"));
  const syncToggleAllBtn = () => { expandAllBtn.textContent = anyOpen() ? "すべて折りたたむ" : "すべて展開"; };
  let displayRowIndex = 0;

  // 開始時の所持ポイント／トリガーを、当日の増加分とは別の行として累積和の起点に表示する
  if (showBaseline) {
    const baseRow = el("tr", {
      class: "baseline-row result-row" + (displayRowIndex % 2 === 0 ? " striped-row" : ""),
    }, [
      el("th", { class: "day-cell", text: "開始時所持" }),
    ]);
    // cols と同じ並び: [通常曲450x4, 周年4x, 周年10x, ポイント増加, ポイント累積和, トリガー累積和, 稼働時間]
    const baseVals = ["", "", "", initial.points, initial.points, initial.trigger, ""];
    for (const v of baseVals) baseRow.appendChild(el("td", { text: v === "" ? "" : fmtN(v) }));
    t.appendChild(baseRow);
    displayRowIndex++;
  }

  for (let i = firstDay; i <= lastDay; i++) {
    // 各行はクリック／タップで詳細行動表を開閉できる
    const isOvertime = availableTimeSec && ans.usedTimeSec[i] > availableTimeSec[i];
    const dateCell = el("th", { class: "day-cell" }, [
      el("span", { class: "expand-caret", text: "▶" }),
      el("span", { text: dayDateLabel(i) }),
    ]);
    const tr = el("tr", {
      class: "day-row result-row" + (displayRowIndex % 2 === 0 ? " striped-row" : "") + (defaultExpanded ? " open" : "") + (isOvertime ? " overtime-row" : ""),
      tabindex: "0", role: "button", "aria-expanded": defaultExpanded ? "true" : "false",
    }, [dateCell]);
    for (let ci = 0; ci < cols.length; ci++) {
      const [, arr, fmt] = cols[ci];
      const tdClass = (isOvertime && ci === cols.length - 1) ? "overtime-value" : "";
      tr.appendChild(el("td", { class: tdClass, text: fmt(arr[i]) }));
    }
    t.appendChild(tr);

    const detailRow = el("tr", { class: "detail-row" + (defaultExpanded ? " open" : "") });
    detailRow.appendChild(el("td", { class: "detail-cell", colspan: String(cols.length + 1) }, [
      el("div", { class: "detail-inner" }, [
        el("div", { class: "detail-clip" }, [buildDayDetail(i, ans, setting, pointsCum, triggerCum)]),
      ]),
    ]));
    t.appendChild(detailRow);

    const toggle = () => {
      const open = tr.classList.toggle("open");
      detailRow.classList.toggle("open", open);
      tr.setAttribute("aria-expanded", open ? "true" : "false");
      syncToggleAllBtn();
    };
    tr.addEventListener("click", toggle);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
    expandables.push({ tr, detailRow });
    displayRowIndex++;
  }

  if (showTotals) {
    const totals = el("tr", { class: "total-row" }, [el("th", { text: "合計" })]);
    for (const [, , , total] of cols) {
      totals.appendChild(el("td", { text: total == null ? "" : (typeof total === "number" ? fmtN(total) : total) }));
    }
    t.appendChild(totals);
  }

  // 1つでも開いていれば全折りたたみ、すべて閉じていれば全展開を行う。
  expandAllBtn.addEventListener("click", () => {
    const willOpen = !anyOpen();
    for (const { tr, detailRow } of expandables) {
      tr.classList.toggle("open", willOpen);
      detailRow.classList.toggle("open", willOpen);
      tr.setAttribute("aria-expanded", willOpen ? "true" : "false");
    }
    syncToggleAllBtn();
  });
  syncToggleAllBtn(); // 初期状態（defaultExpanded）を反映
  root.appendChild(el("div", { class: "detail-tools" }, [
    el("p", { class: "detail-tools-hint", text: "各行をクリックすると、その日の行動詳細を表示します。" }),
    expandAllBtn,
  ]));

  root.appendChild(el("div", { class: "table-scroll" }, [t]));
}

// 確定モード結果を UI として描画
function renderResultConfirmed(ans, sim, setting, notAchieved, availableTimeSec) {
  const start = setting.SIMULATE_START_DAY;
  const stam = sim.staminaPerDay(ans);
  const totalStamina = sum(stam.slice(start));
  const totalJewels = sim.requiredJewels(totalStamina);
  const totalUsed = ans.totalUsedTimeSec;

  const root = el("div", { class: "result-view" });
  if (notAchieved) {
    root.appendChild(el("div", { class: "result-note", text: "⚠ 目標ポイントを達成できませんでした。以下は到達可能な最大ポイントでの結果です。" }));
  }
  const hasOvertime = availableTimeSec && ans.usedTimeSec.some(
    (t, i) => i >= start && t > availableTimeSec[i]
  );
  if (hasOvertime) {
    root.appendChild(el("div", { class: "result-note overtime-note", text: "⚠ 稼働可能時間を超過する日があります。" }));
  }

  const cards = el("div", { class: "summary-cards" });
  lastFinalPointsText = fmtN(ans.calcFinalPoints());
  cards.appendChild(summaryCard("最終ポイント", lastFinalPointsText, true));
  cards.appendChild(summaryCard("消費ジュエル合計", fmtN(totalJewels)));
  cards.appendChild(summaryCard("消費スタミナ合計", fmtN(totalStamina)));
  lastTotalTimeText = secToTimeStr(totalUsed);
  cards.appendChild(summaryCard("合計稼働時間", lastTotalTimeText));
  root.appendChild(cards);

  appendResultTable(root, ans, setting, { availableTimeSec });
  return root;
}

// 未確定モード結果を UI として描画（確定モードと同じ形式。表は開始日のみ・初期展開）
function renderResultUnconfirmed(ans, setting, notAchieved, availableTimeSec) {
  const start = setting.SIMULATE_START_DAY;
  const root = el("div", { class: "result-view" });
  if (notAchieved) {
    root.appendChild(el("div", { class: "result-note", text: "⚠ 目標ポイントを達成できませんでした。以下は到達可能な最大ポイントでの結果です。" }));
  }
  if (ans.hasOvertimeRisk) {
    root.appendChild(el("div", { class: "result-note overtime-note", text: "⚠ 稼働可能時間を超過する日がある可能性があります。" }));
  }
  root.appendChild(el("p", { class: "result-hint", text: "未確定モードのため、シミュレーション開始日以降はランダムシミュレーションによる期待値です。" }));

  const cards = el("div", { class: "summary-cards" });
  // 期待値（平均）は小数になり得るが、表示上は整数に丸める
  lastFinalPointsText = fmtN(Math.round(ans.expectedFinalPoints)) + "（期待値）";
  cards.appendChild(summaryCard("最終ポイント（期待値）", fmtN(Math.round(ans.expectedFinalPoints)), true));
  cards.appendChild(summaryCard("消費ジュエル合計（期待値）", fmtN(Math.round(ans.expectedTotalJewels))));
  cards.appendChild(summaryCard("消費スタミナ合計（期待値）", fmtN(Math.round(ans.expectedTotalStamina))));
  lastTotalTimeText = secToTimeStr(ans.expectedTotalUsedTimeSec) + "（期待値）";
  cards.appendChild(summaryCard("合計稼働時間（期待値）", secToTimeStr(ans.expectedTotalUsedTimeSec)));
  root.appendChild(cards);

  appendResultTable(root, ans, setting, { lastDay: start, defaultExpanded: true, showTotals: false, availableTimeSec });
  return root;
}
