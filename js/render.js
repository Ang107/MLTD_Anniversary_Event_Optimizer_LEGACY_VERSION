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

function kvRow(grid, key, value) {
  grid.appendChild(el("div", { class: "kv-k", text: key }));
  grid.appendChild(el("div", { class: "kv-v", text: value }));
}

function showResultNode(node) {
  const r = $("result");
  r.classList.remove("empty");
  r.innerHTML = "";
  r.appendChild(node);
  hasResult = true;
  setStale(false);
  r.scrollIntoView({ behavior: "smooth", block: "center" });
}

// 結果が現在の入力と食い違っている旨のバッジ表示切り替え
function setStale(stale) {
  const b = $("staleBadge");
  if (b) b.style.display = stale ? "" : "none";
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

  const cols = [
    ["450枚チケットライブx4", ans.normalRoutineCounts, fmtN, sum(ans.normalRoutineCounts.slice(start))],
    ["周年曲4x", ans.anniv4xCounts, fmtN, sum(ans.anniv4xCounts.slice(start))],
    ["周年曲10x", ans.anniv10xCounts, fmtN, sum(ans.anniv10xCounts.slice(start))],
    ["ポイント増加", ans.pointsIncreases, fmtN, sum(ans.pointsIncreases)],
    ["ポイント累積和", pointsCum, fmtN, pointsCum[last]],
    ["トリガー累積和", triggerCum, fmtN, triggerCum[last]],
    ["稼働時間", ans.usedTimeSec, secToTimeStr, secToTimeStr(totalUsed)],
  ];

  const t = el("table", { class: "result-table" });
  const head = el("tr", {}, [el("th", { text: "日付" })]);
  for (const [name] of cols) head.appendChild(el("th", { text: name }));
  t.appendChild(head);
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    const tr = el("tr", {}, [el("th", { text: dayDateLabel(i) })]);
    for (const [, arr, fmt] of cols) {
      tr.appendChild(el("td", { text: i < start ? "—" : fmt(arr[i]) }));
    }
    t.appendChild(tr);
  }
  const totals = el("tr", { class: "total-row" }, [el("th", { text: "合計" })]);
  for (const [, , , total] of cols) {
    totals.appendChild(el("td", { text: total == null ? "" : (typeof total === "number" ? fmtN(total) : total) }));
  }
  t.appendChild(totals);
  root.appendChild(el("div", { class: "table-scroll" }, [t]));
  return root;
}

// 未確定モード結果を UI として描画
function renderResultUnconfirmed(ans, setting, notAchieved) {
  const root = el("div", { class: "result-view" });
  if (notAchieved) {
    root.appendChild(el("div", { class: "result-note", text: "目標ポイントを達成できませんでした。以下は到達可能な最大ポイントでの結果です。" }));
  }
  root.appendChild(el("p", { class: "result-hint", text: "未確定モードのため、シミュレーション開始日以降はランダムシミュレーションによる期待値です。" }));

  const cards = el("div", { class: "summary-cards" });
  cards.appendChild(summaryCard("最終ポイント（期待値）", fmtN(ans.expectedFinalPoints), true));
  cards.appendChild(summaryCard("消費ジュエル合計（期待値）", fmtN(ans.expectedTotalJewels)));
  root.appendChild(cards);

  const dateLabel = dayDateLabel(setting.SIMULATE_START_DAY);
  const cols = el("div", { class: "result-cols" });

  // 左: 開始日のおすすめ行動
  const block = el("div", { class: "result-block" });
  block.appendChild(el("h3", { class: "result-h", text: `${dateLabel} のおすすめ行動` }));
  const grid = el("div", { class: "kv-grid" });
  kvRow(grid, "450枚チケットライブx4の回数", fmtN(ans.firstDayRoutineCount));
  kvRow(grid, "周年曲4xの回数", fmtN(ans.firstDayAnniv4xCount));
  kvRow(grid, "周年曲10xの回数", fmtN(ans.firstDayAnniv10xCount));
  kvRow(grid, "スタミナ消費量", fmtN(ans.firstDayStamina));
  kvRow(grid, "ジュエル消費量", fmtN(ans.firstDayJewels));
  kvRow(grid, "稼働時間", secToTimeStr(ans.firstDayUsedTimeSec));
  block.appendChild(grid);
  cols.appendChild(block);

  // 右: 開始日終了時点での状態
  const block2 = el("div", { class: "result-block" });
  block2.appendChild(el("h3", { class: "result-h", text: `${dateLabel} 終了時点` }));
  const grid2 = el("div", { class: "kv-grid" });
  kvRow(grid2, "ポイント", fmtN(ans.firstDayTotalPoints));
  kvRow(grid2, "トリガー", fmtN(ans.firstDayTotalTrigger));
  block2.appendChild(grid2);
  cols.appendChild(block2);

  root.appendChild(cols);
  return root;
}
