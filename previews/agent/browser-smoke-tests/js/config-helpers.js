"use strict";
/* ============================================================
 * js/config.js の設定データを、内部表現（index ベースの配列など）へ
 * 整形する純粋関数群。必要な設定値は引数で受け取る。
 * ============================================================ */

/* アイドル名 → 楽曲時間(秒)。未指定は DEFAULT_SONG_TIME_SEC。 */
export function buildSongTimesArray(idols, songsByName, defaultSongTimeSec) {
  return idols.map((name) => songsByName[name]?.time ?? defaultSongTimeSec);
}

/* アイドル名 → 楽曲名。未指定は空文字。 */
export function buildSongNamesArray(idols, songsByName) {
  return idols.map((name) => songsByName[name]?.name ?? "");
}

/* ============================================================
 * プリセット ID → おすすめ楽曲の日別 index 配列（[EVENT_LENGTH][RPD]）。
 * - order: null（ランダム）は呼び出しごとにシャッフルする。
 * - 不明な presetId は FALLBACK_SONG_PRESET_ID にフォールバック。
 * config / フォーム双方の「割り当て展開」をここに一本化している。
 * ============================================================ */
export function buildRecommendedRows({
  presetId,
  presets,
  fallbackPresetId,
  idols,
  idolIndexByName,
  eventLength,
  songsPerDay,
}) {
  const preset = presets.find((p) => p.id === presetId)
    || presets.find((p) => p.id === fallbackPresetId);
  let order;
  if (preset && preset.order === null) {
    order = Array.from({ length: idols.length }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  } else {
    const src = preset && Array.isArray(preset.order) ? preset.order : idols;
    order = src.map((entry) => {
      if (typeof entry !== "string") return entry;
      const idx = idolIndexByName[entry];
      if (idx === undefined) { console.warn(`buildRecommendedRows: 未知のアイドル名「${entry}」`); return -1; }
      return idx;
    });
  }
  const rows = [];
  for (let i = 0; i < eventLength; i++) {
    rows.push(order.slice(
      i * songsPerDay,
      (i + 1) * songsPerDay));
  }
  return rows;
}
