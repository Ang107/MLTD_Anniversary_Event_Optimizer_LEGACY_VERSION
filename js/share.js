"use strict";

/* ============================================================
 * 設定の共有（URL生成・X共有・URLからの復元）
 *
 * 現在の入力を lz-string で圧縮して URL ハッシュ（#s=...）に格納する。
 * 静的ホスティング前提のため、状態はすべて URL 自身に載せる。
 * 形式は書き出し（buildExportData）と同じで、importJSON で復元する。
 * ============================================================ */
const SHARE_HASH_KEY = "s";

// 現在の入力状態から共有用URLを生成する。失敗時は null。
function buildShareURL() {
  try {
    const json = JSON.stringify(buildExportData());
    const packed = LZString.compressToEncodedURIComponent(json);
    const base = location.origin + location.pathname;
    return `${base}#${SHARE_HASH_KEY}=${packed}`;
  } catch (e) {
    return null;
  }
}

// ハッシュに共有状態があれば取り込む。取り込んだら true。
function loadStateFromHash() {
  const hash = location.hash || "";
  const m = hash.match(new RegExp(`[#&]${SHARE_HASH_KEY}=([^&]+)`));
  if (!m) return false;
  let json;
  try {
    json = LZString.decompressFromEncodedURIComponent(m[1]);
  } catch (e) {
    json = null;
  }
  if (!json) {
    showErrors(["共有URLの読み込みに失敗しました。リンクが壊れている可能性があります。"]);
    return false;
  }
  importJSON(json); // 検証・マージ・画面反映はインポート処理に委譲
  return true;
}

// 文字列をクリップボードへコピー（フォールバック付き）。成否を Promise<boolean> で返す。
function copyTextToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
  }
  // 非セキュアコンテキスト向けフォールバック
  return new Promise((resolve) => {
    try {
      const ta = el("textarea", { value: text });
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      resolve(ok);
    } catch (e) { resolve(false); }
  });
}

// メニュー項目のラベル（内部 span）に一時的なフィードバックを表示する。
// SVG アイコンは残したいので textContent ではなく span を書き換える。
function flashMenuItem(btn, text) {
  const span = btn && btn.querySelector("span");
  if (!span) return;
  if (btn.__flashTimer) clearTimeout(btn.__flashTimer);
  if (btn.__origLabel === undefined) btn.__origLabel = span.textContent;
  span.textContent = text;
  btn.__flashTimer = setTimeout(() => {
    span.textContent = btn.__origLabel;
    btn.__flashTimer = null;
  }, 1600);
}

// 「リンクをコピー」の動作。クリップボードへコピーし、項目内に結果を表示する。
function copyShareLink() {
  const url = buildShareURL();
  const btn = $("copyLinkBtn");
  if (!url) { showErrors(["共有URLの生成に失敗しました。"]); return; }
  copyTextToClipboard(url).then((ok) => {
    if (ok) flashMenuItem(btn, "✓ コピーしました");
    else window.prompt("以下のURLをコピーしてください", url);
  });
}

// X 共有用のメッセージ本文（最終ポイント・合計稼働時間を含む）。
function buildShareText() {
  const points = (typeof lastFinalPointsText === "string" && lastFinalPointsText) || "—";
  const time = (typeof lastTotalTimeText === "string" && lastTotalTimeText) || "—";
  return "ミリシタ9th周年イベントの計画を立てました！\n\n"
    + `最終ポイント：${points}\n`
    + `合計稼働時間：${time}\n\n`
    + "▼ プランの詳細を見る／自分の計画を作る ▼";
}

// 「Xで共有」の動作。

function shareToX() {
  const url = buildShareURL();
  if (!url) {
    showErrors(["共有URLの生成に失敗しました。"]);
    return;
  }

  const intent = new URL("https://twitter.com/intent/tweet");

  intent.searchParams.set("url", url);
  intent.searchParams.set("text", "#MLTD_9th_Optimizer\n\n" + buildShareText());

  window.open(intent.toString(), "_blank", "");
}

/* ---------------- 共有ポップオーバー ---------------- */
// 結果枠右上の「共有」ボタンの表示/非表示を切り替える。
function setShareButtonVisible(visible) {
  const btn = $("shareBtn");
  if (btn) btn.style.display = visible ? "" : "none";
  if (!visible) closeSharePopover();
}

function openSharePopover() {
  const pop = $("sharePopover");
  const btn = $("shareBtn");
  if (!pop) return;
  pop.hidden = false;
  if (btn) btn.setAttribute("aria-expanded", "true");
  document.addEventListener("keydown", onSharePopoverKeydown);
  // 同じクリックで即閉じしないよう、次フレーム以降に外側クリック監視を開始
  setTimeout(() => document.addEventListener("click", onDocClickCloseShare), 0);
}

function closeSharePopover() {
  const pop = $("sharePopover");
  const btn = $("shareBtn");
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
  document.removeEventListener("keydown", onSharePopoverKeydown);
  document.removeEventListener("click", onDocClickCloseShare);
}

function toggleSharePopover() {
  const pop = $("sharePopover");
  if (pop && pop.hidden) openSharePopover();
  else closeSharePopover();
}

function onSharePopoverKeydown(e) {
  if (e.key === "Escape") { closeSharePopover(); const b = $("shareBtn"); if (b) b.focus(); }
}

function onDocClickCloseShare(e) {
  const pop = $("sharePopover");
  const btn = $("shareBtn");
  if (!pop || pop.hidden) return;
  if (pop.contains(e.target) || (btn && btn.contains(e.target))) return;
  closeSharePopover();
}

// 共有まわりのイベントを一括で紐付ける（init から呼ぶ）。
// X 共有はデフォ文言・ハッシュタグを確実に prefill するため、全端末で
// ポップオーバー →「Xで共有」(x.com/intent/post) に統一する。
function bindShareUI() {
  const trigger = $("shareBtn");
  if (trigger) trigger.addEventListener("click", toggleSharePopover);
  const x = $("shareXBtn");
  if (x) x.addEventListener("click", () => { shareToX(); closeSharePopover(); });
  const copy = $("copyLinkBtn");
  if (copy) copy.addEventListener("click", copyShareLink);
}
