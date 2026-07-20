"use strict";
import { trackEvent } from "./analytics.js";

/* ============================================================
 * 使い方解説動画リンク
 * ============================================================ */
document.addEventListener("click", (event) => {
  const link = event.target.closest(".nav-video-link");
  if (!link) return;
  event.preventDefault();
  trackEvent("video_link_click");
  window.open(link.href, "_blank", "");
});

/* ============================================================
 * 公開バージョン一覧への共通リンク
 *
 * プレビューからもサイトルートの一覧ページへ移動できるよう、実行環境に
 * 応じた絶対パスをフッターへ追加する。一覧の内容は versions.json 側で管理する。
 * ============================================================ */
(function () {
  function init() {
    const footer = document.querySelector(".site-footer");
    if (!footer) return;

    const PROD_BASE_PATH = "/MLTD_Anniversary_Event_Optimizer_LEGACY_VERSION/";
    const basePath = location.hostname === "ang107.github.io" ? PROD_BASE_PATH : "/";
    const row = document.createElement("p");
    const link = document.createElement("a");
    link.href = `${basePath}versions.html`;
    link.textContent = "バージョン一覧";
    row.appendChild(link);
    footer.appendChild(row);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* ============================================================
 * モバイル用ページ切り替えナビ（ハンバーガーメニュー）
 *   全ページ共通。デスクトップでは CSS でトグルを隠し、ナビは常時表示。
 *   モバイルでは .nav-toggle のタップで .page-nav を開閉する。
 * ============================================================ */
(function () {
  function init() {
    const toggle = document.querySelector(".nav-toggle");
    const nav = document.getElementById("pageNav");
    if (!toggle || !nav) return;

    const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
    function setOpen(open) {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation(); // 直後の document クリックで即閉じしないように
      setOpen(!isOpen());
    });
    // メニュー内のクリックは外側クリック扱いにしない（リンク遷移はそのまま通す）
    nav.addEventListener("click", (e) => e.stopPropagation());
    // メニュー外をクリック / Escape で閉じる
    document.addEventListener("click", () => { if (isOpen()) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) setOpen(false); });
    // デスクトップ幅に戻ったら開閉状態をリセット（aria を整える）
    const mq = window.matchMedia("(min-width: 721px)");
    mq.addEventListener("change", (ev) => { if (ev.matches) setOpen(false); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* ============================================================
 * 「便利ツール」プルダウン（PC のみ。モバイルではボタン自体を非表示にする）
 * ============================================================ */
(function () {
  function init() {
    const toggle = document.querySelector(".nav-dropdown-toggle");
    const menu = document.querySelector(".nav-dropdown-menu");
    if (!toggle || !menu) return;

    const isOpen = () => !menu.hidden;
    // header の overflow:hidden にクリップされないよう fixed 配置のため、開くたびに座標を計算する
    function positionMenu() {
      const rect = toggle.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      menu.style.top = `${rect.bottom + 8}px`;
      menu.style.left = "auto";
      menu.style.right = `${viewportWidth - rect.right}px`;
    }
    function setOpen(open) {
      if (open) positionMenu();
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(!isOpen());
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => { if (isOpen()) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen()) setOpen(false); });
    window.addEventListener("resize", () => { if (isOpen()) setOpen(false); });
    window.addEventListener("scroll", () => { if (isOpen()) setOpen(false); }, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
