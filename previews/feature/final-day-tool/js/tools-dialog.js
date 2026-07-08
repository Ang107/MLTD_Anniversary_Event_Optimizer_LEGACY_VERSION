"use strict";

// 確認ダイアログの共通基盤。tools-counter.js / tools-final-day.js から使う。
// 呼び出し側は showDialog() でダイアログを開き、返り値の close() で閉じる。
// eslint-disable-next-line no-unused-vars
var toolsEl, showDialog, makeDialogDiffItem;

(function () {
  toolsEl = function (tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  var el = toolsEl;

  function makeBtn(text, className, handler) {
    var btn = el("button", "counter-dialog-btn " + className);
    btn.type = "button";
    btn.textContent = text;
    btn.addEventListener("click", handler);
    return btn;
  }

  /**
   * showDialog(opts) — 確認ダイアログを表示する。
   *
   * opts.id        — overlay 要素の id（重複防止・close 用）
   * opts.title     — ダイアログのタイトル文字列
   * opts.body      — DOM ノードの配列（本文・リストなど自由に構成）
   * opts.buttons   — [{ text, className, handler }]（左から順に配置）
   * opts.onEscape  — Escape 押下時のコールバック（省略時は close のみ）
   *
   * 戻り値: { close }
   */
  showDialog = function (opts) {
    var id = opts.id;

    // 既存のダイアログがあれば閉じる
    var prev = document.getElementById(id);
    if (prev) prev.remove();

    var overlay = el("div", "counter-dialog-overlay");
    overlay.id = id;
    overlay.setAttribute("role", "presentation");

    var dialog = el("div", "counter-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", id + "Title");

    var heading = el("h2", "counter-dialog-title", opts.title);
    heading.id = id + "Title";
    dialog.appendChild(heading);

    if (opts.body) {
      opts.body.forEach(function (node) { dialog.appendChild(node); });
    }

    var actions = el("div", "counter-dialog-actions");
    var firstBtn = null;
    if (opts.buttons) {
      opts.buttons.forEach(function (b) {
        var btn = makeBtn(b.text, b.className, b.handler);
        if (!firstBtn && b.className.indexOf("counter-dialog-primary") !== -1) firstBtn = btn;
        actions.appendChild(btn);
      });
    }
    dialog.appendChild(actions);
    overlay.appendChild(dialog);

    function onKeydown(event) {
      if (event.key !== "Escape") return;
      close();
      if (opts.onEscape) opts.onEscape();
    }

    function close() {
      var existing = document.getElementById(id);
      if (existing) existing.remove();
      document.removeEventListener("keydown", onKeydown);
    }

    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKeydown);

    var focus = firstBtn || actions.querySelector(".counter-dialog-cancel");
    if (focus) focus.focus();

    return { close: close };
  };

  makeDialogDiffItem = function (label, prev, next) {
    var li = el("li", "counter-dialog-diff-item");
    li.appendChild(el("span", "counter-dialog-diff-label", label));
    var val = el("span", "counter-dialog-diff-value");
    val.appendChild(document.createTextNode(prev.toLocaleString()));
    val.appendChild(el("span", "counter-dialog-diff-arrow", "→"));
    val.appendChild(document.createTextNode(next.toLocaleString()));
    li.appendChild(val);
    return li;
  };
})();
