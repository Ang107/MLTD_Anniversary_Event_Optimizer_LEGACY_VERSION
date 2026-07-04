"use strict";

const CONSOLE_COMMANDS = {
  routineTimePerDay: {
    summary: "各日のルーティン1回あたりの所要時間を表示",
    usage: "routineTimePerDay()",
    detail: "現在のフォーム入力に基づき、各日の最速楽曲でのルーティン所要時間を一覧表示します。返り値は { date, routineTimeSec } の配列です。",
  },
};

function help(name) {
  if (name === undefined) {
    console.log("%c利用可能なコンソールコマンド", "font-weight:bold; font-size:14px;");
    console.log('各コマンドの詳細: help("コマンド名")\n');
    const table = {};
    for (const [key, cmd] of Object.entries(CONSOLE_COMMANDS)) {
      table[key] = { "説明": cmd.summary, "使い方": cmd.usage };
    }
    console.table(table);
    return;
  }
  const cmd = CONSOLE_COMMANDS[name];
  if (!cmd) {
    console.error("不明なコマンド: " + name);
    return;
  }
  console.log("%c" + name, "font-weight:bold; font-size:14px;");
  console.log(cmd.detail);
  console.log("使い方: " + cmd.usage);
}

function routineTimePerDay() {
  const state = gatherState();
  const { errors } = validate(state);
  if (errors.length > 0) {
    console.error("入力エラーがあります:", errors);
    return null;
  }
  const setting = state.setting;
  const sim = buildSimulator(setting);
  const start = setting.SIMULATE_START_DAY;
  const rows = [];
  for (let day = start; day < CONST.EVENT_LENGTH; day++) {
    const recIdx = setting.RECOMMENDED_SONGS[day];
    const songTimes = recIdx.map((i) => setting.SONG_TIMES_SEC_BY_IDOL[i]);
    const minSong = Math.min(...songTimes);
    const timeSec = sim.normalSongRoutineTimeSec(day, minSong);
    rows.push({
      date: dayDateLabel(day),
      routineTimeSec: timeSec,
    });
  }
  const table = {};
  for (const r of rows) table[r.date] = { "秒": r.routineTimeSec, "時間": secToTimeStr(r.routineTimeSec) };
  console.table(table);
  return rows;
}
