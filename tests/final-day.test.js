"use strict";

import assert from "node:assert/strict";
import { CONST, DEFAULTS } from "../js/config.js";
import { buildFinalDayDefaults } from "../js/storage-core.js";
import {
  solve, terminal, loopTime, buildTicketItems,
  annivMaxByTimeSingle, annivSessionTime, annivFillForSubset,
  ANNIV_SUBSETS, STANDARD_TRIGGER, POINT_BY_STANDARD_TRIGGER, STAMINA_REC, STAMINA_NON,
} from "../js/tools-final-day.js";

// ===== ヘルパー関数のテスト =====

// loopTime: n=0 → 0
assert.equal(loopTime(100, 0, { menu: 5, entry: 3, exit: 2, betw: 1 }), 0, "loopTime n=0");

// loopTime: n=1 → menu + entry + song + exit
assert.equal(
  loopTime(100, 1, { menu: 5, entry: 3, exit: 2, betw: 1 }),
  5 + 3 + 100 + 2,
  "loopTime n=1",
);

// loopTime: n=3 → menu + entry + song*3 + betw*2 + exit
assert.equal(
  loopTime(100, 3, { menu: 5, entry: 3, exit: 2, betw: 1 }),
  5 + 3 + 100 * 3 + 1 * 2 + 2,
  "loopTime n=3",
);

// annivSessionTime
assert.equal(
  annivSessionTime(0, 0, 0, { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 }),
  0,
  "annivSessionTime all zero",
);
assert.equal(
  annivSessionTime(2, 0, 0, { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 }),
  loopTime(100, 2, { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 }),
  "annivSessionTime n4=2 only",
);
assert.equal(
  annivSessionTime(2, 3, 0, { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 }),
  loopTime(100, 2, { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 }) +
    loopTime(100, 3, { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 }),
  "annivSessionTime n4=2 n2=3",
);

// annivMaxByTimeSingle: 時間不足 → 0
assert.equal(
  annivMaxByTimeSingle(0, { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 }),
  0,
  "annivMaxByTimeSingle R=0",
);

// annivMaxByTimeSingle: ちょうど1回分
{
  const s = { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 };
  const onePlay = loopTime(100, 1, s);
  assert.equal(annivMaxByTimeSingle(onePlay, s), 1, "annivMaxByTimeSingle exactly 1 play");
  assert.equal(annivMaxByTimeSingle(onePlay - 1, s), 0, "annivMaxByTimeSingle just under 1 play");
}

// terminal: トリガー0 → ボーナス0
{
  const t = terminal(0, 1000, { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 });
  assert.equal(t.bonus, 0, "terminal G=0 bonus");
  assert.equal(t.consumed, 0, "terminal G=0 consumed");
  assert.equal(t.A, 0, "terminal G=0 total plays");
}

// terminal: トリガーが十分でも時間0 → プレイ不可
{
  const t = terminal(100000, 0, { anniv: 100, menu: 5, entry: 3, exit: 2, betw: 1 });
  assert.equal(t.A, 0, "terminal R=0 total plays");
  assert.equal(t.bonus, 0, "terminal R=0 bonus");
}

// buildTicketItems: トレードオフがある r では 2 候補生成される
{
  const s = { recSong: 100, arbSong: 90, menu: 5, entry: 3, exit: 2, betw: 1, collect1800: 30 };
  const items = buildTicketItems(s, 1);
  const recItems = items.filter((it) => it.variant === "rec");
  const nonItems = items.filter((it) => it.variant === "non");
  assert(recItems.length >= 20, "buildTicketItems rec count >= 20");
  assert(nonItems.length >= 20, "buildTicketItems non count >= 20");
  for (const it of items) {
    assert(it.cost > 0, `ticket item ${it.id} cost > 0`);
    assert(it.value > 0, `ticket item ${it.id} value > 0`);
    assert(it.costScaled > 0, `ticket item ${it.id} costScaled > 0`);
  }
  // トレードオフ候補: 同じ r で 1 セッション版(c2===0)は低コスト、2 セッション版は高ポイント
  const byR = {};
  for (const it of items) {
    const key = it.variant + "_" + it.r;
    if (!byR[key]) byR[key] = [];
    byR[key].push(it);
  }
  for (const [key, group] of Object.entries(byR)) {
    if (group.length === 2) {
      const oneS = group.find((it) => it.c2 === 0);
      const twoS = group.find((it) => it.c2 > 0);
      assert(oneS && twoS, `${key}: tradeoff pair should have 1-session and 2-session`);
      assert(oneS.cost < twoS.cost, `${key}: 1-session should cost less`);
      assert(oneS.value < twoS.value, `${key}: 2-session should yield more points`);
    }
    assert(group.length <= 2, `${key}: at most 2 candidates per (r, variant)`);
  }
}

// ===== solve のテスト =====

function makeInput(overrides) {
  const def = buildFinalDayDefaults();
  return {
    T: 3600,
    trigger: 0,
    points: 0,
    recSong: def.recSong,
    arbSong: def.arbSong,
    collect1800: def.collect1800,
    anniv: def.anniv,
    menu: def.menu,
    entry: def.entry,
    exit: def.exit,
    betw: def.betw,
    buffer: def.buffer,
    ...overrides,
  };
}

// solve: 基本的な整合性チェック
{
  const inp = makeInput({ T: 3600, trigger: 10000, points: 0 });
  const res = solve(inp);
  assert(res.finalGain >= 0, "solve: finalGain >= 0");
  assert(res.bestT >= 0, "solve: bestT >= 0");
  assert(res.bestT <= inp.T, "solve: bestT <= T");
  assert(res.term != null, "solve: term exists");
  assert(res.recPlays >= 0, "solve: recPlays >= 0");
  assert(res.arbPlays >= 0, "solve: arbPlays >= 0");
}

// solve: T が非常に短い場合、行動がほとんど無い
{
  const inp = makeInput({ T: 1, trigger: 0, points: 0 });
  const res = solve(inp);
  assert.equal(res.finalGain, 0, "solve: T=1 finalGain=0");
}

// solve: トリガーが十分にある場合、周年曲でポイントを稼げる
{
  const inp = makeInput({ T: 7200, trigger: 100000 });
  const res = solve(inp);
  assert(res.term.bonus > 0, "solve: large trigger => bonus > 0");
  assert(res.term.A > 0, "solve: large trigger => anniv plays > 0");
}

// solve: 行動時間の合計が T を超えない
{
  const inp = makeInput({ T: 3600, trigger: 5000 });
  const res = solve(inp);
  const songTime = loopTime(inp.recSong, res.recPlays, inp) + loopTime(inp.arbSong, res.arbPlays, inp);
  const annivTime = res.annivTime;
  let ticketTime = 0;
  if (res.items) {
    for (const id of Object.keys(res.ticketUsed)) {
      const item = res.items.find((it) => it.id === id);
      if (item) ticketTime += item.cost * res.ticketUsed[id];
    }
  }
  const totalTime = songTime + annivTime + ticketTime;
  assert(totalTime <= inp.T + 1, `solve: total time (${totalTime}) <= T (${inp.T})`);
}

// solve: 結果のポイント計算が整合的
{
  const inp = makeInput({ T: 5400, trigger: 20000, points: 50000 });
  const res = solve(inp);
  const triggerEarned = res.triggerEarned;
  assert.equal(triggerEarned, res.bestG - inp.trigger, "solve: triggerEarned consistency");
  assert.equal(res.finalGain, triggerEarned + res.term.bonus, "solve: finalGain = triggerEarned + bonus");
}

// ===== 決定論的回帰テスト =====
// 同じ入力に対して同じ結果が返ることを確認

function runRegressionCase(label, inp, expected) {
  const res = solve(inp);
  assert.equal(res.finalGain, expected.finalGain, `${label}: finalGain`);
  assert.equal(res.recPlays, expected.recPlays, `${label}: recPlays`);
  assert.equal(res.arbPlays, expected.arbPlays, `${label}: arbPlays`);
  assert.equal(res.term.n4, expected.n4, `${label}: anniv 4x`);
  assert.equal(res.term.n2, expected.n2, `${label}: anniv 2x`);
  assert.equal(res.term.n1, expected.n1, `${label}: anniv 1x`);
}

const regressionCases = [
  { label: "1h trigger=0", input: makeInput({ T: 3600, trigger: 0, points: 0 }),
    expected: { finalGain: 29283, recPlays: 1, arbPlays: 0, n4: 10, n2: 0, n1: 0 } },
  { label: "1h trigger=50000", input: makeInput({ T: 3600, trigger: 50000, points: 0 }),
    expected: { finalGain: 40812, recPlays: 0, arbPlays: 0, n4: 19, n2: 0, n1: 0 } },
  { label: "2h trigger=0", input: makeInput({ T: 7200, trigger: 0, points: 0 }),
    expected: { finalGain: 60531, recPlays: 0, arbPlays: 0, n4: 21, n2: 0, n1: 0 } },
  { label: "2h trigger=100000", input: makeInput({ T: 7200, trigger: 100000, points: 0 }),
    expected: { finalGain: 81624, recPlays: 0, arbPlays: 0, n4: 38, n2: 0, n1: 0 } },
  { label: "30min trigger=20000", input: makeInput({ T: 1800, trigger: 20000, points: 0 }),
    expected: { finalGain: 19332, recPlays: 0, arbPlays: 0, n4: 9, n2: 0, n1: 0 } },
  { label: "4h trigger=0", input: makeInput({ T: 14400, trigger: 0, points: 0 }),
    expected: { finalGain: 121530, recPlays: 0, arbPlays: 1, n4: 42, n2: 0, n1: 0 } },
];

for (const tc of regressionCases) {
  runRegressionCase(tc.label, tc.input, tc.expected);
}

console.log(
  `PASS: ${regressionCases.length} regression cases + unit tests for final-day solver`,
);
