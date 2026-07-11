"use strict";

/* ============================================================
 * DOM ユーティリティ
 * 要素生成・取得などの汎用ヘルパー（このファイルは DOM のみに依存）
 * ============================================================ */

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return e;
}

function numField(id, labelText, step = "1", placeholder = "", { min = null, max = null } = {}) {
  const wrap = el("div", { class: "field", id: "field_" + id });
  wrap.appendChild(el("label", { for: id, text: labelText }));
  const attrs = { type: "number", id, step };
  if (placeholder) attrs.placeholder = placeholder;
  if (min !== null) attrs.min = String(min);
  if (max !== null) attrs.max = String(max);
  wrap.appendChild(el("input", attrs));
  return wrap;
}

function selectField(id, labelText, opts) {
  const wrap = el("div", { class: "field", id: "field_" + id });
  wrap.appendChild(el("label", { for: id, text: labelText }));
  const sel = el("select", { id });
  for (const [v, t] of opts) sel.appendChild(el("option", { value: v, text: t }));
  wrap.appendChild(sel);
  return wrap;
}

// グループ見出し付きのフィールド群を生成（グループ間は CSS で区切り線）
function groupBlock(title, fieldNodes) {
  const grid = el("div", { class: "grid" });
  for (const n of fieldNodes) grid.appendChild(n);
  return el("div", { class: "group" }, [el("p", { class: "group-title", text: title }), grid]);
}

function setShown(fieldId, shown) {
  const e = $(fieldId);
  if (e) e.style.display = shown ? "" : "none";
}

const WEEKDAY_JP = ["日", "月", "火", "水", "木", "金", "土"];
function dayDateParts(i) {
  const d = new Date(CONST.START_DAY);
  d.setDate(d.getDate() + i);
  return { date: `${d.getMonth() + 1}/${d.getDate()}`, weekday: `（${WEEKDAY_JP[d.getDay()]}）` };
}
function dayDateLabel(i) {
  const { date, weekday } = dayDateParts(i);
  return `${date}${weekday}`;
}
function alignSideDetailsBodies() {
  document.querySelectorAll(".side-details").forEach(container => {
    const bodies = container.querySelectorAll(".side-details-body");
    bodies.forEach(b => b.style.minHeight = "");
    if (window.matchMedia("(max-width: 720px)").matches) return;
    const max = Math.max(...[...bodies].map(b => b.offsetHeight));
    bodies.forEach(b => b.style.minHeight = max + "px");
  });
}

// テーブル見出し用：日付と曜日を別 span に分け、CSS で改行制御できるようにする
function dayDateHeaderCell(i) {
  const { date, weekday } = dayDateParts(i);
  return el("th", {}, [
    el("span", { class: "rec-date", text: date }),
    el("span", { class: "rec-weekday", text: weekday }),
  ]);
}
