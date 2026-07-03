"use strict";

/* ============================================================
 * 実行
 * ============================================================ */
function showErrors(errors, scroll = true) {
  const box = $("errors");
  box.classList.remove("unexpected-error");
  if (errors.length === 0) { box.style.display = "none"; box.innerHTML = ""; return; }
  box.style.display = "block";
  box.innerHTML = "";
  box.appendChild(el("h3", { text: "入力エラー（修正してください）" }));
  const ul = el("ul");
  for (const e of errors) ul.appendChild(el("li", { text: e }));
  box.appendChild(ul);
  if (scroll) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildUnexpectedErrorReport(err, state) {
  const base = {
    type: "unexpected_optimization_error",
    message: err && err.message ? err.message : String(err),
    stack: err && err.stack ? err.stack : "",
    url: location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  };
  // 正常時は共有/エクスポートと共通フォーマット、失敗時は内部 state（fallback フラグで区別）
  let input;
  try { input = buildExportData(); }
  catch (e) { input = { fallback: true, state }; }

  // レポート生成は「最後の砦」なので、ここでは何があっても例外を投げない
  try {
    return JSON.stringify({ ...base, input }, null, 2);
  } catch (e) {
    return JSON.stringify({ ...base, input: "(serialization failed)" }, null, 2);
  }
}

function showUnexpectedError(err, state, scroll = true) {
  const box = $("errors");
  const message = err && err.message ? err.message : String(err);
  const report = buildUnexpectedErrorReport(err, state);
  const COPY_LABEL = "入力内容とエラー情報をコピー";
  box.style.display = "block";
  box.classList.add("unexpected-error");
  box.innerHTML = "";

  box.appendChild(el("h3", { text: "予期せぬエラーが発生しました" }));

  box.appendChild(el("p", { class: "error-help" },
    "最適化の計算中に想定外のエラーが発生しました。",
  ));
  box.appendChild(el("p", { class: "error-help" }, [
    "繰り返し発生する場合は、お手数ですが下のボタンで入力内容とエラー情報をコピーのうえ、",
    el("a", {
      href: "https://x.com/Ang_imas",
      target: "_blank",
      rel: "noopener noreferrer",
      text: "管理者",
    }),
    "までお知らせいただけると修正に役立ちます。",
  ]));

  const copyBtn = el("button", { type: "button", class: "error-copy-btn", text: COPY_LABEL });
  copyBtn.addEventListener("click", () => {
    copyTextToClipboard(report).then((ok) => {
      if (ok) {
        copyBtn.classList.add("copied");
        copyBtn.textContent = "コピーしました";
        if (copyBtn.__resetTimer) clearTimeout(copyBtn.__resetTimer);
        copyBtn.__resetTimer = setTimeout(() => {
          copyBtn.classList.remove("copied");
          copyBtn.textContent = COPY_LABEL;
        }, 1600);
      } else {
        window.prompt("以下の内容をコピーしてください", report);
      }
    });
  });
  box.appendChild(copyBtn);

  const details = el("details", { class: "unexpected-error-details" }, [
    el("summary", { text: "エラー詳細を表示" }),
    el("pre", { text: message }),
  ]);
  box.appendChild(details);

  if (scroll) box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 入力確定（change）のたびに検証し、エラーをリアルタイム表示（結果欄は更新しない）
function liveValidate() {
  highlightRecDuplicates();
  updateRecSongTimes();
  const { errors, fieldErrors } = validate(gatherState());
  applyFieldErrors(fieldErrors);
  showErrors(errors, false);
  saveState();
  if (hasResult) setStale(true); // 表示中の結果は入力変更で古くなる
}

function setResult(text, isEmpty = false) {
  const r = $("result");
  r.textContent = text;
  r.classList.toggle("empty", isEmpty);
  r.classList.remove("loading"); // 計算中以外ではスピナーを消す
}

// 横スクロールするテーブルを影ラッパーで包み、はみ出している側だけ
// フェードを重ねる。inset 影と違いセル背景に隠れない。
function setupScrollShadows(c) {
  if (c.__shadowBound) return;
  c.__shadowBound = true;
  const wrap = document.createElement("div");
  wrap.className = "scroll-shadow-wrap";
  c.parentNode.insertBefore(wrap, c);
  wrap.appendChild(c);
  const update = () => {
    const max = c.scrollWidth - c.clientWidth - 1;
    wrap.classList.toggle("scroll-start", c.scrollLeft > 1);
    wrap.classList.toggle("scroll-end", c.scrollLeft < max);
  };
  c.addEventListener("scroll", update, { passive: true });
  // 列幅変化・詳細行の開閉でも再判定する
  if (window.ResizeObserver) new ResizeObserver(update).observe(c);
  requestAnimationFrame(update);
}

function bindScrollShadows(root = document) {
  root.querySelectorAll(".table-scroll, .detail-table-scroll").forEach(setupScrollShadows);
}

function buildOptionParams(setting) {
  const bool = (v) => (v ? 1 : 0);
  return {
    boost_mode: setting.BOOST_MODE,
    running_mode: setting.RUNNING_MODE,
    simulate_start_day: setting.SIMULATE_START_DAY,
    confirmed_schedule: bool(setting.CONFIRMED_RECOMMENDED_SONGS_SCHEDULE),
    start_login_trigger: bool(setting.START_DAY_LOGIN_TRIGGER_OBTAINED),
    start_mission_trigger: bool(setting.START_DAY_MISSION_TRIGGER_OBTAINED),
    start_boost_used: bool(setting.START_DAY_BOOST_USED),
    start_anniv10x_done: bool(setting.START_DAY_ANNIV10X_DONE),
  };
}

function run() {
  const state = gatherState();
  highlightRecDuplicates();
  const { errors, fieldErrors } = validate(state);
  applyFieldErrors(fieldErrors);
  if (errors.length > 0) {
    showErrors(errors);
    setResult("入力エラーのため最適化できませんでした。", true);
    hasResult = false; setStale(false); setShareButtonVisible(false);
    return;
  }
  showErrors([]);

  const setting = state;

  // 重い計算の前にボタンを無効化して「計算中…」を描画（同期計算によるフリーズを体感させない）
  const btn = $("runBtn");
  btn.disabled = true;
  btn.classList.add("is-loading");
  btn.textContent = "計算中…";
  setResult("計算中です…", true);
  $("result").classList.add("loading");

  // 「計算中…」を確実に描画してから同期計算を実行（二重 requestAnimationFrame で描画を1フレーム挟む）
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try {
      const sim = buildSimulator(setting);
      const baseTimesSec = setting.CAN_RUNNING_TIME_HOUR.map((h) => 3600 * h);
      const confirmed = setting.CONFIRMED_RECOMMENDED_SONGS_SCHEDULE;
      // クランプ（リフレッシュ・開始時刻）後の稼働可能時間に日ごとのバッファ（秒）を適用した実効予算。
      // TIME_MINIMIZE では倍率 m 適用後に同じ処理が binarySearchMinRatio 内で行われる。
      const availableTimeSec = sim.availableRunningTimeSec(baseTimesSec);
      let node;

      if (setting.RUNNING_MODE === "POINT_MAXIMIZE") {
        node = confirmed
          ? renderResultConfirmed(sim.solveConfirmed(availableTimeSec), sim, setting, false, availableTimeSec)
          : renderResultUnconfirmed(sim.solveUnconfirmed(availableTimeSec), setting, false, availableTimeSec);
      } else {
        // TIME_MINIMIZE
        if (confirmed) {
          const [ans, found] = sim.binarySearchMinRatio(
            (t) => sim.solveConfirmed(t), baseTimesSec, (a) => a.calcFinalPoints());
          node = renderResultConfirmed(ans, sim, setting, !found, availableTimeSec);
        } else {
          const scheduleSamples = sim.createUnconfirmedScheduleSamples();
          const [ans, found] = sim.binarySearchMinRatio(
            (t) => sim.solveUnconfirmed(t, scheduleSamples, availableTimeSec), baseTimesSec, (a) => a.expectedFinalPoints);
          node = renderResultUnconfirmed(ans, setting, !found, availableTimeSec);
        }
      }
      showResultNode(node);
      window.trackEvent?.("optimize", buildOptionParams(setting));
    } catch (err) {
      window.trackEvent?.("optimize_error", { message: err && err.message ? err.message : String(err) });
      showUnexpectedError(err, state);
      setResult("予期せぬエラーが発生しました。", true);
      hasResult = false; setStale(false); setShareButtonVisible(false);
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-loading");
      btn.textContent = "▶ 最適化";
    }
  }));
}

/* ============================================================
 * 初期化
 * ============================================================ */
function init() {
  buildOptionGrid();
  buildPresetBar();
  buildRecTable();
  buildSettingScalar();
  buildDayTable();
  buildBufferTable();
  buildSongTimeGrid();

  // SIMULATE_START_DAY 変更でグレーアウト更新
  $("opt_SIMULATE_START_DAY").addEventListener("change", updateRecommendedDisabled);

  // 入力確定（change）のたびにリアルタイム検証（バブリングで各個別リスナーの後に発火）
  for (const id of ["optionGrid", "recTable", "settingScalarGrid", "dayTable", "bufferTable", "songTimeGrid"]) {
    $(id).addEventListener("change", liveValidate);
  }

  // 共有URL（#s=...）があれば最優先で復元し、なければ前回の入力（localStorage）→デフォルト
  const sharedLoaded = loadStateFromHash();
  if (!sharedLoaded) {
    const initial = buildOptimizerDefaults();
    const saved = loadState();
    if (saved) Object.assign(initial, saved);
    applyState(initial);

    if (saved) {
      const lastPreset = loadLastPreset();
      if (!lastPreset || !setPresetDisplay(lastPreset)) setPresetDisplay(DEFAULT_SONG_PRESET_ID);
    } else {
      setPresetDisplay(DEFAULT_SONG_PRESET_ID);
    }
    liveValidate();
  }

  // 初期 DOM の横スクロールテーブルに影アフォーダンスを付与
  bindScrollShadows();

  $("runBtn").addEventListener("click", run);
  $("resetBtn").addEventListener("click", () => {
    if (!confirm("すべての設定を初期状態に戻します。この操作は取り消せません。よろしいですか？")) return;
    applyState(buildOptimizerDefaults());
    applyFieldErrors({});
    showErrors([]);
    setResult("「▶ 最適化」を押すと結果がここに表示されます。", true);
    hasResult = false; setStale(false); setShareButtonVisible(false);
    setPresetDisplay(DEFAULT_SONG_PRESET_ID);
    liveValidate();
    saveLastPreset(DEFAULT_SONG_PRESET_ID);
    saveState();
    window.trackEvent?.("config_reset");
  });
  bindShareUI();
  $("exportBtn").addEventListener("click", () => {
    exportJSON();
    window.trackEvent?.("config_export");
  });
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importJSON(reader.result);
      window.trackEvent?.("config_import");
    };
    reader.readAsText(file);
    ev.target.value = "";
  });

  // 共有URLから開いた場合は、計画まで自動表示する
  if (sharedLoaded) run();

  // プレイカウンターからの反映ハイライト
  if (location.hash === "#highlight=HAVING") {
    history.replaceState(null, "", location.pathname + location.search);
    requestAnimationFrame(() => {
      var targets = ["field_opt_HAVING_POINTS", "field_opt_HAVING_TRIGGER"];
      var firstEl = $(targets[0]);
      var firstField = firstEl && firstEl.closest(".field");
      if (firstField) firstField.scrollIntoView({ behavior: "smooth", block: "center" });
      targets.forEach(function (id) {
        var input = $(id);
        if (!input) return;
        var field = input.closest(".field") || input;
        field.classList.add("field-highlight");
        setTimeout(function () { field.classList.remove("field-highlight"); }, 2500);
      });
      var toast = document.createElement("div");
      toast.className = "counter-toast";
      toast.textContent = "プレイカウンターから反映しました。";
      document.body.appendChild(toast);
      setTimeout(function () { toast.classList.add("counter-toast-show"); }, 10);
      setTimeout(function () {
        toast.classList.remove("counter-toast-show");
        setTimeout(function () { toast.remove(); }, 300);
      }, 2500);
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
