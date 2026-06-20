"use strict";

/* ============================================================
 * フィールド定義（ラベル・型）
 * フォーム生成・読み取り・検証の各所から参照する
 * ============================================================ */

// 設定スカラー（キー, ラベル）
const SETTING_SCALAR_FIELDS = [
  ["FIRST_HALF_WORKING_TIME_SEC", "前半戦 1800枚収集時間 (秒)"],
  ["SECOND_HALF_WORKING_TIME_SEC", "後半戦 1800枚収集時間 (秒)"],
  ["ANNIVERSARY_SONG_TIME_SEC", "周年曲の曲時間 (秒)"],
  ["MENU_TRANSITION_TIME_SEC", "メニュー遷移 (秒)"],
  ["FROM_SONG_SELECT_TO_START_SONG_TIME_SEC", "楽曲選択画面→曲開始 (秒)"],
  ["FROM_SONG_END_TO_SONG_SELECT_TIME_SEC", "曲終了→楽曲選択画面 (秒)"],
  ["TIME_SEC_BETWEEN_SONG_AND_SONG", "曲終了→次曲開始（再演） (秒)"],
  ["SPARK_DRINK_10", "スパークドリンク10 所持数"],
  ["SPARK_DRINK_20", "スパークドリンク20 所持数"],
  ["SPARK_DRINK_30", "スパークドリンク30 所持数"],
  ["SPARK_DRINK_MAX", "スパークドリンクMAX 所持数"],
  ["MAX_STAMINA", "スタミナ最大量"],
];

// オプションスカラー（キー, ラベル）
const OPTION_SCALAR_FIELDS = [
  ["TARGET_POINTS", "目標ポイント (時間最小化時のみ)"],
  ["RANDOM_SEED", "乱数シード (未確定時)"],
  ["SIMULATION_COUNT", "シミュレーション回数 (未確定時)"],
  ["SIMULATE_START_DAY", "シミュレーション開始日 [0,12]"],
  ["HAVING_POINTS", "現在の所持ポイント"],
  ["HAVING_TRIGGER", "現在の所持トリガー"],
];

// 小数入力を許容する設定スカラーのキー
const FLOAT_SETTING_KEYS = new Set([
  "FIRST_HALF_WORKING_TIME_SEC", "SECOND_HALF_WORKING_TIME_SEC",
  "ANNIVERSARY_SONG_TIME_SEC", "FROM_SONG_SELECT_TO_START_SONG_TIME_SEC",
  "MENU_TRANSITION_TIME_SEC", "TIME_SEC_BETWEEN_SONG_AND_SONG",
  "FROM_SONG_END_TO_SONG_SELECT_TIME_SEC",
]);
