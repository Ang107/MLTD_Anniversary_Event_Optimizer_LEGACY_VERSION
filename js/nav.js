"use strict";

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
