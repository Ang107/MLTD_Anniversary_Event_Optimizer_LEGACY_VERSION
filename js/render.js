"use strict";

/* ============================================================
 * 出力整形
 * ============================================================ */
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
  r.classList.remove("empty");
  r.innerHTML = "";
  r.appendChild(node);
  hasResult = true;
  setStale(false);
  // 結果は縦に長くなるため、パネル先頭を基準にスクロールする（center だと上部が見切れる）。
  // スティッキーなツールバーに隠れないよう、パネル側の scroll-margin-top で余白を確保している。
  (r.closest(".panel") || r).scrollIntoView({ behavior: "smooth", block: "start" });
}

// 結果が現在の入力と食い違っている旨のバッジ表示切り替え
function setStale(stale) {
  const b = $("staleBadge");
  if (b) b.style.display = stale ? "" : "none";
}

// 確定モードの1日分の行動を、上から実行順に並べたリストとして算出する。
// 各行の pt/trig 増分の総和は、その日の pointsIncreases[i] / (triggerIncreases-triggerDecreases)[i]
// と一致する（ブースト倍化分の配分まで含めて simulator.js の日次収支に整合させている）。
function buildDayDetailRows(i, ans, setting) {
  const start = setting.SIMULATE_START_DAY;
  const isStart = i === start;
  const isNormalBoost = setting.BOOST_MODE === "NORMAL_SONG";
  const isAnnivBoost = setting.BOOST_MODE === "ANNIVERSARY_SONG";
  // 開始日のみ「既に消化済み」フラグで各要素の有無が変わる（simulator.js と同じ判定）
  const receiveLogin = !(isStart && setting.START_DAY_LOGIN_TRIGGER_OBTAINED);
  const playRecOnce = !(isStart && setting.START_DAY_MISSION_TRIGGER_OBTAINED);
  const useBoost = !(isStart && setting.START_DAY_BOOST_USED);

  const RPD = CONST.RECOMMENDED_SONGS_COUNT_PER_DAY;
  const V450 = CONST.VALUE_BY_450_TICKET;
  const V1800 = CONST.VALUE_BY_1800_TICKET;
  const PT_STD = CONST.POINT_BY_STANDARD_TRIGGER;
  const STD = CONST.STANDARD_TRIGGER;

  const A10 = ans.anniv10xCounts[i];
  const A4 = ans.anniv4xCounts[i];
  const Rtotal = ans.normalRoutineCounts[i];
  const workMult = i <= CONST.FIRST_HALF_END_DAY ? 2 : 3; // 前半2倍 / 後半3倍
  const recIdx = setting.RECOMMENDED_SONGS[i];
  const songName = (idx) => setting.SONG_NAMES_BY_IDOL[idx] || IDOLS[idx];

  const rows = [];
  // 1. ログイントリガー
  if (receiveLogin) {
    rows.push({ desc: ["ログインで貰えるトリガーを受け取る。"], pt: 0, trig: CONST.LOGIN_TRIGGER });
  }
  // 2. ブースト使用（通常曲ブースト）
  if (useBoost && isNormalBoost) {
    rows.push({ desc: ["ブーストを使用する。"], pt: 0, trig: 0 });
  }
  // 3. おすすめ楽曲を1曲ずつ（ミッショントリガー）。通常曲ブースト使用時は倍化。
  const recFactor = (useBoost && isNormalBoost) ? 2 : 1;
  if (playRecOnce) {
    rows.push({ desc: [`${workMult}倍お仕事でライブチケットを1800枚集める。`], pt: 0, trig: 0 });
    for (let k = 0; k < RPD; k++) {
      rows.push({
        desc: [`チケット450枚消費ライブで「${songName(recIdx[k])}」を1回プレイ。`],
        pt: V450 * recFactor,
        trig: V450 * recFactor + CONST.RECOMMENDED_SONGS_MISSION_TRIGGER,
      });
    }
  }
  // 4. 残りのルーティン（最速おすすめ楽曲を4曲ずつ）を繰り返す。
  //    おすすめ1周分(1回)を除いた回数。通常曲ブーストの倍化残余（10曲分−おすすめ消化分）をここで計上。
  const R4 = Rtotal - (playRecOnce ? 1 : 0);
  if (R4 > 0) {
    let fastK = 0;
    for (let k = 1; k < RPD; k++) {
      if (setting.SONG_TIMES_SEC_BY_IDOL[recIdx[k]] < setting.SONG_TIMES_SEC_BY_IDOL[recIdx[fastK]]) fastK = k;
    }
    const boostBonus = (useBoost && isNormalBoost)
      ? V450 * (CONST.BOOST_COUNT - (playRecOnce ? RPD : 0)) : 0;
    const base = R4 * V1800;
    rows.push({
      desc: [`以下を${R4}回繰り返す。`],
      bullets: [
        `${workMult}倍お仕事でライブチケットを1800枚集める。`,
        `「${songName(recIdx[fastK])}」を4回プレイ。`,
      ],
      pt: base + boostBonus,
      trig: base + boostBonus,
    });
  }
  // 5. 周年曲10x
  if (A10 > 0) {
    rows.push({
      desc: [`周年曲10倍ライブを${A10}回プレイ。`],
      pt: A10 * PT_STD * 10,
      trig: -(A10 * STD * 10),
    });
  }
  // 6. ブースト使用（周年曲ブースト）
  if (useBoost && isAnnivBoost) {
    rows.push({ desc: ["ブーストを使用する。"], pt: 0, trig: 0 });
  }
  // 7. 周年曲4x。周年曲ブースト使用時は倍化分(BOOST_COUNT曲)を加算。
  if (A4 > 0) {
    const boostBonus = (useBoost && isAnnivBoost) ? PT_STD * 4 * CONST.BOOST_COUNT : 0;
    rows.push({
      desc: [`周年曲4倍ライブを${A4}回プレイ。`],
      pt: A4 * PT_STD * 4 + boostBonus,
      trig: -(A4 * STD * 4),
    });
  }
  return rows;
}

// 増減セル：正の値は + 付きで表示（負の値は fmtN が - を付ける）
function signedCell(v) {
  return el("td", { text: v > 0 ? "+" + fmtN(v) : fmtN(v) });
}

// 展開行に表示する行動詳細表。pointsCum / triggerCum はイベント全体の累積（前日まで）の基準に使う。
function buildDayDetail(i, ans, setting, pointsCum, triggerCum) {
  const wrap = el("div", { class: "day-detail" });

  const t = el("table", { class: "detail-table" });
  t.appendChild(el("tr", {}, [
    el("th", { class: "detail-no", text: "" }),
    el("th", { class: "detail-act", text: "行動" }),
    el("th", { text: "ポイント増加" }),
    el("th", { text: "ポイント累積和" }),
    el("th", { text: "トリガー増減" }),
    el("th", { text: "トリガー累積和" }),
  ]));

  let cumPt = i > 0 ? pointsCum[i - 1] : 0;
  let cumTrig = i > 0 ? triggerCum[i - 1] : 0;
  const rows = buildDayDetailRows(i, ans, setting);
  rows.forEach((r, n) => {
    cumPt += r.pt;
    cumTrig += r.trig;
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
    t.appendChild(el("tr", {}, [
      el("td", { class: "detail-no", text: String(n + 1) }),
      act,
      signedCell(r.pt),
      el("td", { text: fmtN(cumPt) }),
      signedCell(r.trig),
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

  // 累積和（各日までの合計）。トリガーは増加−減少の累積残高、ポイントは増加の累積
  const triggerCum = [];
  const pointsCum = [];
  let tAcc = 0, pAcc = 0;
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    tAcc += ans.triggerIncreases[i] - ans.triggerDecreases[i];
    pAcc += ans.pointsIncreases[i];
    triggerCum.push(tAcc);
    pointsCum.push(pAcc);
  }
  const last = CONST.EVENT_LENGTH - 1;
  const totalUsed = sum(ans.usedTimeSec.slice(startDay));

  const cols = [
    ["450枚チケットライブx4", ans.normalRoutineCounts, fmtN, sum(ans.normalRoutineCounts.slice(startDay))],
    ["周年曲4x", ans.anniv4xCounts, fmtN, sum(ans.anniv4xCounts.slice(startDay))],
    ["周年曲10x", ans.anniv10xCounts, fmtN, sum(ans.anniv10xCounts.slice(startDay))],
    ["ポイント増加", ans.pointsIncreases, fmtN, sum(ans.pointsIncreases)],
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

  for (let i = firstDay; i <= lastDay; i++) {
    // 各行はクリック／タップで詳細行動表を開閉できる
    const dateCell = el("th", { class: "day-cell" }, [
      el("span", { class: "expand-caret", text: "▶" }),
      el("span", { text: dayDateLabel(i) }),
    ]);
    const tr = el("tr", {
      class: "day-row" + (defaultExpanded ? " open" : ""),
      tabindex: "0", role: "button", "aria-expanded": defaultExpanded ? "true" : "false",
    }, [dateCell]);
    for (const [, arr, fmt] of cols) {
      tr.appendChild(el("td", { text: fmt(arr[i]) }));
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
function renderResultConfirmed(ans, sim, setting, notAchieved) {
  const start = setting.SIMULATE_START_DAY;
  const stam = sim.staminaPerDay(ans);
  const totalStamina = sum(stam.slice(start));
  const totalJewels = sim.requiredJewels(totalStamina);
  const totalUsed = sum(ans.usedTimeSec.slice(start));

  const root = el("div", { class: "result-view" });
  if (notAchieved) {
    root.appendChild(el("div", { class: "result-note", text: "目標ポイントを達成できませんでした。以下は到達可能な最大ポイントでの結果です。" }));
  }

  const cards = el("div", { class: "summary-cards" });
  cards.appendChild(summaryCard("最終ポイント", fmtN(ans.calcFinalPoints()), true));
  cards.appendChild(summaryCard("消費ジュエル合計", fmtN(totalJewels)));
  cards.appendChild(summaryCard("消費スタミナ合計", fmtN(totalStamina)));
  cards.appendChild(summaryCard("合計稼働時間", secToTimeStr(totalUsed)));
  root.appendChild(cards);

  appendResultTable(root, ans, setting, {});
  return root;
}

// 未確定モード結果を UI として描画（確定モードと同じ形式。表は開始日のみ・初期展開）
function renderResultUnconfirmed(ans, setting, notAchieved) {
  const start = setting.SIMULATE_START_DAY;
  const n = CONST.EVENT_LENGTH;
  const zeros = () => Array(n).fill(0);

  // 開始日の確定した行動から、確定モードと同形式の単日 ans を組み立てる。
  // ポイント／トリガー増減は buildDayDetail と同じ算出（buildDayDetailRows）で導出して整合させる。
  const synth = {
    normalRoutineCounts: zeros(), anniv4xCounts: zeros(), anniv10xCounts: zeros(),
    pointsIncreases: zeros(), triggerIncreases: zeros(), triggerDecreases: zeros(), usedTimeSec: zeros(),
  };
  synth.normalRoutineCounts[start] = ans.firstDayRoutineCount;
  synth.anniv4xCounts[start] = ans.firstDayAnniv4xCount;
  synth.anniv10xCounts[start] = ans.firstDayAnniv10xCount;
  synth.usedTimeSec[start] = ans.firstDayUsedTimeSec;
  const dayRows = buildDayDetailRows(start, synth, setting);
  synth.pointsIncreases[start] = dayRows.reduce((a, r) => a + r.pt, 0);
  synth.triggerIncreases[start] = dayRows.reduce((a, r) => a + Math.max(0, r.trig), 0);
  synth.triggerDecreases[start] = dayRows.reduce((a, r) => a - Math.min(0, r.trig), 0);
  // 所持ポイント／トリガーは前日分として置く（累積和の起点に反映）
  if (start > 0) {
    synth.pointsIncreases[start - 1] = setting.HAVING_POINTS;
    synth.triggerIncreases[start - 1] = setting.HAVING_TRIGGER;
  }

  const root = el("div", { class: "result-view" });
  if (notAchieved) {
    root.appendChild(el("div", { class: "result-note", text: "目標ポイントを達成できませんでした。以下は到達可能な最大ポイントでの結果です。" }));
  }
  root.appendChild(el("p", { class: "result-hint", text: "未確定モードのため、シミュレーション開始日以降はランダムシミュレーションによる期待値です。" }));

  const cards = el("div", { class: "summary-cards" });
  cards.appendChild(summaryCard("最終ポイント（期待値）", fmtN(ans.expectedFinalPoints), true));
  cards.appendChild(summaryCard("消費ジュエル合計（期待値）", fmtN(ans.expectedTotalJewels)));
  cards.appendChild(summaryCard("消費スタミナ合計（期待値）", fmtN(ans.expectedTotalStamina)));
  cards.appendChild(summaryCard("合計稼働時間（期待値）", secToTimeStr(ans.expectedTotalUsedTimeSec)));
  root.appendChild(cards);

  appendResultTable(root, synth, setting, { lastDay: start, defaultExpanded: true, showTotals: false });
  return root;
}
