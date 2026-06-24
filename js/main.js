"use strict";

/* ============================================================
 * 実行
 * ============================================================ */
function showErrors(errors, scroll = true) {
  const box = $("errors");
  if (errors.length === 0) { box.style.display = "none"; box.innerHTML = ""; return; }
  box.style.display = "block";
  box.innerHTML = "";
  box.appendChild(el("h3", { text: "入力エラー（修正してください）" }));
  const ul = el("ul");
  for (const e of errors) ul.appendChild(el("li", { text: e }));
  box.appendChild(ul);
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

  const setting = state.setting;

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
      let node;

      if (setting.RUNNING_MODE === "POINT_MAXIMIZE") {
        const adjusted = sim.adjustedRunningTimeSec(baseTimesSec);
        node = confirmed
          ? renderResultConfirmed(sim.solveConfirmed(adjusted), sim, setting, false)
          : renderResultUnconfirmed(sim.solveUnconfirmed(adjusted), setting, false);
      } else {
        // TIME_MINIMIZE
        if (confirmed) {
          const [ans, found] = sim.binarySearchMinRatio(
            (t) => sim.solveConfirmed(t), baseTimesSec, (a) => a.calcFinalPoints());
          node = renderResultConfirmed(ans, sim, setting, !found);
        } else {
          const scheduleSamples = sim.createUnconfirmedScheduleSamples();
          const [ans, found] = sim.binarySearchMinRatio(
            (t) => sim.solveUnconfirmed(t, scheduleSamples), baseTimesSec, (a) => a.expectedFinalPoints);
          node = renderResultUnconfirmed(ans, setting, !found);
        }
      }
      showResultNode(node);
    } catch (err) {
      showErrors([err.message || String(err)]);
      setResult("最適化時エラーが発生しました。", true);
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
  buildSongTimeGrid();

  // SIMULATE_START_DAY 変更でグレーアウト更新
  $("opt_SIMULATE_START_DAY").addEventListener("change", updateRecommendedDisabled);

  // 入力確定（change）のたびにリアルタイム検証（バブリングで各個別リスナーの後に発火）
  for (const id of ["optionGrid", "recTable", "settingScalarGrid", "dayTable", "songTimeGrid"]) {
    $(id).addEventListener("change", liveValidate);
  }

  // 共有URL（#s=...）があれば最優先で復元し、なければ前回の入力（localStorage）→デフォルト
  const sharedLoaded = loadStateFromHash();
  if (!sharedLoaded) {
    const initial = JSON.parse(JSON.stringify(DEFAULTS));
    const saved = loadState();
    if (saved) Object.assign(initial.setting, saved.setting);
    applyState(initial);

    if (saved) {
      // 保存済みの楽曲割り当てがある場合は、選択欄だけを復元する。
      const lastPreset = loadLastPreset();
      if (!lastPreset || !setPresetDisplay(lastPreset)) setPresetDisplay(DEFAULT_SONG_PRESET_ID);
    } else {
      // 新規状態は DEFAULTS の割り当て（applyState 済み）を使い、選択欄だけ合わせる。
      setPresetDisplay(DEFAULT_SONG_PRESET_ID);
      liveValidate();
    }
  }

  // 初期 DOM の横スクロールテーブルに影アフォーダンスを付与
  bindScrollShadows();

  $("runBtn").addEventListener("click", run);
  $("resetBtn").addEventListener("click", () => {
    if (!confirm("すべての設定を初期状態に戻します。この操作は取り消せません。よろしいですか？")) return;
    applyState(JSON.parse(JSON.stringify(DEFAULTS)));
    applyFieldErrors({});
    showErrors([]);
    setResult("「▶ 最適化」を押すと結果がここに表示されます。", true);
    hasResult = false; setStale(false); setShareButtonVisible(false);
    setPresetDisplay(DEFAULT_SONG_PRESET_ID);
    liveValidate();
    saveLastPreset(DEFAULT_SONG_PRESET_ID);
    saveState();
  });
  bindShareUI();
  $("exportBtn").addEventListener("click", exportJSON);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importJSON(reader.result);
    reader.readAsText(file);
    ev.target.value = "";
  });

  // 共有URLから開いた場合は、計画まで自動表示する
  if (sharedLoaded) run();
}

document.addEventListener("DOMContentLoaded", init);
