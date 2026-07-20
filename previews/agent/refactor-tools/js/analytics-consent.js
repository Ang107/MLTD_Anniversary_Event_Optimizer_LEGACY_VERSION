"use strict";
import { createConsentState } from "./analytics-consent-state.js";

/* ============================================================
 * Google Analytics の同意管理
 *
 * 同意を得るまで Google タグを読み込まない Basic Consent Mode。
 * 同意の選択は、このブラウザの localStorage に保存する。
 * ============================================================ */
(() => {
  const MEASUREMENT_ID = "G-686RPPW2CF";
  // Analytics同意はブランチプレビューを含むサイト全体で共有するため、
  // storage-core.js の scopedKey() を使わず、安定したキー名を維持する。
  const STORAGE_KEY = "mltd_analytics_consent";
  const DISABLE_KEY = "ga-disable-" + MEASUREMENT_ID;
  // 初回表示で一定時間操作がなければ「拒否」とみなして自動的に閉じる。
  const AUTO_DISMISS_MS = 12000;
  const consentState = createConsentState(STORAGE_KEY);
  let banner;
  let autoDismissTimer;

  const DEBUG = /[?&]ga_debug=1(?:&|$)/.test(location.search);

  function readConsent() {
    return consentState.read();
  }

  function saveConsent(value) {
    // ストレージが利用できない環境では、そのページを開いている間だけ反映する。
    consentState.write(value);
  }

  function loadGoogleAnalytics() {
    window[DISABLE_KEY] = false;
    if (window.__mltdGoogleAnalyticsLoaded) {
      // 一度ロード済みなら、ga-disable フラグを解除するだけで計測が再開する。
      window.gtag("config", MEASUREMENT_ID, DEBUG ? { debug_mode: true } : {});
      return;
    }
    window.__mltdGoogleAnalyticsLoaded = true;

    // この関数は同意取得後にのみ呼ばれるため、計測を有効化した状態で初期化する。
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, DEBUG ? { debug_mode: true } : {});

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(script);
  }

  function disableGoogleAnalytics() {
    // ga-disable フラグを立てると、以後 gtag は計測を送信しなくなる。
    window[DISABLE_KEY] = true;

    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.trim().split("=")[0];
      if (name === "_ga" || name.startsWith("_ga_")) {
        document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax";
      }
    });
  }

  function hideBanner() {
    clearTimeout(autoDismissTimer);
    if (banner) {
      banner.classList.remove("is-visible");
      banner.hidden = true;
    }
  }

  function showBanner(autoDismiss) {
    if (!banner) {
      banner = document.createElement("aside");
      banner.className = "analytics-consent-banner";
      banner.setAttribute("role", "region");
      banner.setAttribute("aria-labelledby", "analytics-consent-title");
      banner.innerHTML = `
        <button type="button" class="analytics-consent-close" aria-label="閉じる（拒否する）">×</button>
        <div class="analytics-consent-content">
          <strong id="analytics-consent-title">アクセス解析にCookieを使用します</strong>
          <p>当サイトでは、利用状況の把握と改善のためGoogle Analyticsを使用しています。許可すると、Cookieを用いたアクセス解析が有効になります。</p>
          <a href="privacy.html">プライバシーポリシー</a>
        </div>
        <div class="analytics-consent-actions">
          <button type="button" class="analytics-consent-decline">拒否する</button>
          <button type="button" class="analytics-consent-accept">許可する</button>
        </div>`;
      document.body.appendChild(banner);
      // ×ボタンと「拒否する」は同じ挙動（計測せず「拒否」として閉じる）。
      const decline = () => {
        saveConsent("denied");
        disableGoogleAnalytics();
        hideBanner();
      };
      banner.querySelector(".analytics-consent-close").addEventListener("click", decline);
      banner.querySelector(".analytics-consent-decline").addEventListener("click", decline);
      banner.querySelector(".analytics-consent-accept").addEventListener("click", () => {
        saveConsent("granted");
        try { loadGoogleAnalytics(); } catch (_) {}
        hideBanner();
      });
    }
    banner.hidden = false;
    // 次フレームで is-visible を付与し、CSS のスライドインを発火させる。
    requestAnimationFrame(() => banner.classList.add("is-visible"));

    clearTimeout(autoDismissTimer);
    if (autoDismiss) {
      // 放置された場合は「拒否」として扱い、計測を行わずに閉じる。
      autoDismissTimer = setTimeout(() => {
        saveConsent("denied");
        disableGoogleAnalytics();
        hideBanner();
      }, AUTO_DISMISS_MS);
    }
  }

  function resetConsent() {
    // 読み書きできない環境では、バナーを再表示するだけにする。
    consentState.clear();
    disableGoogleAnalytics();
    // 設定変更のため自分で開き直したときは、自動で閉じない。
    showBanner(false);
    banner.scrollIntoView({ behavior: "smooth", block: "nearest" });
    banner.querySelector(".analytics-consent-accept").focus();
  }

  if (readConsent() === "granted") {
    loadGoogleAnalytics();
  } else if (readConsent() !== "denied") {
    showBanner(true);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-analytics-consent-reset]")) resetConsent();
  });
})();
