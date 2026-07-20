"use strict";

export const PLAY_TYPES = {
  login:       { label: "ログイントリガー", shortLabel: "ログイン", pt: 0, tr: 540, buttons: [{ delta: -1 }, { delta: 1 }] },
  mission:     { label: "おすすめ楽曲ミッション", pt: 0, tr: 1000, buttons: [{ delta: -4 }, { delta: -1 }, { delta: 1 }, { delta: 4 }] },
  anniversary4x: { label: "周年曲4倍ライブ", pt: 2148, tr: -720, buttons: [{ delta: -1 }, { delta: 1 }] },
  anniversary10x: { label: "周年曲10倍ライブ", pt: 5370, tr: -1800, buttons: [{ delta: -1 }, { delta: 1 }] },
  anniversaryBoost: {
    label: "ブースト回数",
    logLabel: "周年曲ブースト",
    pt: 2148,
    tr: 0,
    buttons: [{ delta: -10 }, { delta: -1 }, { delta: 1 }, { delta: 10 }],
    cap: (counts) => counts.anniversary4x,
    capLabel: "4倍のプレイ回数",
  },
  normal1800: { label: "チケット450枚消費ライブ×4", pt: 4284, tr: 4284, buttons: [{ delta: -1 }, { delta: 1 }] },
  normal450: { label: "チケット450枚消費ライブ単発", pt: 1071, tr: 1071, buttons: [{ delta: -1 }, { delta: 1 }] },
  normalBoost: {
    label: "ブースト回数",
    logLabel: "通常曲ブースト",
    pt: 1071,
    tr: 1071,
    buttons: [{ delta: -10 }, { delta: -1 }, { delta: 1 }, { delta: 10 }],
    cap: (counts) => counts.normal1800 * 4 + counts.normal450,
    capLabel: "通常曲の合計プレイ回数",
  },
};

export const COUNTER_ROWS = [
  { group: "デイリー", ids: ["login", "mission"] },
  { group: "通常曲（おすすめ楽曲）", ids: ["normal1800", "normal450"] },
  { group: null, ids: ["normalBoost"] },
  { group: "周年曲", ids: ["anniversary4x", "anniversary10x"] },
  { group: null, ids: ["anniversaryBoost"] },
];

export const HISTORY_MAX = 1000;

export function createEmptyCounts() {
  return Object.fromEntries(Object.keys(PLAY_TYPES).map((id) => [id, 0]));
}

export function normalizeCounterState(data, defaults) {
  const counts = createEmptyCounts();
  if (data?.counts) {
    for (const id of Object.keys(PLAY_TYPES)) {
      const value = data.counts[id];
      if (typeof value === "number" && Number.isFinite(value)) counts[id] = Math.max(0, value);
    }
  }
  return {
    counts,
    initialPt: typeof data?.initialPt === "number" && Number.isFinite(data.initialPt)
      ? data.initialPt
      : defaults.initialPt,
    initialTr: typeof data?.initialTr === "number" && Number.isFinite(data.initialTr)
      ? data.initialTr
      : defaults.initialTr,
    history: Array.isArray(data?.history) ? data.history.slice(0, HISTORY_MAX) : [],
  };
}

export function calculateCounterTotals(counts, initialPt, initialTr) {
  let pt = initialPt;
  let tr = initialTr;
  for (const [id, type] of Object.entries(PLAY_TYPES)) {
    let count = counts[id] || 0;
    if (type.cap) count = Math.min(count, type.cap(counts));
    pt += type.pt * count;
    tr += type.tr * count;
  }
  return { pt, tr };
}

export function prependHistory(history, fields, totals, now = Date.now()) {
  const entry = { ts: now, pt: totals.pt, tr: totals.tr };
  if (fields.op != null) entry.op = fields.op;
  if (fields.action != null) entry.action = fields.action;
  return [entry, ...history].slice(0, HISTORY_MAX);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function entryDate(entry) {
  return typeof entry.ts === "number" ? new Date(entry.ts) : null;
}

export function formatHistoryTime(entry) {
  const date = entryDate(entry);
  if (!date) return entry.time || "";
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}

export function formatHistoryDateTime(entry) {
  const date = entryDate(entry);
  if (!date) return entry.time || "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${formatHistoryTime(entry)}`;
}

function csvEscape(value) {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function historyToCsv(history) {
  const rows = [["datetime", "action", "point", "trigger"]];
  for (const entry of history.slice().reverse()) {
    rows.push([
      formatHistoryDateTime(entry),
      entry.action != null ? entry.action : "",
      entry.pt != null ? entry.pt : "",
      entry.tr != null ? entry.tr : "",
    ]);
  }
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

export function formatFilenameTimestamp(date = new Date()) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}
