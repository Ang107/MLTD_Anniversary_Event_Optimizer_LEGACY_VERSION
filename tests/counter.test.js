"use strict";

import assert from "node:assert/strict";
import {
  HISTORY_MAX, calculateCounterTotals, createEmptyCounts, formatFilenameTimestamp,
  formatHistoryDateTime, historyToCsv, normalizeCounterState, prependHistory,
} from "../js/counter-core.js";

const counts = createEmptyCounts();
counts.login = 1;
counts.mission = 4;
counts.anniversary4x = 2;
counts.anniversaryBoost = 5;
counts.normal1800 = 1;
counts.normal450 = 1;
counts.normalBoost = 9;

assert.deepEqual(
  calculateCounterTotals(counts, 100, 200),
  {
    pt: 100 + 2148 * 2 + 2148 * 2 + 4284 + 1071 + 1071 * 5,
    tr: 200 + 540 + 1000 * 4 - 720 * 2 + 4284 + 1071 + 1071 * 5,
  },
  "ブースト回数は対応するプレイ回数を上限として集計する",
);

const normalized = normalizeCounterState({
  counts: { login: 3, mission: -2, normal450: Number.NaN, unknown: 99 },
  initialPt: 123,
  initialTr: Number.POSITIVE_INFINITY,
  history: Array.from({ length: HISTORY_MAX + 2 }, (_, i) => ({ i })),
}, { initialPt: 10, initialTr: 20 });
assert.equal(normalized.counts.login, 3);
assert.equal(normalized.counts.mission, 0);
assert.equal(normalized.counts.normal450, 0);
assert.equal(normalized.counts.unknown, undefined);
assert.equal(normalized.initialPt, 123);
assert.equal(normalized.initialTr, 20);
assert.equal(normalized.history.length, HISTORY_MAX);

const first = { ts: new Date(2026, 0, 2, 3, 4, 5).getTime(), action: "first", pt: 10, tr: 20 };
const history = prependHistory([first], { action: 'second,"quoted"', op: "操作" }, { pt: 30, tr: 40 }, first.ts + 1000);
assert.equal(history.length, 2);
assert.equal(history[0].action, 'second,"quoted"');
assert.equal(formatHistoryDateTime(first), "2026-01-02 03:04:05");
assert.equal(formatFilenameTimestamp(new Date(2026, 0, 2, 3, 4, 5)), "20260102-030405");

const csv = historyToCsv(history);
assert.equal(csv.split("\r\n")[0], "datetime,action,point,trigger");
assert.match(csv.split("\r\n")[1], /,first,10,20$/);
assert.match(csv.split("\r\n")[2], /,"second,""quoted""",30,40$/);

console.log("PASS counter core tests");
