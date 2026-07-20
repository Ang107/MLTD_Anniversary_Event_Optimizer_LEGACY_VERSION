"use strict";

(function () {
  const PROD_BASE_PATH = "/MLTD_Anniversary_Event_Optimizer_LEGACY_VERSION/";

  function registryURL() {
    const basePath = location.hostname === "ang107.github.io" ? PROD_BASE_PATH : "/";
    return new URL(`${basePath}versions.json`, location.origin);
  }

  function renderVersions(versions) {
    const list = document.getElementById("versionList");
    if (!list) return;
    list.innerHTML = "";

    for (const version of versions) {
      const article = document.createElement("article");
      article.className = "version-card";

      const link = document.createElement("a");
      link.className = "version-card-link";
      link.href = version.url;

      const copy = document.createElement("div");
      copy.className = "version-card-copy";

      const titleRow = document.createElement("div");
      titleRow.className = "version-card-title-row";

      const heading = document.createElement("h3");
      heading.textContent = version.label;
      titleRow.appendChild(heading);

      if (version.id === "latest") {
        const badge = document.createElement("span");
        badge.className = "version-card-badge";
        badge.textContent = "LATEST";
        titleRow.appendChild(badge);
      }

      copy.appendChild(titleRow);

      if (version.description) {
        const description = document.createElement("p");
        description.textContent = version.description;
        copy.appendChild(description);
      }

      const arrow = document.createElement("span");
      arrow.className = "version-card-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "→";

      link.append(copy, arrow);
      article.appendChild(link);
      list.appendChild(article);
    }
  }

  function showError() {
    const list = document.getElementById("versionList");
    if (list) list.textContent = "バージョン一覧を読み込めませんでした。時間をおいて再度お試しください。";
  }

  async function init() {
    try {
      const response = await fetch(registryURL(), { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      const versions = Array.isArray(data.versions)
        ? data.versions.filter((version) => version
          && typeof version.label === "string"
          && typeof version.url === "string")
        : [];
      if (versions.length === 0) throw new Error("公開版が登録されていません");
      renderVersions(versions);
    } catch (error) {
      console.warn("公開版一覧を取得できませんでした。", error);
      showError();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
