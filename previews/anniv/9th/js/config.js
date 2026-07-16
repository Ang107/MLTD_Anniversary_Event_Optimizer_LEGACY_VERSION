"use strict";
/* ============================================================
 * 設定ファイル（編集はこのファイルだけで完結します）
 *
 * - CONST    : イベント仕様などの固定値
 * - DEFAULTS : 全ページ共通のデフォルト値（フラット構造・編集可能）
 *
 * このファイルは設定データに専念し、それを内部表現へ整形する関数は
 * js/config-helpers.js に分離している（config.js より前に読み込む）。
 *
 * 全ページで js/config-helpers.js → js/config.js → js/storage-core.js の順で読み込みます。
 * ここで宣言した CONST / DEFAULTS / IDOLS は同一ページの後続スクリプトから参照できます。
 *
 * ▼ 手で書き換えやすい設定
 *   - SONG_TIMES_SEC_BY_NAME    : アイドル名 → 楽曲時間(秒)。書いた人だけ上書き、
 *                                 未指定は DEFAULT_SONG_TIME_SEC を使用。
 *   - SONG_PRESETS              : おすすめ楽曲のプリセット。アイドル名で指定。
 *   - DEFAULT_SONG_PRESET_ID    : 初期表示するおすすめ楽曲プリセット。
 * ============================================================ */

/* ============================================================
 * アイドル名（配列の添字が内部 index）
 * ============================================================ */
const IDOLS = [
  "秋月律子", "天海春香", "伊吹翼", "エミリースチュアート", "大神環", "春日未来", "我那覇響", "菊地真",
  "如月千早", "北上麗花", "北沢志保", "木下ひなた", "高坂海美", "桜守歌織", "佐竹美奈子", "四条貴音",
  "篠宮可憐", "島原エレナ", "白石紬", "ジュリア", "周防桃子", "高槻やよい", "高山紗代子", "田中琴葉",
  "天空橋朋花", "徳川まつり", "所恵美", "豊川風花", "中谷育", "永吉昴", "七尾百合子", "二階堂千鶴",
  "野々原茜", "萩原雪歩", "箱崎星梨花", "馬場このみ", "福田のり子", "双海亜美", "双海真美", "星井美希",
  "舞浜歩", "真壁瑞希", "松田亜利沙", "三浦あずさ", "水瀬伊織", "宮尾美也", "最上静香", "望月杏奈",
  "百瀬莉緒", "矢吹可奈", "横山奈緒", "ロコ"
];
const IDOL_INDEX_BY_NAME = Object.fromEntries(IDOLS.map((name, i) => [name, i]));

/* ============================================================
 * 固定値（イベント仕様）
 * ============================================================ */
const CONST = {
  START_DAY: new Date(2026, 5, 30), // 2026-06-30
  EVENT_END_EXCLUSIVE: new Date(2026, 6, 13), // 2026-07-13 00:00
  EVENT_LENGTH: 13,
  FIRST_HALF_END_DAY: 5,
  VALUE_BY_450_TICKET: 1071,
  VALUE_BY_1800_TICKET: 1071 * 4,
  STANDARD_TRIGGER: 180,
  POINT_BY_STANDARD_TRIGGER: 537,
  LOGIN_TRIGGER: 540,
  RECOMMENDED_SONGS_MISSION_TRIGGER: 1000,
  RECOMMENDED_SONGS_COUNT_PER_DAY: 4,
  REFRESH_TIME_HOUR: 8,
  BOOST_COUNT: 10,
  JEWELS_REQUIRED_PER_STAMINA_RECOVERY: 50,
  IDOL_COUNT: IDOLS.length,
  SIMULATION_COUNT: 50,
  RANDOM_SEED: 0,
};
const STAMINA_PER_ROUTINE = 1800;
const MAX_DAILY_RUNNING_TIME_SEC = 24 * 3600;

/* ============================================================
 * 楽曲時間（秒）: アイドル名 → 秒。書いた人だけ上書きされ、
 * 未指定のアイドルは DEFAULT_SONG_TIME_SEC を使う。
 * ============================================================ */
const DEFAULT_SONG_TIME_SEC = 140;
const SONGS_BY_NAME = {
  "秋月律子": { name: "SMOKY THRILL", time: 128 },
  "天海春香": { name: "ハルカナミライ", time: 140 },
  "伊吹翼": { name: "INVISIBLE LIGHT", time: 120 },
  "エミリースチュアート": { name: "All Alone", time: 145 },
  "大神環": { name: "Get lol! Get lol! SONG", time: 139 },
  "春日未来": { name: "U・N・M・E・I ライブ", time: 142 },
  "我那覇響": { name: "REALIZE！！！", time: 112 },
  "菊地真": { name: "ilLUmiNAte!", time: 135 },
  "如月千早": { name: "リベレイシング／アロン -LiberaSing Along-", time: 145 },
  "北上麗花": { name: "piece of cake", time: 127 },
  "北沢志保": { name: "Clover Days", time: 140 },
  "木下ひなた": { name: "不思議発見ラボ！", time: 133 },
  "高坂海美": { name: "Hug a nice day!", time: 142 },
  "桜守歌織": { name: "涙を知ること", time: 133 },
  "佐竹美奈子": { name: "Star Impression", time: 130 },
  "四条貴音": { name: "Stellar Light", time: 137 },
  "篠宮可憐": { name: "Special Wonderful Smile", time: 144 },
  "島原エレナ": { name: "My Evolution", time: 139 },
  "白石紬": { name: "Sky Survive", time: 125 },
  "ジュリア": { name: "Stick to my weapon", time: 139 },
  "周防桃子": { name: "アイドルステアウェイ", time: 141 },
  "高槻やよい": { name: "Eternal Spiral", time: 142 },
  "高山紗代子": { name: "Texting You", time: 139 },
  "田中琴葉": { name: "KAWAII ウォーズ", time: 124 },// ギブミーメタファー, 137 かも
  "天空橋朋花": { name: "LOVE is GAME", time: 127 },
  "徳川まつり": { name: "Unknown Boxの開き方", time: 129 },
  "所恵美": { name: "推しってほんと", time: 125 },
  "豊川風花": { name: "Especially Angel♡", time: 141 },
  "中谷育": { name: "100てん☆ナンバーワン！", time: 135 },
  "永吉昴": { name: "Hypernova", time: 142 },
  "七尾百合子": { name: "FAITH/TO/FAITH", time: 140 },
  "二階堂千鶴": { name: "Pomegranate", time: 122 },
  "野々原茜": { name: "Sweet Sweet Soul", time: 134 },
  "萩原雪歩": { name: "Halftone", time: 138 },
  "箱崎星梨花": { name: "鉄の羽のエクソダス", time: 127 },
  "馬場このみ": { name: "Bestest!!", time: 140 },
  "福田のり子": { name: "カワラナイモノ", time: 139 },
  "双海亜美": { name: "SunRiser", time: 131 },
  "双海真美": { name: "Fu-Wa-Du-Wa", time: 141 },
  "星井美希": { name: "Lullaby for Armors", time: 133 },
  "舞浜歩": { name: "Dance in the Light", time: 142 },
  "真壁瑞希": { name: "囚われのTeaTime", time: 146 },
  "松田亜利沙": { name: "Prima Princess!!", time: 138 },
  "三浦あずさ": { name: "カンパリーナ♡", time: 134 },
  "水瀬伊織": { name: "銀のテーブル木苺ジャム", time: 122 },
  "宮尾美也": { name: "飛べない僕は泳いだ", time: 143 },
  "最上静香": { name: "頂上決戦ヴィクトリー!!!!!!", time: 133 },
  "望月杏奈": { name: "SHIMMER", time: 143 },
  "百瀬莉緒": { name: "Luvliminal image", time: 127 },
  "矢吹可奈": { name: "パンとフィルム", time: 141 },
  "横山奈緒": { name: "Clash of Colors", time: 132 },
  "ロコ": { name: "Fairy Daysは絶え間ない", time: 142 },
};

/* ============================================================
 * おすすめ楽曲プリセット
 * order: 52人分のアイドルインデックスを出現順に並べた配列。
 *        null の場合は適用時にランダムシャッフル。
 * DEFAULT_SONG_PRESET_ID で初期表示するプリセットを指定する。
 * ============================================================ */
const SONG_PRESETS = [
  {
    id: "aiueo",
    label: "あいうえお順",
    order: IDOLS.slice(),
  },
  {
    id: "kv_age_desc",
    label: "ミリシタキービジュアル登場順（年齢降順）",
    order: [
      "春日未来", "白石紬", "桜守歌織", "星井美希",       // 6/30
      "徳川まつり", "最上静香", "伊吹翼", "天海春香",       // 7/1
      "田中琴葉", "百瀬莉緒", "望月杏奈", "我那覇響",       // 7/2
      "七尾百合子", "真壁瑞希", "箱崎星梨花", "菊地真",         // 7/3
      "エミリースチュアート", "永吉昴", "北上麗花", "高槻やよい",     // 7/4
      "福田のり子", "所恵美", "木下ひなた", "四条貴音",       // 7/5
      "松田亜利沙", "周防桃子", "馬場このみ", "秋月律子",       // 7/6
      "高坂海美", "二階堂千鶴", "篠宮可憐", "如月千早",       // 7/7
      "矢吹可奈", "舞浜歩", "豊川風花", "双海真美",       // 7/8
      "中谷育", "北沢志保", "島原エレナ", "双海亜美",       // 7/9
      "佐竹美奈子", "ジュリア", "宮尾美也", "三浦あずさ",     // 7/10
      "横山奈緒", "ロコ", "野々原茜", "萩原雪歩",       // 7/11
      "高山紗代子", "天空橋朋花", "大神環", "水瀬伊織",       // 7/12
    ],
  },
  {
    id: "solo2_order",
    label: "ソロ2周目実装順",
    order: [
      "桜守歌織", "白石紬", "春日未来", "星井美希",       // 6/30
      "真壁瑞希", "松田亜利沙", "伊吹翼", "三浦あずさ",     // 7/1
      "矢吹可奈", "百瀬莉緒", "望月杏奈", "菊地真",         // 7/2
      "中谷育", "七尾百合子", "最上静香", "四条貴音",       // 7/3
      "箱崎星梨花", "所恵美", "馬場このみ", "我那覇響",       // 7/4
      "福田のり子", "ロコ", "横山奈緒", "高槻やよい",     // 7/5
      "北沢志保", "高山紗代子", "木下ひなた", "秋月律子",       // 7/6
      "周防桃子", "永吉昴", "宮尾美也", "天海春香",       // 7/7
      "野々原茜", "篠宮可憐", "徳川まつり", "如月千早",       // 7/8
      "高坂海美", "天空橋朋花", "豊川風花", "萩原雪歩",       // 7/9
      "舞浜歩", "島原エレナ", "田中琴葉", "双海真美",       // 7/10
      "大神環", "エミリースチュアート", "北上麗花", "双海亜美",     // 7/11
      "二階堂千鶴", "佐竹美奈子", "ジュリア", "水瀬伊織",       // 7/12
    ],
  },
  {
    id: "random",
    label: "ランダム",
    order: null,
  },
];
const DEFAULT_SONG_PRESET_ID = "solo2_order";
const FALLBACK_SONG_PRESET_ID = "aiueo";

/* ============================================================
 * デフォルト値（編集可能）
 * 内部表現は index ベース（アイドルは IDOLS の添字で保持）
 * ============================================================ */
const DEFAULTS = {
  // ===== オプティマイザー =====
  REFRESH_START_TIME: [23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23],
  CAN_RUNNING_TIME_HOUR: [24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24, 24],
  MIN_ANNIVERSARY_SONG_TIME_HOUR: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  DAY_BUFFER_SEC: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  FIRST_HALF_WORKING_TIME_SEC: 12 * 30,
  SECOND_HALF_WORKING_TIME_SEC: 12 * 20,
  ANNIVERSARY_SONG_TIME_SEC: 150,
  MENU_TRANSITION_TIME_SEC: 5,
  FROM_SONG_SELECT_TO_START_SONG_TIME_SEC: 20,
  FROM_SONG_END_TO_SONG_SELECT_TIME_SEC: 25,
  TIME_SEC_BETWEEN_SONG_AND_SONG: 35,
  SPARK_DRINK_10: 0,
  SPARK_DRINK_20: 0,
  SPARK_DRINK_30: 0,
  SPARK_DRINK_MAX: 0,
  MAX_STAMINA: 240,
  SONG_TIMES_SEC_BY_IDOL: buildSongTimesArray(),
  SONG_NAMES_BY_IDOL: buildSongNamesArray(),
  BOOST_MODE: "NORMAL_SONG",
  RUNNING_MODE: "POINT_MAXIMIZE",
  TARGET_POINTS: 6000000,
  CONFIRMED_RECOMMENDED_SONGS_SCHEDULE: true,
  SIMULATE_START_DAY: 0,
  SIMULATE_START_HOUR: 0,
  SIMULATE_START_MINUTE: 0,
  HAVING_POINTS: 0,
  HAVING_TRIGGER: 0,
  START_DAY_LOGIN_TRIGGER_OBTAINED: false,
  START_DAY_MISSION_TRIGGER_OBTAINED: false,
  START_DAY_BOOST_USED: false,
  START_DAY_ANNIV10X_DONE: false,
  RECOMMENDED_SONGS: recommendedRowsFromPreset(DEFAULT_SONG_PRESET_ID),

  // ===== 最終日専用オプティマイザー =====
  FINAL_DAY_HOUR: 1,
  FINAL_DAY_MIN: 0,
  FINAL_DAY_SEC: 0,
  FINAL_DAY_BUFFER_SEC: 60,
  SHORTEST_SONG_TIME_SEC: 112,
};
