"use strict";

/* ============================================================
 * 乱数（mulberry32 + Fisher–Yates）
 * 注: 同一 seed なら再現可能なシャッフル
 * ============================================================ */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ============================================================
 * シミュレーション本体（DOM 非依存の純粋ロジック）
 * ============================================================ */
function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

function buildSimulator(setting) {
  const ANNIV_SLOT_SEC = setting.ANNIVERSARY_SONG_TIME_SEC + setting.TIME_SEC_BETWEEN_SONG_AND_SONG;
  let rng = mulberry32(setting.RANDOM_SEED | 0);

  function workingTimeSec(day) {
    return setting.MENU_TRANSITION_TIME_SEC
      + (day <= CONST.FIRST_HALF_END_DAY ? setting.FIRST_HALF_WORKING_TIME_SEC : setting.SECOND_HALF_WORKING_TIME_SEC);
  }
  function baseAnniv10xCount(day) { return day <= CONST.FIRST_HALF_END_DAY ? 1 : 2; }
  function liveEntryCost(count) { return count > 0 ? setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC : 0; }
  function songTimesOf(idolIndices) { return idolIndices.map((i) => setting.SONG_TIMES_SEC_BY_IDOL[i]); }
  // 周年曲ブーストでは1日に必ず BOOST_COUNT 回の周年曲4xを行う（下限）
  function forcedAnniv4xCount() { return setting.BOOST_MODE === "ANNIVERSARY_SONG" ? CONST.BOOST_COUNT : 0; }
  function loopSongTimeSec(songTime, count) {
    if (count === 0) return 0;
    return setting.MENU_TRANSITION_TIME_SEC
      + liveEntryCost(count)
      + songTime * count
      + setting.TIME_SEC_BETWEEN_SONG_AND_SONG * (count - 1)
      + setting.FROM_SONG_END_TO_SONG_SELECT_TIME_SEC;
  }
  function anniversarySongTimeSec(count) {
    return loopSongTimeSec(setting.ANNIVERSARY_SONG_TIME_SEC, count);
  }
  function normalSongRoutineTimeSec(day, minSong) {
    return workingTimeSec(day)
      + loopSongTimeSec(minSong, 4);
  }
  function recommendedSongTimeSec(day, songTimes) {
    return workingTimeSec(day)
      + setting.MENU_TRANSITION_TIME_SEC
      + sum(songTimes)
      + setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC * 4
      + setting.FROM_SONG_END_TO_SONG_SELECT_TIME_SEC * 4;
  }

  function adjustedRunningTimeSec(canRunningTimeSec) {
    const res = canRunningTimeSec.slice();
    for (let i = 0; i < setting.SIMULATE_START_DAY; i++) res[i] = 0;
    for (let i = setting.SIMULATE_START_DAY; i < CONST.EVENT_LENGTH; i++) {
      const yesterdayRefreshEnd = i > 0 ? Math.max(0, setting.REFRESH_START_TIME[i - 1] + CONST.REFRESH_TIME_HOUR - 24) : 0;
      if (i < CONST.EVENT_LENGTH - 1) {
        const refreshStart = setting.REFRESH_START_TIME[i];
        const refreshEnd = refreshStart + CONST.REFRESH_TIME_HOUR;
        if (refreshStart < yesterdayRefreshEnd) {
          throw new Error("リフレッシュタイムの開始時刻は前日のリフレッシュタイムの終了時刻以上にしてください");
        }
        res[i] = Math.min(res[i], ((refreshStart - yesterdayRefreshEnd) + Math.max(0, 24 - refreshEnd)) * 3600);
      } else {
        res[i] = Math.min(res[i], (24 - yesterdayRefreshEnd) * 3600);
      }
    }
    return res;
  }

  function makeState() {
    return {
      normalRoutineCounts: null,
      anniv4xCounts: null,
      anniv10xCounts: null,
      triggerIncreases: null,
      triggerDecreases: null,
      pointsIncreases: null,
      remainingTimesSec: null,
      dayConfirmed: null,
      triggerBalanceUpTo(dayExclusive) {
        return sum(this.triggerIncreases.slice(0, dayExclusive)) - sum(this.triggerDecreases.slice(0, dayExclusive));
      },
      triggerBalanceThrough(dayInclusive) { return this.triggerBalanceUpTo(dayInclusive + 1); },
    };
  }

  // === 1日分の基礎収支（強制追加ルーティンを除く、各日に必ず入る分） ===
  const RPD = CONST.RECOMMENDED_SONGS_COUNT_PER_DAY;
  const isNormalBoost = setting.BOOST_MODE === "NORMAL_SONG";
  const isAnnivBoost = setting.BOOST_MODE === "ANNIVERSARY_SONG";

  function dayBaseRoutineCount() { return 1 + (isNormalBoost ? 2 : 0); }
  function dayBaseAnniv4xCount() { return isAnnivBoost ? CONST.BOOST_COUNT : 0; }
  function dayBaseTriggerIncrease() {
    return CONST.LOGIN_TRIGGER
      + CONST.VALUE_BY_450_TICKET * RPD
      + CONST.RECOMMENDED_SONGS_MISSION_TRIGGER * RPD
      + (isNormalBoost ? CONST.VALUE_BY_1800_TICKET * 2 + CONST.VALUE_BY_450_TICKET * CONST.BOOST_COUNT : 0);
  }
  function dayBaseTriggerDecrease(day) {
    return CONST.STANDARD_TRIGGER * 10 * baseAnniv10xCount(day)
      + (isAnnivBoost ? CONST.STANDARD_TRIGGER * 4 * CONST.BOOST_COUNT : 0);
  }
  function dayBasePointsIncrease(day) {
    return CONST.VALUE_BY_450_TICKET * RPD
      + CONST.POINT_BY_STANDARD_TRIGGER * 10 * baseAnniv10xCount(day)
      + (isNormalBoost ? CONST.VALUE_BY_1800_TICKET * 2 + CONST.VALUE_BY_450_TICKET * CONST.BOOST_COUNT : 0)
      + (isAnnivBoost ? CONST.POINT_BY_STANDARD_TRIGGER * CONST.BOOST_COUNT * 4 * 2 : 0);
  }
  function dayBaseTimeConsumed(day, songTimes) {
    return recommendedSongTimeSec(day, songTimes)
      + anniversarySongTimeSec(baseAnniv10xCount(day))
      + (isNormalBoost ? 2 * normalSongRoutineTimeSec(day, Math.min(...songTimes)) : 0)
      + (isAnnivBoost ? anniversarySongTimeSec(CONST.BOOST_COUNT) : 0);
  }

  function initState(recommendedSongs, canRunningTimeSec) {
    const n = CONST.EVENT_LENGTH;
    const normalRoutineCounts = Array(n).fill(0);
    const anniv4xCounts = Array(n).fill(0);
    const anniv10xCounts = Array(n).fill(0);
    const triggerIncreases = Array(n).fill(0);
    const triggerDecreases = Array(n).fill(0);
    const pointsIncreases = Array(n).fill(0);
    const remainingTimesSec = canRunningTimeSec.slice();
    const dayConfirmed = Array(n).fill(false);

    // 各日に必ず入る基礎収支（おすすめ楽曲1周・周年10x・ブースト分）
    for (let i = 0; i < n; i++) {
      normalRoutineCounts[i] = dayBaseRoutineCount();
      anniv4xCounts[i] = dayBaseAnniv4xCount();
      anniv10xCounts[i] = baseAnniv10xCount(i);
      triggerIncreases[i] = dayBaseTriggerIncrease();
      triggerDecreases[i] = dayBaseTriggerDecrease(i);
      pointsIncreases[i] = dayBasePointsIncrease(i);
      remainingTimesSec[i] -= dayBaseTimeConsumed(i, songTimesOf(recommendedSongs[i]));
    }

    // 開始日より前は計上しない（持ち越し分のみ HAVING_* として前日に置く）
    for (let i = 0; i < setting.SIMULATE_START_DAY; i++) {
      normalRoutineCounts[i] = 0;
      anniv4xCounts[i] = 0;
      anniv10xCounts[i] = 0;
      triggerIncreases[i] = 0;
      triggerDecreases[i] = 0;
      pointsIncreases[i] = 0;
      remainingTimesSec[i] = 0;
      dayConfirmed[i] = true;
    }
    if (setting.SIMULATE_START_DAY > 0) {
      triggerIncreases[setting.SIMULATE_START_DAY - 1] = setting.HAVING_TRIGGER;
      pointsIncreases[setting.SIMULATE_START_DAY - 1] = setting.HAVING_POINTS;
    }

    const state = makeState();
    state.normalRoutineCounts = normalRoutineCounts;
    state.anniv4xCounts = anniv4xCounts;
    state.anniv10xCounts = anniv10xCounts;
    state.triggerIncreases = triggerIncreases;
    state.triggerDecreases = triggerDecreases;
    state.pointsIncreases = pointsIncreases;
    state.remainingTimesSec = remainingTimesSec;
    state.dayConfirmed = dayConfirmed;
    return state;
  }

  function minRequiredRoutineCount(state, day) {
    if (setting.BOOST_MODE === "NORMAL_SONG") return 0;
    const havingTrigger = Math.max(0, state.triggerBalanceUpTo(day)); // 過去の負の収支は無視できる
    const needTrigger = state.triggerDecreases[day] - state.triggerIncreases[day];
    const lack = Math.max(0, needTrigger - havingTrigger);
    return Math.ceil(lack / CONST.VALUE_BY_1800_TICKET);
  }

  function maxConsumableTriggerInRange(state, startDayInclusive, endDayExclusive) {
    let cap = 0;
    for (let day = startDayInclusive; day < endDayExclusive; day++) {
      if (state.dayConfirmed[day]) continue;
      const remTime = state.remainingTimesSec[day];
      cap += Math.floor(Math.max(0, remTime - setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC) / ANNIV_SLOT_SEC)
        * CONST.STANDARD_TRIGGER * 4;
    }
    return cap;
  }

  function anniv4xCapacityAfter(state, day) {
    let cap = -sum(state.triggerIncreases.slice(day + 1)) + sum(state.triggerDecreases.slice(day + 1));
    cap += maxConsumableTriggerInRange(state, day + 1, CONST.EVENT_LENGTH);
    return cap;
  }

  function remainingTriggerIfConsumeMaxUntilDay(state, day) {
    let trigger = 0;
    for (let d = 0; d < day; d++) {
      trigger += state.triggerIncreases[d] - state.triggerDecreases[d];
      if (!state.dayConfirmed[d]) {
        trigger -= Math.floor(Math.max(0, state.remainingTimesSec[d] - setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC) / ANNIV_SLOT_SEC) * CONST.STANDARD_TRIGGER * 4;
      }
      trigger = Math.max(trigger, 0);
    }
    return trigger;
  }

  // day を起点に、それ以降の各日終了時点でのトリガー残高の最小値を返す。
  // この値を超えて周年曲4xを撃つと、将来のいずれかの時点で残高が負になりえる。
  function minTriggerBalanceFrom(state, day) {
    let cumulative = state.triggerBalanceUpTo(day);
    let minBalance = Infinity;
    for (let d = day; d < CONST.EVENT_LENGTH; d++) {
      cumulative += state.triggerIncreases[d] - state.triggerDecreases[d];
      minBalance = Math.min(minBalance, cumulative);
    }
    return minBalance;
  }

  function decideNormalRoutineCount(state, day, routineTimeSec) {
    const minCount = minRequiredRoutineCount(state, day);
    const maxCountByTime = Math.floor(state.remainingTimesSec[day] / routineTimeSec);
    const maxCount = Math.max(minCount, maxCountByTime);
    const capacityAfter = anniv4xCapacityAfter(state, day);
    let best = minCount;
    for (let routineCount = minCount; routineCount <= maxCount; routineCount++) {
      const addTrigger = routineCount * CONST.VALUE_BY_1800_TICKET;
      const nowTrigger = Math.max(0, remainingTriggerIfConsumeMaxUntilDay(state, day) + addTrigger + state.triggerIncreases[day] - state.triggerDecreases[day]);
      const remainingTime = state.remainingTimesSec[day] - routineCount * routineTimeSec;
      const usableTrigger = capacityAfter
        + Math.floor(Math.max(0, remainingTime - setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC * (state.anniv4xCounts[day] > 0 ? 0 : 1)) / ANNIV_SLOT_SEC)
        * CONST.STANDARD_TRIGGER * 4;
      if (nowTrigger > usableTrigger) break;
      best = routineCount;
    }
    return best;
  }

  function applyNormalRoutine(state, day, count, routineTimeSec) {
    state.normalRoutineCounts[day] += count;
    state.triggerIncreases[day] += count * CONST.VALUE_BY_1800_TICKET;
    state.pointsIncreases[day] += count * CONST.VALUE_BY_1800_TICKET;
    state.remainingTimesSec[day] -= count * routineTimeSec;
  }

  function decideAndApplyAnniv4x(state, day) {
    const remainingTime = state.remainingTimesSec[day];
    // すでに周年4xで楽曲選択済みなら追加分は再演できる
    const hadAnniv = state.anniv4xCounts[day] > 0;
    // day 以降のどの時点でもトリガー残高を負にしない範囲でのみ撃つ（持ち越しの二重消費を防ぐ）
    const usableTrigger = minTriggerBalanceFrom(state, day);
    let count = Math.max(0, Math.min(
      Math.floor((remainingTime - setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC * (hadAnniv ? 0 : 1)) / ANNIV_SLOT_SEC),
      Math.floor(usableTrigger / (CONST.STANDARD_TRIGGER * 4))
    ));
    const entryCost = (hadAnniv || count === 0) ? 0 : setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC;

    state.anniv4xCounts[day] += count;
    state.triggerDecreases[day] += count * CONST.STANDARD_TRIGGER * 4;
    state.pointsIncreases[day] += count * CONST.POINT_BY_STANDARD_TRIGGER * 4;
    state.remainingTimesSec[day] -= entryCost + count * ANNIV_SLOT_SEC;
  }

  function solve(recommendedSongs, canRunningTimeSec, forcedExtraRoutines) {
    const state = initState(recommendedSongs, canRunningTimeSec);
    const routineTimePerDay = Array(CONST.EVENT_LENGTH).fill(0);
    for (let i = setting.SIMULATE_START_DAY; i < CONST.EVENT_LENGTH; i++) {
      const minSong = Math.min(...songTimesOf(recommendedSongs[i]));
      routineTimePerDay[i] = normalSongRoutineTimeSec(i, minSong);
    }

    const forcedDays = new Set();
    if (forcedExtraRoutines) {
      for (const [dayStr, extra] of Object.entries(forcedExtraRoutines)) {
        const day = Number(dayStr);
        const routineTimeSec = routineTimePerDay[day];
        applyNormalRoutine(state, day, extra, routineTimeSec);
        decideAndApplyAnniv4x(state, day);
        state.dayConfirmed[day] = true;
        forcedDays.add(day);
      }
    }

    const pairs = [];
    for (let i = setting.SIMULATE_START_DAY; i < CONST.EVENT_LENGTH; i++) {
      if (!forcedDays.has(i)) pairs.push([routineTimePerDay[i], i]);
    }
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [routineTimeSec, day] of pairs) {
      const count = decideNormalRoutineCount(state, day, routineTimeSec);
      applyNormalRoutine(state, day, count, routineTimeSec);
      decideAndApplyAnniv4x(state, day);
      state.dayConfirmed[day] = true;
    }

    return {
      normalRoutineCounts: state.normalRoutineCounts,
      anniv4xCounts: state.anniv4xCounts,
      anniv10xCounts: state.anniv10xCounts,
      triggerIncreases: state.triggerIncreases,
      triggerDecreases: state.triggerDecreases,
      pointsIncreases: state.pointsIncreases,
      usedTimeSec: state.remainingTimesSec.map((rem, i) => canRunningTimeSec[i] - rem),
      calcFinalPoints() { return sum(this.pointsIncreases); },
    };
  }

  function validateRecommendedSongs(recommendedSongs, endDayExclusive, message) {
    for (let i = 0; i < endDayExclusive; i++) {
      for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
        const v = recommendedSongs[i][j];
        if (!(v >= 0 && v < CONST.IDOL_COUNT)) throw new Error(message);
      }
    }
    const indices = new Set();
    for (let i = 0; i < endDayExclusive; i++) {
      for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) indices.add(recommendedSongs[i][j]);
    }
    if (indices.size !== endDayExclusive * CONST.RECOMMENDED_SONGS_COUNT_PER_DAY) throw new Error(message);
  }

  function solveConfirmed(canRunningTimeSec) {
    validateRecommendedSongs(setting.RECOMMENDED_SONGS, CONST.EVENT_LENGTH,
      "おすすめ楽曲のスケジュールが確定している場合、全ての行に重複なく値を入れてください");
    return solve(setting.RECOMMENDED_SONGS, canRunningTimeSec, null);
  }

  function startDayMaxExtraRoutine(recommendedSongs, canRunningTimeSec) {
    const startDay = setting.SIMULATE_START_DAY;
    const daySongs = songTimesOf(recommendedSongs[startDay]);
    const minSong = Math.min(...daySongs);
    const routineTime = normalSongRoutineTimeSec(startDay, minSong);
    const fixedConsumed = dayBaseTimeConsumed(startDay, daySongs);
    const available = Math.min(MAX_DAILY_RUNNING_TIME_SEC, canRunningTimeSec[startDay]) - fixedConsumed;
    return [routineTime, Math.max(0, Math.floor(available / routineTime))];
  }

  function staminaPerDay(ans) { return ans.normalRoutineCounts.map((c) => c * STAMINA_PER_ROUTINE); }

  function requiredJewels(totalStamina) {
    const drinksRecovery =
      setting.SPARK_DRINK_10 * 10
      + setting.SPARK_DRINK_20 * 20
      + setting.SPARK_DRINK_30 * 30
      + setting.SPARK_DRINK_MAX * setting.MAX_STAMINA;
    const shortage = Math.max(0, totalStamina - drinksRecovery);
    const recoveries = Math.ceil(shortage / setting.MAX_STAMINA);
    return recoveries * CONST.JEWELS_REQUIRED_PER_STAMINA_RECOVERY;
  }

  function startDayBreakdown(canRunningTimeSec, extra) {
    const start = setting.SIMULATE_START_DAY;

    const startSongTimes = songTimesOf(setting.RECOMMENDED_SONGS[start]);
    const routineTimeSec = normalSongRoutineTimeSec(start, Math.min(...startSongTimes));
    const routineCount = dayBaseRoutineCount() + extra;
    const anniv10xCount = baseAnniv10xCount(start);
    const baseAnniv4x = dayBaseAnniv4xCount();

    const remaining = canRunningTimeSec[start]
      - dayBaseTimeConsumed(start, startSongTimes)
      - extra * routineTimeSec;

    let cumulative = (start > 0 ? setting.HAVING_TRIGGER : 0);
    let minBalance = Infinity;
    for (let d = start; d < CONST.EVENT_LENGTH; d++) {
      const inc = dayBaseTriggerIncrease() + (d === start ? extra * CONST.VALUE_BY_1800_TICKET : 0);
      cumulative += inc - dayBaseTriggerDecrease(d);
      minBalance = Math.min(minBalance, cumulative);
    }

    const entryCost = baseAnniv4x > 0 ? 0 : setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC;
    const anniv4xExtra = Math.max(0, Math.min(
      Math.floor((remaining - entryCost) / ANNIV_SLOT_SEC),
      Math.floor(minBalance / (CONST.STANDARD_TRIGGER * 4))
    ));
    const anniv4xCount = baseAnniv4x + anniv4xExtra;
    const usedTimeSec = canRunningTimeSec[start]
      - (remaining - (anniv4xExtra > 0 ? entryCost : 0) - anniv4xExtra * ANNIV_SLOT_SEC);

    const pointsStart = dayBasePointsIncrease(start)
      + extra * CONST.VALUE_BY_1800_TICKET
      + anniv4xExtra * CONST.POINT_BY_STANDARD_TRIGGER * 4;
    const triggerInStart = dayBaseTriggerIncrease() + extra * CONST.VALUE_BY_1800_TICKET;
    const triggerOutStart = dayBaseTriggerDecrease(start) + anniv4xExtra * CONST.STANDARD_TRIGGER * 4;

    const stamina = routineCount * STAMINA_PER_ROUTINE;
    return {
      firstDayRoutineCount: routineCount,
      firstDayAnniv4xCount: anniv4xCount,
      firstDayAnniv10xCount: anniv10xCount,
      firstDayUsedTimeSec: usedTimeSec,
      firstDayStamina: stamina,
      firstDayJewels: requiredJewels(stamina),
      firstDayTotalPoints: (start > 0 ? setting.HAVING_POINTS : 0) + pointsStart,
      firstDayTotalTrigger: (start > 0 ? setting.HAVING_TRIGGER : 0) + triggerInStart - triggerOutStart,
    };
  }

  function solveUnconfirmed(canRunningTimeSec) {
    const start = setting.SIMULATE_START_DAY;
    validateRecommendedSongs(setting.RECOMMENDED_SONGS, start + 1,
      "おすすめ楽曲が未確定の場合、シミュレーション開始日以前の行に重複なく値を入れてください");

    const fixedIndices = new Set();
    for (let i = 0; i < start + 1; i++) {
      for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) fixedIndices.add(setting.RECOMMENDED_SONGS[i][j]);
    }
    const remainingIdolIndices = [];
    for (let i = 0; i < CONST.IDOL_COUNT; i++) if (!fixedIndices.has(i)) remainingIdolIndices.push(i);

    const recommendedSongs = setting.RECOMMENDED_SONGS;
    const [, maxExtra] = startDayMaxExtraRoutine(recommendedSongs, canRunningTimeSec);
    const nCandidates = maxExtra + 1;
    const sumPoints = Array(nCandidates).fill(0);
    const sumTotalJewels = Array(nCandidates).fill(0);

    for (let iter = 0; iter < setting.SIMULATION_COUNT; iter++) {
      // Fisher–Yates shuffle
      for (let i = remainingIdolIndices.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [remainingIdolIndices[i], remainingIdolIndices[j]] = [remainingIdolIndices[j], remainingIdolIndices[i]];
      }
      let c = 0;
      for (let i = start + 1; i < CONST.EVENT_LENGTH; i++) {
        for (let j = 0; j < CONST.RECOMMENDED_SONGS_COUNT_PER_DAY; j++) {
          recommendedSongs[i][j] = remainingIdolIndices[c];
          c++;
        }
      }
      for (let extra = 0; extra < nCandidates; extra++) {
        const answer = solve(recommendedSongs, canRunningTimeSec, { [start]: extra });
        sumPoints[extra] += answer.calcFinalPoints();
        const totalStamina = sum(staminaPerDay(answer).slice(start));
        sumTotalJewels[extra] += requiredJewels(totalStamina);
      }
    }

    const expectedPoints = sumPoints.map((s) => s / setting.SIMULATION_COUNT);
    let bestExtra = 0;
    for (let e = 1; e < nCandidates; e++) if (expectedPoints[e] >= expectedPoints[bestExtra]) bestExtra = e;

    const breakdown = startDayBreakdown(canRunningTimeSec, bestExtra);
    return {
      ...breakdown,
      expectedFinalPoints: expectedPoints[bestExtra],
      expectedTotalJewels: sumTotalJewels[bestExtra] / setting.SIMULATION_COUNT,
    };
  }

  function binarySearchMinRatio(solveFn, baseTimesSec, getPoints) {
    let finalAns = solveFn(adjustedRunningTimeSec(baseTimesSec));
    let found = false;
    let lo = 0.0, hi = 1.0;
    // 倍率 m を整数秒に丸めて使うため、最大稼働秒(<=86400)に対し秒精度に達する17回で十分
    for (let k = 0; k < 17; k++) {
      const m = (lo + hi) / 2;
      const scaled = baseTimesSec.map((sec) => Math.trunc(sec * m));
      const ans = solveFn(adjustedRunningTimeSec(scaled));
      if (getPoints(ans) >= setting.TARGET_POINTS) {
        hi = m; finalAns = ans; found = true;
      } else {
        lo = m;
      }
    }
    return [finalAns, found];
  }

  return {
    adjustedRunningTimeSec, solveConfirmed, solveUnconfirmed,
    binarySearchMinRatio, staminaPerDay, requiredJewels,
  };
}
