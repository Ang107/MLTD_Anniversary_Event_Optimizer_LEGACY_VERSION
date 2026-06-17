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
    const start = setting.SIMULATE_START_DAY;
    const DAY_SEC = 24 * 3600;
    // 開始日の経過時刻（秒）。この時刻より前にあたる稼働可能枠は失われる。分単位を正確に扱うため秒で計算する
    const startClockSec = (setting.SIMULATE_START_HOUR || 0) * 3600 + (setting.SIMULATE_START_MINUTE || 0) * 60;
    const res = canRunningTimeSec.slice();
    for (let i = 0; i < start; i++) res[i] = 0;
    for (let i = start; i < CONST.EVENT_LENGTH; i++) {
      // この日に稼働を始められる時刻（秒。開始日のみ開始時刻、それ以外は0時）
      const fromSec = i === start ? startClockSec : 0;
      const yesterdayRefreshEndSec = (i > 0 ? Math.max(0, setting.REFRESH_START_TIME[i - 1] + CONST.REFRESH_TIME_HOUR - 24) : 0) * 3600;
      // [fromSec, DAY_SEC] の窓から、昨日のリフレッシュタイムの当日分と今日のリフレッシュタイム分を差し引く
      let unavailableSec = Math.max(0, yesterdayRefreshEndSec - fromSec);
      if (i < CONST.EVENT_LENGTH - 1) {
        const refreshStartSec = setting.REFRESH_START_TIME[i] * 3600;
        const refreshEndSec = refreshStartSec + CONST.REFRESH_TIME_HOUR * 3600;
        if (refreshStartSec < yesterdayRefreshEndSec) {
          throw new Error("リフレッシュタイムの開始時刻は前日のリフレッシュタイムの終了時刻以上にしてください");
        }
        unavailableSec += Math.max(0, Math.min(DAY_SEC, refreshEndSec) - Math.max(refreshStartSec, fromSec));
      }
      res[i] = Math.min(res[i], Math.max(0, (DAY_SEC - fromSec) - unavailableSec));
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
      triggerBalanceUpTo(dayExclusive) {
        return sum(this.triggerIncreases.slice(0, dayExclusive)) - sum(this.triggerDecreases.slice(0, dayExclusive));
      },
    };
  }

  // === 1日分の基礎収支（強制追加ルーティンを除く、各日に必ず入る分） ===
  const RPD = CONST.RECOMMENDED_SONGS_COUNT_PER_DAY;
  const isNormalBoost = setting.BOOST_MODE === "NORMAL_SONG";
  const isAnnivBoost = setting.BOOST_MODE === "ANNIVERSARY_SONG";

  // 開始日に既に消化済みの要素（取得済み/使用済みなら、その分は開始日の基礎収支から除外する）
  const startDay = setting.SIMULATE_START_DAY;
  const isStartDay = (day) => day === startDay;
  // ログイントリガーを受け取るか（開始日で取得済みなら受け取らない）
  const receiveLoginTrigger = (day) => !(isStartDay(day) && setting.START_DAY_LOGIN_TRIGGER_OBTAINED);
  // おすすめ楽曲を1回ずつプレイするか＝ミッショントリガーを受け取るか（開始日で取得済みなら行わない）
  const playRecommendedOnce = (day) => !(isStartDay(day) && setting.START_DAY_MISSION_TRIGGER_OBTAINED);
  // ブーストを使用するか（開始日で使用済みなら使用しない）
  const useBoost = (day) => !(isStartDay(day) && setting.START_DAY_BOOST_USED);
  // 周年曲10xをプレイするか（開始日でプレイ済みなら行わない）
  const playAnniv10x = (day) => !(isStartDay(day) && setting.START_DAY_ANNIV10X_DONE);
  // その日に実際に行う周年10x回数（開始日でプレイ済みなら0）
  function effectiveAnniv10xCount(day) { return playAnniv10x(day) ? baseAnniv10xCount(day) : 0; }

  // 通常曲ブーストで行う追加ルーティン回数。
  // ブースト BOOST_COUNT 曲のうち「おすすめ楽曲1回ずつ（RPD曲）」で消化する分を除いた残りをルーティンで消化する。
  // 例: 1回ずつあり → ceil((10-4)/4)=2 回、1回ずつなし（ミッション取得済み）→ ceil(10/4)=3 回
  function normalBoostRoutineCount(day) {
    if (!isNormalBoost || !useBoost(day)) return 0;
    const consumedByRecommended = playRecommendedOnce(day) ? RPD : 0;
    return Math.max(0, Math.ceil((CONST.BOOST_COUNT - consumedByRecommended) / RPD));
  }

  function dayBaseRoutineCount(day) {
    return (playRecommendedOnce(day) ? 1 : 0) + normalBoostRoutineCount(day);
  }
  function dayBaseAnniv4xCount(day) {
    return (isAnnivBoost && useBoost(day)) ? CONST.BOOST_COUNT : 0;
  }
  function dayBaseTriggerIncrease(day) {
    return (receiveLoginTrigger(day) ? CONST.LOGIN_TRIGGER : 0)
      + (playRecommendedOnce(day) ? CONST.VALUE_BY_450_TICKET * RPD + CONST.RECOMMENDED_SONGS_MISSION_TRIGGER * RPD : 0)
      + (isNormalBoost ? CONST.VALUE_BY_1800_TICKET * normalBoostRoutineCount(day)
        + (useBoost(day) ? CONST.VALUE_BY_450_TICKET * CONST.BOOST_COUNT : 0) : 0);
  }
  function dayBaseTriggerDecrease(day) {
    return CONST.STANDARD_TRIGGER * 10 * effectiveAnniv10xCount(day)
      + ((isAnnivBoost && useBoost(day)) ? CONST.STANDARD_TRIGGER * 4 * CONST.BOOST_COUNT : 0);
  }
  function dayBasePointsIncrease(day) {
    return (playRecommendedOnce(day) ? CONST.VALUE_BY_450_TICKET * RPD : 0)
      + CONST.POINT_BY_STANDARD_TRIGGER * 10 * effectiveAnniv10xCount(day)
      + (isNormalBoost ? CONST.VALUE_BY_1800_TICKET * normalBoostRoutineCount(day)
        + (useBoost(day) ? CONST.VALUE_BY_450_TICKET * CONST.BOOST_COUNT : 0) : 0)
      + ((isAnnivBoost && useBoost(day)) ? CONST.POINT_BY_STANDARD_TRIGGER * CONST.BOOST_COUNT * 4 * 2 : 0);
  }
  function dayBaseTimeConsumed(day, songTimes) {
    return (playRecommendedOnce(day) ? recommendedSongTimeSec(day, songTimes) : 0)
      + anniversarySongTimeSec(effectiveAnniv10xCount(day))
      + normalBoostRoutineCount(day) * normalSongRoutineTimeSec(day, Math.min(...songTimes))
      + ((isAnnivBoost && useBoost(day)) ? anniversarySongTimeSec(CONST.BOOST_COUNT) : 0);
  }

  function buildDayActions(day, answer, recommendedSongs, startTrigger) {
    const actions = [];
    const V450 = CONST.VALUE_BY_450_TICKET;
    const V1800 = CONST.VALUE_BY_1800_TICKET;
    const PT_STD = CONST.POINT_BY_STANDARD_TRIGGER;
    const STD = CONST.STANDARD_TRIGGER;
    const PLAY_COST = STD * 10;
    const PLAY_PT = PT_STD * 10;
    const X4_COST = STD * 4;
    const A10 = answer.anniv10xCounts[day];
    const A4 = answer.anniv4xCounts[day];
    const Rtotal = answer.normalRoutineCounts[day];
    const recIdx = recommendedSongs[day];
    const songTimes = songTimesOf(recIdx);
    const workMult = day <= CONST.FIRST_HALF_END_DAY ? 2 : 3;
    let curTrig = startTrigger;
    let a10Done = false;

    function pushAction(action) {
      actions.push({
        pointsDelta: 0,
        triggerDelta: 0,
        timeSec: 0,
        ...action,
      });
    }

    function emitAnniv10x(count) {
      if (count <= 0) return;
      pushAction({
        kind: "anniv10x",
        count,
        pointsDelta: count * PLAY_PT,
        triggerDelta: -(count * PLAY_COST),
        timeSec: anniversarySongTimeSec(count),
      });
      curTrig -= count * PLAY_COST;
      a10Done = true;
    }

    function emitAnniv4x(count, bonusPoints) {
      if (count <= 0) return;
      const pointsDelta = count * PT_STD * 4 + bonusPoints;
      const triggerDelta = -(count * X4_COST);
      const last = actions[actions.length - 1];
      if (last && last.kind === "anniv4x") {
        last.count += count;
        last.pointsDelta += pointsDelta;
        last.triggerDelta += triggerDelta;
        last.timeSec = anniversarySongTimeSec(last.count);
      } else {
        pushAction({
          kind: "anniv4x",
          count,
          pointsDelta,
          triggerDelta,
          timeSec: anniversarySongTimeSec(count),
        });
      }
      curTrig += triggerDelta;
    }

    let boostUsed = false;
    let boostBonusPending = (isAnnivBoost && useBoost(day)) ? PT_STD * 4 * CONST.BOOST_COUNT : 0;
    let a4Rem = A4;
    function playAnniv4x(count) {
      if (count <= 0) return;
      if (isAnnivBoost && useBoost(day) && !boostUsed) {
        pushAction({ kind: "boost", boostMode: "ANNIVERSARY_SONG" });
        boostUsed = true;
      }
      const bonus = boostBonusPending;
      boostBonusPending = 0;
      emitAnniv4x(count, bonus);
      a4Rem -= count;
    }

    const BOOST_THRESHOLD = Math.min(A4, CONST.BOOST_COUNT) * X4_COST;
    let boostBatchDone = false;
    function tryBoostBatch() {
      if (!(isAnnivBoost && useBoost(day)) || boostBatchDone) return;
      if (A10 > 0 && !a10Done) return;
      if (a4Rem <= 0 || curTrig < BOOST_THRESHOLD) return;
      playAnniv4x(Math.min(Math.floor(curTrig / X4_COST), a4Rem));
      boostBatchDone = true;
    }

    if (receiveLoginTrigger(day)) {
      pushAction({ kind: "loginTrigger", triggerDelta: CONST.LOGIN_TRIGGER });
      curTrig += CONST.LOGIN_TRIGGER;
    }
    if (useBoost(day) && isNormalBoost) {
      pushAction({ kind: "boost", boostMode: "NORMAL_SONG" });
    }

    const recFactor = (useBoost(day) && isNormalBoost) ? 2 : 1;
    if (playRecommendedOnce(day)) {
      pushAction({
        kind: "workTickets",
        workMultiplier: workMult,
        timeSec: workingTimeSec(day) + setting.MENU_TRANSITION_TIME_SEC,
      });
      for (let k = 0; k < RPD; k++) {
        const triggerDelta = V450 * recFactor + CONST.RECOMMENDED_SONGS_MISSION_TRIGGER;
        pushAction({
          kind: "recommendedSong",
          idolIndex: recIdx[k],
          pointsDelta: V450 * recFactor,
          triggerDelta,
          timeSec: setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC
            + setting.SONG_TIMES_SEC_BY_IDOL[recIdx[k]]
            + setting.FROM_SONG_END_TO_SONG_SELECT_TIME_SEC,
        });
        curTrig += triggerDelta;
      }
    }

    const R4 = Rtotal - (playRecommendedOnce(day) ? 1 : 0);
    let fastK = 0;
    for (let k = 1; k < RPD; k++) {
      if (setting.SONG_TIMES_SEC_BY_IDOL[recIdx[k]] < setting.SONG_TIMES_SEC_BY_IDOL[recIdx[fastK]]) fastK = k;
    }
    const fastSongTime = songTimes[fastK];
    let routineBonus = (R4 > 0 && useBoost(day) && isNormalBoost)
      ? V450 * (CONST.BOOST_COUNT - (playRecommendedOnce(day) ? RPD : 0)) : 0;
    let r4 = R4;

    function emitRoutine(count) {
      if (count <= 0) return;
      const bonus = routineBonus;
      routineBonus = 0;
      const value = count * V1800 + bonus;
      pushAction({
        kind: "routine",
        count,
        idolIndex: recIdx[fastK],
        workMultiplier: workMult,
        pointsDelta: value,
        triggerDelta: value,
        timeSec: count * normalSongRoutineTimeSec(day, fastSongTime),
      });
      curTrig += value;
    }

    function accumulateFor(target) {
      if (curTrig < target && r4 > 0) {
        const count = Math.min(r4, Math.max(1, Math.ceil((target - curTrig - routineBonus) / V1800)));
        emitRoutine(count);
        r4 -= count;
      }
    }

    if (A10 > 0 && !a10Done) {
      accumulateFor(A10 * PLAY_COST);
      emitAnniv10x(A10);
    }
    if (useBoost(day) && isAnnivBoost) {
      if (!boostBatchDone && a4Rem > 0) {
        accumulateFor(BOOST_THRESHOLD);
        tryBoostBatch();
      }
      if (r4 > 0) emitRoutine(r4);
      if (a4Rem > 0) playAnniv4x(a4Rem);
      const anniv4xActions = actions.filter((action) => action.kind === "anniv4x");
      if (anniv4xActions.length > 1) {
        anniv4xActions[0].flags = [...(anniv4xActions[0].flags || []), "splitAnniv4x"];
      }
    } else {
      if (r4 > 0) emitRoutine(r4);
      if (A4 > 0) emitAnniv4x(A4, 0);
    }

    return actions;
  }

  function finalizeAnswer(answer, recommendedSongs, endDayExclusive = CONST.EVENT_LENGTH) {
    const n = CONST.EVENT_LENGTH;
    const dayActions = Array.from({ length: n }, () => []);
    const pointsIncreases = Array(n).fill(0);
    const triggerIncreases = Array(n).fill(0);
    const triggerDecreases = Array(n).fill(0);
    const pointsCumulative = Array(n).fill(0);
    const triggerCumulative = Array(n).fill(0);
    const usedTimeSec = Array(n).fill(0);
    let pointsBalance = 0;
    let triggerBalance = 0;

    for (let day = 0; day < n; day++) {
      const startTrigger = day === setting.SIMULATE_START_DAY
        ? triggerBalance + setting.HAVING_TRIGGER
        : triggerBalance;
      const actions = (day < setting.SIMULATE_START_DAY || day >= endDayExclusive)
        ? []
        : buildDayActions(day, answer, recommendedSongs, startTrigger);
      dayActions[day] = actions;

      for (const action of actions) {
        pointsIncreases[day] += action.pointsDelta;
        if (action.triggerDelta >= 0) triggerIncreases[day] += action.triggerDelta;
        else triggerDecreases[day] -= action.triggerDelta;
        usedTimeSec[day] += action.timeSec;
      }
      if (day === setting.SIMULATE_START_DAY) {
        pointsBalance += setting.HAVING_POINTS;
        triggerBalance += setting.HAVING_TRIGGER;
      }
      pointsBalance += pointsIncreases[day];
      triggerBalance += triggerIncreases[day] - triggerDecreases[day];
      pointsCumulative[day] = pointsBalance;
      triggerCumulative[day] = triggerBalance;
    }

    return {
      ...answer,
      initialState: {
        points: setting.HAVING_POINTS,
        trigger: setting.HAVING_TRIGGER,
        shouldDisplay: setting.HAVING_POINTS > 0 || setting.HAVING_TRIGGER > 0,
      },
      dayActions,
      pointsIncreases,
      triggerIncreases,
      triggerDecreases,
      pointsCumulative,
      triggerCumulative,
      usedTimeSec,
      totalUsedTimeSec: sum(usedTimeSec.slice(setting.SIMULATE_START_DAY)),
      calcFinalPoints() { return this.pointsCumulative[CONST.EVENT_LENGTH - 1]; },
    };
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

    // 各日に必ず入る基礎収支（おすすめ楽曲1周・周年10x・ブースト分）
    for (let i = 0; i < n; i++) {
      normalRoutineCounts[i] = dayBaseRoutineCount(i);
      anniv4xCounts[i] = dayBaseAnniv4xCount(i);
      anniv10xCounts[i] = effectiveAnniv10xCount(i);
      triggerIncreases[i] = dayBaseTriggerIncrease(i);
      triggerDecreases[i] = dayBaseTriggerDecrease(i);
      pointsIncreases[i] = dayBasePointsIncrease(i);
      remainingTimesSec[i] -= dayBaseTimeConsumed(i, songTimesOf(recommendedSongs[i]));
    }

    // 開始日より前は計上しない（所持分 HAVING_* は下で最適化用の開始日残高に加算する）
    for (let i = 0; i < setting.SIMULATE_START_DAY; i++) {
      normalRoutineCounts[i] = 0;
      anniv4xCounts[i] = 0;
      anniv10xCounts[i] = 0;
      triggerIncreases[i] = 0;
      triggerDecreases[i] = 0;
      pointsIncreases[i] = 0;
      remainingTimesSec[i] = 0;
    }
    // 所持ポイント／トリガーは最適化用 state では開始日の残高として扱う。
    // 公開する answer では finalizeAnswer が initialState と累積配列に分けて返す。
    triggerIncreases[setting.SIMULATE_START_DAY] += setting.HAVING_TRIGGER;
    pointsIncreases[setting.SIMULATE_START_DAY] += setting.HAVING_POINTS;

    const state = makeState();
    state.normalRoutineCounts = normalRoutineCounts;
    state.anniv4xCounts = anniv4xCounts;
    state.anniv10xCounts = anniv10xCounts;
    state.triggerIncreases = triggerIncreases;
    state.triggerDecreases = triggerDecreases;
    state.pointsIncreases = pointsIncreases;
    state.remainingTimesSec = remainingTimesSec;
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
      // 各日は残り時間いっぱい 周年4x でトリガーを消費する想定（持ち越し日は remTime=0 で寄与しない）
      trigger -= Math.floor(Math.max(0, state.remainingTimesSec[d] - setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC) / ANNIV_SLOT_SEC) * CONST.STANDARD_TRIGGER * 4;
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
      // 生成したトリガーを今日以降に消費しきれる範囲までしかルーティンを積まない。
      // 余剰トリガーを生むだけのルーティンは時間あたり効率が悪いため行わない。
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

    // Phase 1: 各日のルーティン回数（＝トリガー生成量）をルーティン効率の良い日順に決める。
    // 周年4x（トリガー消費）は「前の日のトリガーを後の日が使う」時系列依存のため、効率順で処理する
    // この段階では適用せず、時系列順の Phase 2 でまとめて消費する。
    const forcedDays = new Set();
    if (forcedExtraRoutines) {
      for (const [dayStr, extra] of Object.entries(forcedExtraRoutines)) {
        const day = Number(dayStr);
        applyNormalRoutine(state, day, extra, routineTimePerDay[day]);
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
    }

    // Phase 2: 確定したルーティンが生むトリガーを、時系列順に各日の残り時間で最大限 周年4x に消費する。
    // さらに、消費後も残り時間がその日のルーティン1回分以上あるなら（トリガー切れで時間が余っている日）、
    // 「ルーティン1回追加 → 周年4x追加」を残り時間が尽きるまで繰り返し、遊休時間を埋める。
    // ただし強制日（未確定モードの開始日）はルーティン回数を extra で固定して探索対象とするため、埋めない。
    for (let day = setting.SIMULATE_START_DAY; day < CONST.EVENT_LENGTH; day++) {
      decideAndApplyAnniv4x(state, day);
      if (forcedDays.has(day)) continue;
      const routineTimeSec = routineTimePerDay[day];
      while (state.remainingTimesSec[day] >= routineTimeSec) {
        applyNormalRoutine(state, day, 1, routineTimeSec);
        decideAndApplyAnniv4x(state, day);
      }
    }

    return finalizeAnswer({
      normalRoutineCounts: state.normalRoutineCounts,
      anniv4xCounts: state.anniv4xCounts,
      anniv10xCounts: state.anniv10xCounts,
    }, recommendedSongs);
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

  // 未確定モードの開始日の「おすすめ行動」を、確定したルーティン回数(base+extra)を前提に決定的に算出する。
  // 後日（不確定）の消費は考慮せず、開始日の残り時間と手持ちトリガーの両方が許す範囲で
  // 可能な限り周年4xを撃つ回数を求め、それを元に稼働時間・収支を導出する（表示のつじつまを合わせるため）。
  function startDayBreakdown(canRunningTimeSec, extra) {
    const start = setting.SIMULATE_START_DAY;
    const startSongTimes = songTimesOf(setting.RECOMMENDED_SONGS[start]);
    const routineTimeSec = normalSongRoutineTimeSec(start, Math.min(...startSongTimes));
    const routineCount = dayBaseRoutineCount(start) + extra;
    const baseAnniv4x = dayBaseAnniv4xCount(start);

    // 周年4x 以外の固定行動＋追加ルーティンを終えた後の残り時間
    const remaining = canRunningTimeSec[start]
      - dayBaseTimeConsumed(start, startSongTimes)
      - extra * routineTimeSec;
    // 開始日終了時点で手持ちのトリガー（所持＋開始日の収入−開始日の固定消費）。後日は見ない。
    const startTrigger = setting.HAVING_TRIGGER
      + dayBaseTriggerIncrease(start) + extra * CONST.VALUE_BY_1800_TICKET
      - dayBaseTriggerDecrease(start);

    const entryCost = baseAnniv4x > 0 ? 0 : setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC;
    // 時間とトリガーの両方が許す範囲で、可能な限り多く周年4xを撃つ
    const anniv4xExtra = Math.max(0, Math.min(
      Math.floor((remaining - entryCost) / ANNIV_SLOT_SEC),
      Math.floor(startTrigger / (CONST.STANDARD_TRIGGER * 4))
    ));
    const anniv4xCount = baseAnniv4x + anniv4xExtra;
    const answer = {
      normalRoutineCounts: Array(CONST.EVENT_LENGTH).fill(0),
      anniv4xCounts: Array(CONST.EVENT_LENGTH).fill(0),
      anniv10xCounts: Array(CONST.EVENT_LENGTH).fill(0),
    };
    answer.normalRoutineCounts[start] = routineCount;
    answer.anniv4xCounts[start] = anniv4xCount;
    answer.anniv10xCounts[start] = effectiveAnniv10xCount(start);
    return finalizeAnswer(answer, setting.RECOMMENDED_SONGS, start + 1);
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
    const sumTotalStamina = Array(nCandidates).fill(0);
    const sumTotalUsedTime = Array(nCandidates).fill(0);

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
        const stamina = sum(staminaPerDay(answer).slice(start));
        sumPoints[extra] += answer.calcFinalPoints();
        sumTotalJewels[extra] += requiredJewels(stamina);
        sumTotalStamina[extra] += stamina;
        sumTotalUsedTime[extra] += sum(answer.usedTimeSec.slice(start));
      }
    }

    const N = setting.SIMULATION_COUNT;
    const expectedPoints = sumPoints.map((s) => s / N);
    let bestExtra = 0;
    for (let e = 1; e < nCandidates; e++) if (expectedPoints[e] >= expectedPoints[bestExtra]) bestExtra = e;

    // 最終ポイント・ジュエル・スタミナ・稼働時間は期待値、開始日の行動は確定した bestExtra から決定的に算出する。
    return {
      ...startDayBreakdown(canRunningTimeSec, bestExtra),
      expectedFinalPoints: expectedPoints[bestExtra],
      expectedTotalJewels: sumTotalJewels[bestExtra] / N,
      expectedTotalStamina: sumTotalStamina[bestExtra] / N,
      expectedTotalUsedTimeSec: sumTotalUsedTime[bestExtra] / N,
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
