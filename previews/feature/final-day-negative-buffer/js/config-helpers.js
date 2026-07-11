"use strict";
/* ============================================================
 * js/config.js の設定データを、内部表現（index ベースの配列など）へ
 * 整形するヘルパ群。js/config.js より前に読み込み、DEFAULTS の構築時に使う。
 *
 * これらの関数は js/config.js 側のグローバル（IDOLS / SONGS_BY_NAME /
 * SONG_PRESETS / IDOL_INDEX_BY_NAME / CONST など）を呼び出し時に参照する。
 * ============================================================ */

/* アイドル名 → 楽曲時間(秒)。未指定は DEFAULT_SONG_TIME_SEC。 */
function buildSongTimesArray() {
  return IDOLS.map((name) => SONGS_BY_NAME[name]?.time ?? DEFAULT_SONG_TIME_SEC);
}

/* アイドル名 → 楽曲名。未指定は空文字。 */
function buildSongNamesArray() {
  return IDOLS.map((name) => SONGS_BY_NAME[name]?.name ?? "");
}

/* ============================================================
 * プリセット ID → おすすめ楽曲の日別 index 配列（[EVENT_LENGTH][RPD]）。
 * - order: null（ランダム）は呼び出しごとにシャッフルする。
 * - 不明な presetId は FALLBACK_SONG_PRESET_ID にフォールバック。
 * config / フォーム双方の「割り当て展開」をここに一本化している。
 * ============================================================ */
function recommendedRowsFromPreset(presetId) {
  const preset = SONG_PRESETS.find((p) => p.id === presetId)
    || SONG_PRESETS.find((p) => p.id === FALLBACK_SONG_PRESET_ID);
  let order;
  if (preset && preset.order === null) {
    order = Array.from({ length: CONST.IDOL_COUNT }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  } else {
    const src = preset && Array.isArray(preset.order) ? preset.order : IDOLS;
    order = src.map((entry) => {
      if (typeof entry !== "string") return entry;
      const idx = IDOL_INDEX_BY_NAME[entry];
      if (idx === undefined) { console.warn(`recommendedRowsFromPreset: 未知のアイドル名「${entry}」`); return -1; }
      return idx;
    });
  }
  const rows = [];
  for (let i = 0; i < CONST.EVENT_LENGTH; i++) {
    rows.push(order.slice(
      i * CONST.RECOMMENDED_SONGS_COUNT_PER_DAY,
      (i + 1) * CONST.RECOMMENDED_SONGS_COUNT_PER_DAY));
  }
  return rows;
}
