"use strict";
/* ============================================================
 * 設定ファイル（編集はこのファイルだけで完結します）
 *
 * - CONST    : イベント仕様などの固定値
 * - DEFAULTS : フォームの初期値（編集可能）
 *
 * index.html より先に <script src="config.js"></script> で読み込みます。
 * ここで宣言した CONST / DEFAULTS / IDOLS は同一ページの後続スクリプトから参照できます。
 *
 * ▼ 手で書き換えやすい設定
 *   - SONG_TIMES_SEC_BY_NAME    : アイドル名 → 楽曲時間(秒)。書いた人だけ上書き、
 *                                 未指定は DEFAULT_SONG_TIME_SEC を使用。
 *   - RECOMMENDED_SONGS_BY_NAME : おすすめ楽曲の割り当て。1日 4 人 ×
 *                                 CONST.EVENT_LENGTH 日。アイドル名で指定。
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
function idolIndexByName(name) {
  const idx = IDOL_INDEX_BY_NAME[name];
  if (idx === undefined) throw new Error(`config.js: 未知のアイドル名「${name}」`);
  return idx;
}

/* ============================================================
 * 固定値（イベント仕様）
 * ============================================================ */
const CONST = {
  START_DAY: new Date(2026, 5, 30), // 2026-06-30
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
};
const STAMINA_PER_ROUTINE = 1800;
const MAX_DAILY_RUNNING_TIME_SEC = 24 * 3600;

/* ============================================================
 * 楽曲時間（秒）: アイドル名 → 秒。書いた人だけ上書きされ、
 * 未指定のアイドルは DEFAULT_SONG_TIME_SEC を使う。
 * ============================================================ */
const DEFAULT_SONG_TIME_SEC = 140;
const SONG_TIMES_SEC_BY_NAME = {
  "秋月律子": 128, // SMOKY THRILL
  "天海春香": 140, // ハルカナミライ
  "伊吹翼": 140, // INVISIBLE LIGHT（未実装）
  "エミリースチュアート": 145, // All Alone
  "大神環": 139, // Get lol! Get lol! SONG
  "春日未来": 142, // U・N・M・E・I ライブ
  "我那覇響": 112, // REALIZE！！！
  "菊地真": 135, // ilLUmiNAte!
  "如月千早": 145, // リベレイシング／アロン -LiberaSing Along-
  "北上麗花": 127, // piece of cake
  "北沢志保": 140, // Clover Days
  "木下ひなた": 133, // 不思議発見ラボ！
  "高坂海美": 142, // Hug a nice day!
  "桜守歌織": 133, // 涙を知ること
  "佐竹美奈子": 130, // Star Impression
  "四条貴音": 137, // Stellar Light
  "篠宮可憐": 144, // Special Wonderful Smile
  "島原エレナ": 139, // My Evolution
  "白石紬": 125, // Sky Survive
  "ジュリア": 139, // Stick to my weapon
  "周防桃子": 141, // アイドルステアウェイ
  "高槻やよい": 142, // Eternal Spiral
  "高山紗代子": 139, // Texting You
  "田中琴葉": 137, // ギブミーメタファー
  "天空橋朋花": 127, // LOVE is GAME
  "徳川まつり": 129, // Unknown Boxの開き方
  "所恵美": 125, // 推しってほんと
  "豊川風花": 141, // Especially Angel♡
  "中谷育": 135, // 100てん☆ナンバーワン！
  "永吉昴": 142, // Hypernova
  "七尾百合子": 140, // FAITH/TO/FAITH
  "二階堂千鶴": 122, // Pomegranate
  "野々原茜": 134, // Sweet Sweet Soul
  "萩原雪歩": 138, // Halftone
  "箱崎星梨花": 127, // 鉄の羽のエクソダス
  "馬場このみ": 140, // Bestest!!
  "福田のり子": 139, // カワラナイモノ
  "双海亜美": 131, // SunRiser
  "双海真美": 141, // Fu-Wa-Du-Wa
  "星井美希": 133, // Lullaby for Armors
  "舞浜歩": 142, // Dance in the Light
  "真壁瑞希": 146, // 囚われのTeaTime
  "松田亜利沙": 138, // Prima Princess!!
  "三浦あずさ": 134, // カンパリーナ♡
  "水瀬伊織": 122, // 銀のテーブル木苺ジャム
  "宮尾美也": 140, // 飛べない僕は泳いだ（未実装）
  "最上静香": 133, // 頂上決戦ヴィクトリー!!!!!!
  "望月杏奈": 143, // SHIMMER
  "百瀬莉緒": 127, // Luvliminal image
  "矢吹可奈": 141, // パンとフィルム
  "横山奈緒": 132, // Clash of Colors
  "ロコ": 142, // Fairy Daysは絶え間ない
};
function buildSongTimesArray() {
  return IDOLS.map((name) => SONG_TIMES_SEC_BY_NAME[name] ?? DEFAULT_SONG_TIME_SEC);
}

/* ============================================================
 * おすすめ楽曲の割り当て: 1 日 CONST.RECOMMENDED_SONGS_COUNT_PER_DAY 人 ×
 * CONST.EVENT_LENGTH 日。アイドル名で指定（全体で重複なく全員）。
 * ============================================================ */
const RECOMMENDED_SONGS_BY_NAME = [
  ["秋月律子", "天海春香", "伊吹翼", "エミリースチュアート"],
  ["大神環", "春日未来", "我那覇響", "菊地真"],
  ["如月千早", "北上麗花", "北沢志保", "木下ひなた"],
  ["高坂海美", "桜守歌織", "佐竹美奈子", "四条貴音"],
  ["篠宮可憐", "島原エレナ", "白石紬", "ジュリア"],
  ["周防桃子", "高槻やよい", "高山紗代子", "田中琴葉"],
  ["天空橋朋花", "徳川まつり", "所恵美", "豊川風花"],
  ["中谷育", "永吉昴", "七尾百合子", "二階堂千鶴"],
  ["野々原茜", "萩原雪歩", "箱崎星梨花", "馬場このみ"],
  ["福田のり子", "双海亜美", "双海真美", "星井美希"],
  ["舞浜歩", "真壁瑞希", "松田亜利沙", "三浦あずさ"],
  ["水瀬伊織", "宮尾美也", "最上静香", "望月杏奈"],
  ["百瀬莉緒", "矢吹可奈", "横山奈緒", "ロコ"],
];
function buildRecommendedSongs() {
  return RECOMMENDED_SONGS_BY_NAME.map((row) => row.map(idolIndexByName));
}

/* ============================================================
 * デフォルト値（編集可能）
 * 内部表現は index ベース（アイドルは IDOLS の添字で保持）
 * ============================================================ */
const DEFAULTS = {
  setting: {
    // 時間・アイテムなどの設定
    REFRESH_START_TIME: [23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23, 23],
    CAN_RUNNING_TIME_HOUR: [16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16],
    FIRST_HALF_WORKING_TIME_SEC: 12 * 30,
    SECOND_HALF_WORKING_TIME_SEC: 12 * 20,
    ANNIVERSARY_SONG_TIME_SEC: 140,
    FROM_SONG_SELECT_TO_START_SONG_TIME_SEC: 20,
    MENU_TRANSITION_TIME_SEC: 5,
    TIME_SEC_BETWEEN_SONG_AND_SONG: 35,
    FROM_SONG_END_TO_LIVE_TIME_SEC: 25,
    SPARK_DRINK_10: 0,
    SPARK_DRINK_20: 0,
    SPARK_DRINK_30: 0,
    SPARK_DRINK_MAX: 0,
    MAX_STAMINA: 100,
    SONG_TIMES_SEC_BY_IDOL: buildSongTimesArray(),
    // 実行モード・初期状態
    BOOST_MODE: "NORMAL_SONG",          // NORMAL_SONG | ANNIVERSARY_SONG
    RUNNING_MODE: "POINT_MAXIMIZE",     // POINT_MAXIMIZE | TIME_MINIMIZE
    TARGET_POINTS: 2000000,
    CONFIRMED_RECOMMENDED_SONGS_SCHEDULE: true,
    RANDOM_SEED: 0,
    SIMULATION_COUNT: 50,
    SIMULATE_START_DAY: 0,
    HAVING_POINTS: 0,
    HAVING_TRIGGER: 0,
    RECOMMENDED_SONGS: buildRecommendedSongs(),
  },
};
