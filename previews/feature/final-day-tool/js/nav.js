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
