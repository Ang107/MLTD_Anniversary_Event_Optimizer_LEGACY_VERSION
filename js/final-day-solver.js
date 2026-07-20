"use strict";
import { CONST } from "./config.js";

/* ============================================================
 * 最終日専用オプティマイザー
 *
 * 残りイベント時間で最終ポイント(利得)を最大化する行動列を、DPで求める。
 *
 * 経済モデル:
 *   - 非アニバ行動（曲プレイ・チケット消費）は「トリガー」と「ポイント」を同量増やす。
 *     よって累積はスカラー1本 G（=トリガー=ポイント）で表せる。
 *   - 周年曲だけがトリガー→ポイントの変換器。
 *     変換レートは全倍率で一定 = POINT_BY_STANDARD_TRIGGER / STANDARD_TRIGGER。
 *   - 倍率が変わると再演ループが使えず別セッションになるため、追加の遷移コストがかかる。
 *     そのため倍率(4/2/1)の部分集合を全探索し、各部分集合内で高い順に貪欲に埋めて最良を選ぶ。
 *
 * DP:
 *   dp[mask][t] = 非アニバ行動にスケール済み時間 t を使って到達できる最大 G。
 *   mask (2bit): bit0=おすすめ曲ループ開始済, bit1=任意曲ループ開始済。
 *   端数チケット（高々1回）は状態に持たず、初期化時に全候補を dp[0] へ展開する。
 *   全行動を1パスの forward push で処理する。
 *     - 曲: 初回プレイ(bit未設定→設定)は起動コスト込み、2回目以降(bit設定済)は演奏+再演遷移のみ。
 *     - チケット: フルセット(1800枚)は mask 不変で何回でも。
 *       端数は高倍率消費を優先する近似モデルで、低倍率へ細分化した複数回消費は候補に含めない。
 *   時間軸は残り時間に応じて動的にスケーリングし（配列サイズ ≈ 500,000 を維持）、
 *   各行動コストを個別に ceil(cost * scale) で切り上げてから DP に積む。
 *   残り時間が短いほど精度が高くなる（24h→0.2秒, 1h→0.007秒）。
 *   最後に各 (t, mask) について「残り時間を周年曲に充てた最終ポイント」を評価し、最大を選ぶ。
 *   周年曲の評価（terminal）は実数秒で行い、DPスケーリングの影響を受けない。
 * ============================================================ */


export const STANDARD_TRIGGER = CONST.STANDARD_TRIGGER;
export const POINT_BY_STANDARD_TRIGGER = CONST.POINT_BY_STANDARD_TRIGGER;
export const STAMINA_REC = 306;
export const STAMINA_NON = 255;
export const TICKET_REC = {
  0: 0, 30: 72, 60: 143, 90: 215, 120: 286, 150: 357,
  180: 429, 210: 500, 240: 572, 270: 643, 300: 714,
  330: 786, 360: 857, 390: 929, 420: 1000, 450: 1071,
};
export const TICKET_NON = {
  0: 0, 30: 60, 60: 119, 90: 179, 120: 238, 150: 298,
  180: 357, 210: 417, 240: 476, 270: 536, 300: 595,
  330: 655, 360: 714, 390: 774, 420: 833, 450: 893,
};

// ===== 時間計算 =====
export function loopTime(song, n, s) {
  if (n <= 0) return 0;
  return s.menu + s.entry + song * n + s.betw * (n - 1) + s.exit;
}

// 倍率ごとのセッション時間の合計（倍率が変わると再演ループが切れる）
export function annivSessionTime(n4, n2, n1, s) {
  var time = 0;
  if (n4 > 0) time += loopTime(s.anniv, n4, s);
  if (n2 > 0) time += loopTime(s.anniv, n2, s);
  if (n1 > 0) time += loopTime(s.anniv, n1, s);
  return time;
}

// ===== チケット消費の最適分配 =====
// r 枚のチケットを p 回のプレイで消費するとき、
// 消費量の種類数が 2 以下で利得が最大となる分配を求める。
// 各プレイの消費量は 30 の倍数（30〜450）。
// 1 セッション版と 2 セッション版でトレードオフがある場合は両方返す。
export function ticketCandidates(r, p, table) {
  var best1 = null;
  // 1 種類（1 セッション）
  if (r % p === 0) {
    var s = r / p;
    if (s >= 30 && s <= 450 && s % 30 === 0 && table[s] != null) {
      best1 = { s1: s, c1: p, s2: 0, c2: 0, value: table[s] * p };
    }
  }
  // 2 種類（2 セッション）
  var best2 = null;
  for (var sHi = 450; sHi >= 60; sHi -= 30) {
    for (var sLo = sHi - 30; sLo >= 30; sLo -= 30) {
      var num = r - p * sLo;
      var den = sHi - sLo;
      if (num <= 0 || num % den !== 0) continue;
      var cHi = num / den;
      var cLo = p - cHi;
      if (cHi < 1 || cLo < 1) continue;
      var val = cHi * table[sHi] + cLo * table[sLo];
      if (!best2 || val > best2.value) {
        best2 = { s1: sHi, c1: cHi, s2: sLo, c2: cLo, value: val };
      }
    }
  }
  if (!best1 && !best2) return [];
  if (!best1) return [best2];
  if (!best2 || best1.value >= best2.value) return [best1];
  return [best1, best2];
}

// ===== チケット分配の前計算（定数のみに依存するため1回で済む） =====
var TICKET_CANDIDATES = (function () {
  var result = {};
  var tables = { rec: TICKET_REC, non: TICKET_NON };
  for (var key in tables) {
    result[key] = {};
    for (var k = 1; k <= 20; k++) {
      var r = 90 * k;
      var p = Math.ceil(r / 450);
      result[key][k] = ticketCandidates(r, p, tables[key]);
    }
  }
  return result;
})();

// ===== チケットアイテム生成 =====
// オプティマイザーの normalSongRoutineTimeSec に合わせた時間構成:
//   workingTime (= menu + collect) + loopTime (= menu + entry + song×n + betw×(n-1) + exit)
export function buildTicketItems(s, scale) {
  var items = [];
  var variants = [
    { key: "rec", song: s.recSong, name: "最終日おすすめ最短曲" },
    { key: "non", song: s.arbSong, name: "全体最短曲" },
  ];
  for (var vi = 0; vi < variants.length; vi++) {
    var v = variants[vi];
    for (var k = 1; k <= 20; k++) {
      var r = 90 * k;
      var gather = s.menu + s.collect1800 * r / 1800;
      var cands = TICKET_CANDIDATES[v.key][k];
      for (var ci = 0; ci < cands.length; ci++) {
        var dist = cands[ci];
        var consume;
        if (dist.c2 === 0) {
          consume = loopTime(v.song, dist.c1, s);
        } else {
          consume = loopTime(v.song, dist.c1, s) + loopTime(v.song, dist.c2, s);
        }
        var cost = gather + consume;
        var suffix = cands.length > 1 ? String.fromCharCode(97 + ci) : "";
        items.push({
          id: v.key + "_" + k + suffix, cost: cost, costScaled: Math.ceil(cost * scale), value: dist.value,
          variant: v.key, variantName: v.name, r: r, s1: dist.s1, c1: dist.c1, s2: dist.s2, c2: dist.c2,
        });
      }
    }
  }
  return items;
}

// ===== 周年曲の終端評価 =====
// 単一セッション前提での上限回数（高速な初期推定用）
export function annivMaxByTimeSingle(R, s) {
  if (R < loopTime(s.anniv, 1, s)) return 0;
  var SA = s.menu + s.entry + s.exit - s.betw;
  var mA = s.anniv + s.betw;
  var A = Math.floor((R - SA) / mA);
  if (A < 0) A = 0;
  while (A > 0 && loopTime(s.anniv, A, s) > R) A--;
  return A;
}

// 倍率 4/2/1 のうち実際に使う組み合わせ（部分集合）を全探索し、
// 各組み合わせについて倍率の高い順に貪欲で埋めたときの結果を比較する。
// （倍率を跨ぐたびにセッション遷移コストがかかるため、常に3倍率全てを
//   使うのが最善とは限らない）
var ANNIV_MULTIPLIERS = [4, 2, 1];
export const ANNIV_SUBSETS = (function () {
  var subsets = [];
  for (var mask = 1; mask < (1 << ANNIV_MULTIPLIERS.length); mask++) {
    var subset = [];
    for (var i = 0; i < ANNIV_MULTIPLIERS.length; i++) {
      if (mask & (1 << i)) subset.push(ANNIV_MULTIPLIERS[i]);
    }
    subsets.push(subset);
  }
  return subsets;
})();

// 指定した倍率の部分集合（倍率の高い順）だけを使い、貪欲に埋める
export function annivFillForSubset(units, R, s, subset) {
  var n4 = 0, n2 = 0, n1 = 0;
  var remainingUnits = units;
  var usedTime = 0;
  for (var i = 0; i < subset.length; i++) {
    var mult = subset[i];
    var cnt = Math.min(
      Math.floor(remainingUnits / mult),
      annivMaxByTimeSingle(R - usedTime, s)
    );
    if (mult === 4) n4 = cnt;
    else if (mult === 2) n2 = cnt;
    else n1 = cnt;
    remainingUnits -= cnt * mult;
    usedTime += loopTime(s.anniv, cnt, s);
  }
  return { n4: n4, n2: n2, n1: n1, consumedUnits: n4 * 4 + n2 * 2 + n1, usedTime: usedTime };
}

export function terminal(G, R, s) {
  var units = Math.floor(G / STANDARD_TRIGGER);
  var best = { n4: 0, n2: 0, n1: 0, consumedUnits: -1, usedTime: Infinity };
  for (var k = 0; k < ANNIV_SUBSETS.length; k++) {
    var cand = annivFillForSubset(units, R, s, ANNIV_SUBSETS[k]);
    // 消費ユニット最大を優先し、同点なら所要時間が短い方を採用
    if (cand.consumedUnits > best.consumedUnits ||
      (cand.consumedUnits === best.consumedUnits && cand.usedTime < best.usedTime)) {
      best = cand;
    }
  }

  var consumed = best.consumedUnits * STANDARD_TRIGGER;
  var bonus = best.consumedUnits * POINT_BY_STANDARD_TRIGGER;
  return { A: best.n4 + best.n2 + best.n1, consumed: consumed, bonus: bonus, n4: best.n4, n2: best.n2, n1: best.n1 };
}

// ===== ソルバ本体 =====
// dp[mask][t] = 非アニバ行動にスケール済み時間 t を使って到達できる最大 G。
// mask (2bit): bit0=おすすめ曲ループ開始済, bit1=任意曲ループ開始済。
// 端数チケット（高々1回）は状態に持たず、初期化時に全候補を展開する。
// 配列サイズを TARGET_N 付近に保つよう、残り時間に応じてスケールを調整する。
var TARGET_N = 500000;

export function solve(inp) {
  var s = inp;
  var T_raw = inp.T;
  var G0 = inp.trigger;
  var scale = Math.max(1, Math.floor(TARGET_N / T_raw));
  var N = Math.ceil(T_raw * scale);
  var NEG = -Infinity;

  var first_rec = Math.ceil((s.menu + s.entry + s.recSong + s.exit) * scale);
  var m_rec = Math.ceil((s.recSong + s.betw) * scale);
  var first_arb = Math.ceil((s.menu + s.entry + s.arbSong + s.exit) * scale);
  var m_arb = Math.ceil((s.arbSong + s.betw) * scale);

  var items = buildTicketItems(s, scale);
  var fullItems = [], partialItems = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].r === 1800) fullItems.push(items[i]);
    else partialItems.push(items[i]);
  }

  var dp = [];
  for (var i = 0; i < 4; i++) {
    dp[i] = new Float64Array(N + 1);
    for (var j = 0; j <= N; j++) dp[i][j] = NEG;
  }
  dp[0][0] = G0;
  for (var pi = 0; pi < partialItems.length; pi++) {
    var c = partialItems[pi].costScaled;
    if (c > 0 && c <= N && G0 + partialItems[pi].value > dp[0][c])
      dp[0][c] = G0 + partialItems[pi].value;
  }

  // --- forward pass ---
  for (var t = 0; t <= N; t++) {
    for (var mask = 0; mask < 4; mask++) {
      var g = dp[mask][t];
      if (g <= NEG) continue;

      // おすすめ曲を1回プレイ
      var cRec = (mask & 1) ? m_rec : first_rec;
      if (t + cRec <= N) {
        var nm = mask | 1;
        if (g + STAMINA_REC > dp[nm][t + cRec]) dp[nm][t + cRec] = g + STAMINA_REC;
      }

      // 任意曲を1回プレイ
      var cArb = (mask & 2) ? m_arb : first_arb;
      if (t + cArb <= N) {
        var nm = mask | 2;
        if (g + STAMINA_NON > dp[nm][t + cArb]) dp[nm][t + cArb] = g + STAMINA_NON;
      }

      // フルセットチケット（何回でも）
      for (var fi = 0; fi < fullItems.length; fi++) {
        var c = fullItems[fi].costScaled;
        if (c > 0 && t + c <= N && g + fullItems[fi].value > dp[mask][t + c])
          dp[mask][t + c] = g + fullItems[fi].value;
      }
    }
  }

  // --- terminal evaluation ---
  var bestT = 0, bestMask = 0, bestGain = -Infinity, bestTerm = null;
  for (var t = 0; t <= N; t++) {
    for (var mask = 0; mask < 4; mask++) {
      var G = dp[mask][t];
      if (G <= NEG) continue;
      var term = terminal(G, (N - t) / scale, s);
      var gain = (G - G0) + term.bonus;
      if (gain > bestGain) { bestGain = gain; bestT = t; bestMask = mask; bestTerm = term; }
    }
  }
  if (bestTerm === null) { bestTerm = terminal(G0, T_raw, s); bestT = 0; bestMask = 0; bestGain = bestTerm.bonus; }

  // --- backtrack ---
  var t2 = bestT, mask2 = bestMask;
  var ticketUsed = {};

  // フルセットチケットを剥がす
  var guard = 0;
  while (guard++ < 200000) {
    var matched = false;
    for (var j = 0; j < fullItems.length; j++) {
      var it = fullItems[j];
      var pt = t2 - it.costScaled;
      if (pt >= 0 && dp[mask2][pt] > NEG && dp[mask2][pt] + it.value === dp[mask2][t2]) {
        ticketUsed[it.id] = (ticketUsed[it.id] || 0) + 1; t2 = pt; matched = true; break;
      }
    }
    if (!matched) break;
  }

  // 任意曲を剥がす
  var arbPlays = 0;
  if (mask2 & 2) {
    while (t2 - m_arb >= 0 && dp[mask2][t2 - m_arb] > NEG && dp[mask2][t2 - m_arb] + STAMINA_NON === dp[mask2][t2]) {
      arbPlays++; t2 -= m_arb;
    }
    var pm = mask2 ^ 2;
    if (t2 - first_arb >= 0 && dp[pm][t2 - first_arb] > NEG && dp[pm][t2 - first_arb] + STAMINA_NON === dp[mask2][t2]) {
      arbPlays++; t2 -= first_arb; mask2 = pm;
    }
  }

  // おすすめ曲を剥がす
  var recPlays = 0;
  if (mask2 & 1) {
    while (t2 - m_rec >= 0 && dp[mask2][t2 - m_rec] > NEG && dp[mask2][t2 - m_rec] + STAMINA_REC === dp[mask2][t2]) {
      recPlays++; t2 -= m_rec;
    }
    var pm = mask2 ^ 1;
    if (t2 - first_rec >= 0 && dp[pm][t2 - first_rec] > NEG && dp[pm][t2 - first_rec] + STAMINA_REC === dp[mask2][t2]) {
      recPlays++; t2 -= first_rec; mask2 = pm;
    }
  }

  // 端数チケットの特定（初期化シードから逆算）
  if (t2 > 0) {
    for (var j = 0; j < partialItems.length; j++) {
      var it = partialItems[j];
      if (t2 === it.costScaled && dp[0][t2] === G0 + it.value) {
        ticketUsed[it.id] = 1; break;
      }
    }
  }

  return {
    T: T_raw, G0: G0,
    bestT: bestT / scale,
    bestG: dp[bestMask][bestT],
    triggerEarned: dp[bestMask][bestT] - G0,
    finalGain: bestGain,
    term: bestTerm,
    recPlays: recPlays,
    arbPlays: arbPlays,
    ticketUsed: ticketUsed,
    items: items,
    annivTime: annivSessionTime(bestTerm.n4, bestTerm.n2, bestTerm.n1, s),
    settings: s,
  };
}
