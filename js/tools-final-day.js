"use strict";
import { CONST } from "./config.js";
import { STORAGE_KEYS, buildFinalDayDefaults, migrateOptimizerData, scopedKey } from "./storage-core.js";
import { makeDialogDiffItem, showDialog, toolsEl } from "./tools-dialog.js";

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

  // ===== 固定値（CONST から取り出し） =====
  export const STANDARD_TRIGGER = CONST.STANDARD_TRIGGER;
  export const POINT_BY_STANDARD_TRIGGER = CONST.POINT_BY_STANDARD_TRIGGER;
  // JST 2026-07-13 00:00 = UTC 2026-07-12T15:00:00Z（TZ非依存にするためUTC指定）
  var EVENT_END = new Date(Date.UTC(2026, 6, 12, 15, 0, 0));
  var MAX_EVENT_SEC = 24 * 3600;
  // ===== 最終日DP固有の定数（ゲーム仕様） =====
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

  function saveState() {
    try {
      var data = readInput();
      localStorage.setItem(scopedKey(STORAGE_KEYS.FINAL_DAY), JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }
  function loadState() {
    try {
      var raw = localStorage.getItem(scopedKey(STORAGE_KEYS.FINAL_DAY));
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  var DEF = buildFinalDayDefaults();

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
      var raw = localStorage.getItem(scopedKey(STORAGE_KEYS.SIMULATOR));
      if (!raw) { alert("オプティマイザーの保存データが見つかりません。"); return; }
      var data = JSON.parse(raw);
      if (!data) { alert("オプティマイザーの保存データの形式が不正です。"); return; }
      var s = migrateOptimizerData(data);
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
    if (window.trackEvent) window.trackEvent("final_day_calc");
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
