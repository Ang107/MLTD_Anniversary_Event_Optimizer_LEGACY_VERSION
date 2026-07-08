"use strict";

const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

function loadSimulator() {
  const ctx = { console };
  vm.createContext(ctx);
  const code = [
    "js/config-helpers.js",
    "js/config.js",
    "js/simulator.js",
  ].map((file) => fs.readFileSync(path.join(ROOT, file), "utf8")).join("\n")
    + "\nglobalThis.__exports = { CONST, DEFAULTS, buildSimulator, sum };";
  vm.runInContext(code, ctx, { filename: "simulator-bundle.js" });
  return ctx.__exports;
}

const { CONST, DEFAULTS, buildSimulator, sum } = loadSimulator();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDayReplayState() {
  return {
    boostMode: null,
    boostRemaining: 0,
  };
}

function startBoost(action, sim, setting, day, replayState) {
  assert(["NORMAL_SONG", "ANNIVERSARY_SONG"].includes(action.boostMode));
  assert.equal(action.boostMode, setting.BOOST_MODE, `day ${day} boost mode`);
  assert(sim.useBoost(day), `day ${day} unexpected boost action`);
  assert.equal(replayState.boostRemaining, 0, `day ${day} duplicate or overlapping boost action`);
  replayState.boostMode = action.boostMode;
  replayState.boostRemaining = CONST.BOOST_COUNT;
}

function consumeBoosted(replayState, playCount, mode) {
  if (replayState.boostMode !== mode || replayState.boostRemaining <= 0) {
    return 0;
  }
  const boostedCount = Math.min(playCount, replayState.boostRemaining);
  replayState.boostRemaining -= boostedCount;
  return boostedCount;
}

function expectedAction(action, sim, setting, day, replayState) {
  const V450 = CONST.VALUE_BY_450_TICKET;
  const V1800 = CONST.VALUE_BY_1800_TICKET;
  const STD = CONST.STANDARD_TRIGGER;
  const PT = CONST.POINT_BY_STANDARD_TRIGGER;

  switch (action.kind) {
    case "loginTrigger":
      return {
        pointsDelta: 0,
        triggerDelta: CONST.LOGIN_TRIGGER,
        timeSec: 0,
      };
    case "boost":
      startBoost(action, sim, setting, day, replayState);
      return { pointsDelta: 0, triggerDelta: 0, timeSec: 0 };
    case "workTickets": {
      const expectedMultiplier = day <= CONST.FIRST_HALF_END_DAY ? 2 : 3;
      assert.equal(action.workMultiplier, expectedMultiplier, `day ${day} work multiplier`);
      return {
        pointsDelta: 0,
        triggerDelta: 0,
        timeSec: sim.workingTimeSec(day) + setting.MENU_TRANSITION_TIME_SEC,
      };
    }
    case "recommendedSong": {
      assert(action.idolIndex >= 0 && action.idolIndex < CONST.IDOL_COUNT);
      const boostedCount = consumeBoosted(replayState, 1, "NORMAL_SONG");
      const value = V450 * (1 + boostedCount);
      return {
        pointsDelta: value,
        triggerDelta: value + CONST.RECOMMENDED_SONGS_MISSION_TRIGGER,
        timeSec: setting.FROM_SONG_SELECT_TO_START_SONG_TIME_SEC
          + setting.SONG_TIMES_SEC_BY_IDOL[action.idolIndex]
          + setting.FROM_SONG_END_TO_SONG_SELECT_TIME_SEC,
      };
    }
    case "routine": {
      assert(action.count > 0);
      assert(Number.isInteger(action.count), `day ${day} routine count must be an integer`);
      assert(action.idolIndex >= 0 && action.idolIndex < CONST.IDOL_COUNT);
      assert.equal(
        action.idolIndex,
        sim.fastestRecommendedIdolIndex(day),
        `day ${day} routine idol should be the fastest recommended song`,
      );
      const expectedMultiplier = day <= CONST.FIRST_HALF_END_DAY ? 2 : 3;
      assert.equal(action.workMultiplier, expectedMultiplier, `day ${day} routine work multiplier`);
      const playCount = action.count * CONST.RECOMMENDED_SONGS_COUNT_PER_DAY;
      const boostedCount = consumeBoosted(replayState, playCount, "NORMAL_SONG");
      const value = action.count * V1800 + boostedCount * V450;
      return {
        pointsDelta: value,
        triggerDelta: value,
        timeSec: action.count * sim.normalSongRoutineTimeSec(
          day,
          setting.SONG_TIMES_SEC_BY_IDOL[action.idolIndex],
        ),
      };
    }
    case "anniv10x":
      assert(action.count > 0);
      assert(Number.isInteger(action.count), `day ${day} anniv10x count must be an integer`);
      return {
        pointsDelta: action.count * PT * 10,
        triggerDelta: -action.count * STD * 10,
        timeSec: sim.anniversarySongTimeSec(action.count),
      };
    case "anniv4x": {
      assert(action.count > 0);
      assert(Number.isInteger(action.count), `day ${day} anniv4x count must be an integer`);
      const boostedCount = consumeBoosted(replayState, action.count, "ANNIVERSARY_SONG");
      const pointsDelta = action.count * PT * 4 + boostedCount * PT * 4;
      return {
        pointsDelta,
        triggerDelta: -action.count * STD * 4,
        timeSec: sim.anniversarySongTimeSec(action.count),
      };
    }
    default:
      throw new Error(`unknown action kind: ${action.kind}`);
  }
}

function countActions(actions, kind) {
  return actions.reduce((total, action) => total + (action.kind === kind ? 1 : 0), 0);
}

function sumActionCounts(actions, kind) {
  return actions.reduce((total, action) => total + (action.kind === kind ? action.count : 0), 0);
}

function assertBoostCoversExpectedPlays(actions, sim, setting, day, label) {
  if (!sim.useBoost(day) || !["NORMAL_SONG", "ANNIVERSARY_SONG"].includes(setting.BOOST_MODE)) {
    return;
  }

  const boostIndex = actions.findIndex((action) => action.kind === "boost");
  assert.notEqual(boostIndex, -1, `${label}: day ${day} boost action is required`);
  assert.equal(actions[boostIndex].boostMode, setting.BOOST_MODE, `${label}: day ${day} boost mode`);

  let boostedPlayCount = 0;
  for (let i = boostIndex + 1; i < actions.length && boostedPlayCount < CONST.BOOST_COUNT; i++) {
    const action = actions[i];
    if (action.kind === "anniv10x") continue;

    if (setting.BOOST_MODE === "NORMAL_SONG") {
      if (action.kind === "recommendedSong") {
        boostedPlayCount += 1;
      } else if (action.kind === "routine") {
        boostedPlayCount += action.count * CONST.RECOMMENDED_SONGS_COUNT_PER_DAY;
      } else if (action.kind === "anniv4x") {
        assert.fail(`${label}: day ${day} action ${i} plays anniv4x during normal-song boost`);
      }
    } else if (setting.BOOST_MODE === "ANNIVERSARY_SONG") {
      if (action.kind === "anniv4x") {
        boostedPlayCount += action.count;
      } else if (action.kind === "recommendedSong" || action.kind === "routine") {
        assert.fail(`${label}: day ${day} action ${i} plays normal song during anniversary-song boost`);
      }
    }
  }

  assert(
    boostedPlayCount >= CONST.BOOST_COUNT,
    `${label}: day ${day} boost is not fully consumed (${boostedPlayCount}/${CONST.BOOST_COUNT} matching non-10x plays)`,
  );
}

function assertRecommendedSongSequence(actions, sim, setting, day, label) {
  const expectedRecommendedCount = sim.playRecommendedOnce(day) ? CONST.RECOMMENDED_SONGS_COUNT_PER_DAY : 0;
  if (expectedRecommendedCount === 0) return;

  const workIndex = actions.findIndex((action) => action.kind === "workTickets");
  assert.notEqual(workIndex, -1, `${label}: day ${day} work action is required before recommended songs`);

  for (let i = 0; i < expectedRecommendedCount; i++) {
    const actionIndex = workIndex + 1 + i;
    const action = actions[actionIndex];
    assert.equal(
      action?.kind,
      "recommendedSong",
      `${label}: day ${day} recommended song ${i} should immediately follow work action`,
    );
    assert.equal(
      action.idolIndex,
      setting.RECOMMENDED_SONGS[day][i],
      `${label}: day ${day} recommended song ${i} idol`,
    );
  }
}

function assertDayActionStructure(actions, answer, sim, setting, day, label) {
  const expectedLoginCount = sim.receiveLoginTrigger(day) ? 1 : 0;
  assert.equal(countActions(actions, "loginTrigger"), expectedLoginCount, `${label}: day ${day} login action count`);

  const expectedBoostCount = sim.useBoost(day) && ["NORMAL_SONG", "ANNIVERSARY_SONG"].includes(setting.BOOST_MODE) ? 1 : 0;
  assert.equal(countActions(actions, "boost"), expectedBoostCount, `${label}: day ${day} boost action count`);

  const expectedWorkCount = sim.playRecommendedOnce(day) ? 1 : 0;
  assert.equal(countActions(actions, "workTickets"), expectedWorkCount, `${label}: day ${day} work action count`);

  const recommendedSongs = actions.filter((action) => action.kind === "recommendedSong");
  const expectedRecommendedCount = sim.playRecommendedOnce(day) ? CONST.RECOMMENDED_SONGS_COUNT_PER_DAY : 0;
  assert.equal(recommendedSongs.length, expectedRecommendedCount, `${label}: day ${day} recommended song action count`);
  assertRecommendedSongSequence(actions, sim, setting, day, label);

  assert.equal(
    sumActionCounts(actions, "anniv10x"),
    sim.effectiveAnniv10xCount(day),
    `${label}: day ${day} anniv10x fixed count`,
  );

  assert(
    answer.anniv4xCounts[day] >= sim.dayMinAnniv4xCount(day),
    `${label}: day ${day} anniv4x count ${answer.anniv4xCounts[day]} is below minimum`,
  );

  assertBoostCoversExpectedPlays(actions, sim, setting, day, label);
}

function replayAnswer(answer, sim, setting, label, endDayExclusive = CONST.EVENT_LENGTH) {
  const n = CONST.EVENT_LENGTH;
  const start = setting.SIMULATE_START_DAY;
  let points = 0;
  let trigger = 0;

  for (let day = 0; day < n; day++) {
    if (day === start) {
      points += setting.HAVING_POINTS;
      trigger += setting.HAVING_TRIGGER;
      assert.equal(answer.initialState.points, setting.HAVING_POINTS, `${label}: initial points`);
      assert.equal(answer.initialState.trigger, setting.HAVING_TRIGGER, `${label}: initial trigger`);
      assert.equal(
        answer.initialState.shouldDisplay,
        setting.HAVING_POINTS > 0 || setting.HAVING_TRIGGER > 0,
        `${label}: initial state display flag`,
      );
    }

    let dayPoints = 0;
    let dayTriggerInc = 0;
    let dayTriggerDec = 0;
    let dayTime = 0;
    let routines = 0;
    let anniv4x = 0;
    let anniv10x = 0;
    const replayState = createDayReplayState();
    const actions = answer.dayActions[day] || [];

    if (day < start || day >= endDayExclusive) {
      assert.equal(actions.length, 0, `${label}: day ${day} should not have actions`);
    } else {
      assertDayActionStructure(actions, answer, sim, setting, day, label);
    }

    for (const [i, action] of actions.entries()) {
      const expected = expectedAction(action, sim, setting, day, replayState);
      assert.equal(action.pointsDelta, expected.pointsDelta, `${label}: day ${day} action ${i} points`);
      assert.equal(action.triggerDelta, expected.triggerDelta, `${label}: day ${day} action ${i} trigger`);
      assert.equal(action.timeSec, expected.timeSec, `${label}: day ${day} action ${i} time`);

      points += action.pointsDelta;
      trigger += action.triggerDelta;
      assert(trigger >= 0, `${label}: day ${day} action ${i} made trigger negative (${trigger})`);

      dayPoints += action.pointsDelta;
      if (action.triggerDelta >= 0) dayTriggerInc += action.triggerDelta;
      else dayTriggerDec -= action.triggerDelta;
      dayTime += action.timeSec;

      if (action.kind === "workTickets") routines += 1;
      if (action.kind === "routine") routines += action.count;
      if (action.kind === "anniv4x") anniv4x += action.count;
      if (action.kind === "anniv10x") anniv10x += action.count;
    }

    assert.equal(dayPoints, answer.pointsIncreases[day], `${label}: day ${day} points increase`);
    assert.equal(dayTriggerInc, answer.triggerIncreases[day], `${label}: day ${day} trigger increase`);
    assert.equal(dayTriggerDec, answer.triggerDecreases[day], `${label}: day ${day} trigger decrease`);
    assert.equal(dayTime, answer.usedTimeSec[day], `${label}: day ${day} used time`);
    assert.equal(points, answer.pointsCumulative[day], `${label}: day ${day} cumulative points`);
    assert.equal(trigger, answer.triggerCumulative[day], `${label}: day ${day} cumulative trigger`);
    assert.equal(routines, answer.normalRoutineCounts[day], `${label}: day ${day} routine count`);
    assert.equal(anniv4x, answer.anniv4xCounts[day], `${label}: day ${day} anniv4x count`);
    assert.equal(anniv10x, answer.anniv10xCounts[day], `${label}: day ${day} anniv10x count`);
  }

  assert.equal(answer.calcFinalPoints(), points, `${label}: final points`);
  assert.equal(answer.totalUsedTimeSec, sum(answer.usedTimeSec.slice(start)), `${label}: total used time`);
}

function runConfirmedScenario(label, overrides) {
  const setting = { ...clone(DEFAULTS), ...overrides };
  const sim = buildSimulator(setting);
  const available = sim.adjustedRunningTimeSec(setting.CAN_RUNNING_TIME_HOUR.map((h) => h * 3600));
  const answer = sim.solveConfirmed(available);
  replayAnswer(answer, sim, setting, label);
}

function runUnconfirmedScenario(label, overrides) {
  const setting = { ...clone(DEFAULTS), ...overrides, CONFIRMED_RECOMMENDED_SONGS_SCHEDULE: false };
  const sim = buildSimulator(setting);
  const available = sim.adjustedRunningTimeSec(setting.CAN_RUNNING_TIME_HOUR.map((h) => h * 3600));
  const answer = sim.solveUnconfirmed(available);
  replayAnswer(answer, sim, setting, label, setting.SIMULATE_START_DAY + 1);
}

const scenarios = JSON.parse(fs.readFileSync(
  path.join(__dirname, "action-replay-cases.json"),
  "utf8",
));

for (const scenario of scenarios) {
  assert(scenario.label, "scenario.label is required");
  const mode = scenario.mode || "confirmed";
  if (mode === "confirmed") {
    runConfirmedScenario(scenario.label, scenario.overrides || {});
  } else if (mode === "unconfirmed") {
    runUnconfirmedScenario(scenario.label, scenario.overrides || {});
  } else {
    throw new Error(`unknown scenario mode: ${mode}`);
  }
}

console.log(`PASS ${scenarios.length} action replay scenarios`);
