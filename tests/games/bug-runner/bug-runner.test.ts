import { expect, test } from "claude-code/testing";
import {
  type BugRunnerState,
  bugRunner,
  COLORS,
  DUCK_STEPS,
  JUMP_HEIGHTS,
  MODES,
  type ModeId,
  type Obstacle,
  PLAYER_X,
  runnerRows,
  speedOf,
  TENTHS_PER_STEP,
} from "../../../src/games/bug-runner/bug-runner";
import { SEED } from "../../fixtures/engine";

const tickOnce = (s: BugRunnerState) => bugRunner.tick?.(s) ?? s;

const ticks = (s: BugRunnerState, n: number) =>
  Array.from({ length: n }).reduce<BugRunnerState>(tickOnce, s);

// One step of the world: ticks until the runner moves, or the game ends
const stepOnce = (s: BugRunnerState) => {
  let state = tickOnce(s);
  while (state.distance === s.distance && !state.crash) state = tickOnce(state);
  return state;
};

const steps = (s: BugRunnerState, n: number) =>
  Array.from({ length: n }).reduce<BugRunnerState>(stepOnce, s);

const press = (s: BugRunnerState, ...ids: string[]) => ids.reduce(bugRunner.onControl, s);

// A new game in `mode`, reached with `h` from Easy
const inMode = (mode: ModeId): BugRunnerState => {
  const presses = { easy: 0, medium: 1, hard: 2 }[mode];
  return press(bugRunner.init(SEED), ...Array<string>(presses).fill("mode"));
};

// A fresh game with `obstacles` placed `ahead` steps right of the runner, and none coming soon
const facing = (...obstacles: [Obstacle["kind"], number][]): BugRunnerState => ({
  ...bugRunner.init(SEED),
  obstacles: obstacles.map(([kind, ahead]) => ({ kind, x: PLAYER_X + ahead })),
  gap: 100,
});

const line = (s: BugRunnerState) => bugRunner.status(s).line;

const cell = (s: BugRunnerState, row: number, col: number) => bugRunner.board(s).rows[row]?.[col];

// Clears what comes one step away: jumps a bug, ducks an error, in the air with a dive
const autopilot = (s: BugRunnerState): BugRunnerState => {
  const next = s.obstacles.find((o) => o.x === PLAYER_X + 1);
  if (next?.kind === "bug") return press(s, "jump");
  if (next?.kind === "error") {
    return s.pose.kind === "duck" && s.pose.left > 1 ? s : press(s, "duck");
  }
  return s;
};

// The autopilot run up to `distance` steps or a crash, and whether a combo came up
const autoRun = (s: BugRunnerState, distance: number) => {
  let state = s;
  let firstError: number | null = null;
  let hasCombo = false;
  while (state.distance < distance && !state.crash) {
    state = tickOnce(autopilot(state));
    if (firstError === null && state.obstacles.some((o) => o.kind === "error")) {
      firstError = state.distance;
    }
    hasCombo ||= state.combo !== null;
  }
  return { state, firstError, hasCombo };
};

test("a game starts in Easy, running at score 0, with nothing on the track", () => {
  const s = bugRunner.init(SEED);
  expect(s.mode).toBe("easy");
  expect(s.pose).toEqual({ kind: "run" });
  expect(s.obstacles).toEqual([]);
  expect(bugRunner.status(s)).toEqual({
    phase: "playing",
    score: 0,
    line: "Easy ×1 · 4 steps/s",
  });
});

test("each step adds one point in Easy, two in Medium, three in Hard", () => {
  expect(bugRunner.status(steps(inMode("easy"), 7)).score).toBe(7);
  expect(bugRunner.status(steps(inMode("medium"), 7)).score).toBe(14);
  expect(bugRunner.status(steps(inMode("hard"), 7)).score).toBe(21);
});

test("at 5 steps a second the runner steps every other tick", () => {
  const s = inMode("medium");
  expect(ticks(s, 1).distance).toBe(0);
  expect(ticks(s, 2).distance).toBe(1);
  expect(ticks(s, 10).distance).toBe(5);
});

test("a tick between two steps changes nothing shown", () => {
  const s = bugRunner.init(SEED);
  const between = ticks(s, 1);
  expect(bugRunner.board(between)).toEqual(bugRunner.board(s));
  expect(bugRunner.status(between)).toEqual(bugRunner.status(s));
});

test("the speed rises with the distance, up to each mode's top, under 10 steps a second", () => {
  expect([0, 119, 120, 240, 3000].map((d) => speedOf("easy", d))).toEqual([4, 4, 5, 6, 6]);
  expect([0, 100, 200, 3000].map((d) => speedOf("medium", d))).toEqual([5, 6, 7, 7]);
  expect([0, 80, 160, 3000].map((d) => speedOf("hard", d))).toEqual([6, 7, 8, 8]);
  for (const m of Object.values(MODES)) expect(m.topSpeed).toBeLessThan(TENTHS_PER_STEP);
});

test("the status line shows the speed as it rises", () => {
  expect(line(autoRun(inMode("hard"), 159).state)).toBe("Hard ×3 · 7 steps/s");
  expect(line(autoRun(inMode("hard"), 160).state)).toBe("Hard ×3 · 8 steps/s");
});

test("h goes Easy, Medium, Hard and back, each time in a new game", () => {
  const easy = steps(bugRunner.init(SEED), 5);
  const medium = press(easy, "mode");
  expect(medium).toMatchObject({ mode: "medium", distance: 0, progress: 0, obstacles: [] });
  expect(line(medium)).toBe("Medium ×2 · 5 steps/s");
  expect(press(medium, "mode").mode).toBe("hard");
  expect(press(medium, "mode", "mode").mode).toBe("easy");
});

test("h works on an ended game; r plays again in the same mode", () => {
  const over = steps(facing(["bug", 1]), 1);
  expect(press(over, "mode")).toMatchObject({ mode: "medium", crash: null });
  const hard = steps(inMode("hard"), 3);
  expect(bugRunner.restart?.(hard, SEED)).toMatchObject({ mode: "hard", distance: 0 });
});

test("obstacles appear on the right and scroll left one column per step", () => {
  const s = steps(bugRunner.init(SEED), 10);
  expect(s.obstacles).toEqual([{ kind: "bug", x: 17 }]);
  expect(steps(s, 3).obstacles).toEqual([{ kind: "bug", x: 14 }]);
});

test("the first obstacle comes sooner in a harder mode", () => {
  const firstAt = (mode: ModeId) => {
    let s = inMode(mode);
    while (s.obstacles.length === 0) s = stepOnce(s);
    return s.distance;
  };
  expect([firstAt("easy"), firstAt("medium"), firstAt("hard")]).toEqual([
    MODES.easy.firstGap,
    MODES.medium.firstGap,
    MODES.hard.firstGap,
  ]);
});

test("running into a bug ends the game", () => {
  const over = steps(facing(["bug", 1]), 1);
  expect(bugRunner.status(over)).toEqual({ phase: "lost", score: 1, line: "Easy ×1 · Hit a bug" });
  expect(cell(over, 2, PLAYER_X)).toEqual({ ch: "✳", fg: COLORS.error });
});

test("a jump just before a bug clears it, and lands after 5 steps", () => {
  const landed = steps(press(facing(["bug", 1]), "jump"), JUMP_HEIGHTS.length);
  expect(bugRunner.status(landed).phase).toBe("playing");
  expect(landed.pose).toEqual({ kind: "run" });
});

test("a jump pressed too early lands on the bug", () => {
  const early = press(facing(["bug", JUMP_HEIGHTS.length + 1]), "jump");
  expect(line(steps(early, JUMP_HEIGHTS.length + 1))).toBe("Easy ×1 · Hit a bug");
});

test("an error hits a runner standing or jumping, not ducking", () => {
  expect(line(steps(facing(["error", 1]), 1))).toBe("Easy ×1 · Hit an error");
  expect(line(steps(press(facing(["error", 1]), "jump"), 1))).toBe("Easy ×1 · Hit an error");
  expect(bugRunner.status(steps(press(facing(["error", 1]), "duck"), 1)).phase).toBe("playing");
});

test("ducking does not clear a bug", () => {
  expect(line(steps(press(facing(["bug", 1]), "duck"), 1))).toBe("Easy ×1 · Hit a bug");
});

test("the runner stands two rows tall, ducks to one, rises in a jump", () => {
  expect(runnerRows({ kind: "run" })).toEqual([2, 3]);
  expect(runnerRows({ kind: "duck", left: 1 })).toEqual([3]);
  expect(runnerRows({ kind: "jump", at: 2 })).toEqual([0, 1]);
});

test("a duck lasts 5 steps, and g while ducked holds it 5 steps more", () => {
  const ducked = press(bugRunner.init(SEED), "duck");
  expect(steps(ducked, DUCK_STEPS - 1).pose.kind).toBe("duck");
  expect(steps(ducked, DUCK_STEPS).pose).toEqual({ kind: "run" });
  const held = press(steps(ducked, 3), "duck");
  expect(held.pose).toEqual({ kind: "duck", left: DUCK_STEPS });
});

test("g in the air dives straight into a duck; f in the air changes nothing", () => {
  const jumping = press(bugRunner.init(SEED), "jump");
  expect(press(jumping, "jump")).toBe(jumping);
  expect(press(steps(jumping, 2), "duck").pose).toEqual({ kind: "duck", left: DUCK_STEPS });
  expect(press(press(bugRunner.init(SEED), "duck"), "jump").pose).toEqual({ kind: "jump", at: 0 });
  const ducked = press(bugRunner.init(SEED), "duck");
  expect(press(ducked, "duck")).toBe(ducked);
});

test("a jump then a dive clear a bug and an error 2 steps apart", () => {
  const jumped = steps(press(facing(["bug", 1], ["error", 3]), "jump"), 1);
  const dived = press(steps(jumped, 1), "duck");
  expect(bugRunner.status(steps(dived, 3)).phase).toBe("playing");
});

test("a duck then a jump clear an error and a bug 2 steps apart", () => {
  const ducked = steps(press(facing(["error", 1], ["bug", 3]), "duck"), 2);
  expect(bugRunner.status(steps(press(ducked, "jump"), 3)).phase).toBe("playing");
});

test("diving onto a bug or rising into an error hits it at once", () => {
  const overBug = steps(press(facing(["bug", 1]), "jump"), 1);
  expect(line(press(overBug, "duck"))).toBe("Easy ×1 · Hit a bug");
  const underError = steps(press(facing(["error", 1]), "duck"), 1);
  expect(line(press(underError, "jump"))).toBe("Easy ×1 · Hit an error");
});

test("an ended game takes no jump, no duck and no tick", () => {
  const over = steps(facing(["bug", 1]), 1);
  expect(press(over, "jump")).toBe(over);
  expect(press(over, "duck")).toBe(over);
  expect(bugRunner.tick?.(over)).toBe(over);
});

test("Easy brings errors only after 40 steps and no combo", () => {
  const { state, firstError, hasCombo } = autoRun(inMode("easy"), 1000);
  expect(bugRunner.status(state)).toMatchObject({ phase: "playing", score: 1000 });
  expect(firstError ?? 0).toBeGreaterThanOrEqual(MODES.easy.errorsFrom);
  expect(hasCombo).toBe(false);
});

for (const mode of ["medium", "hard"] as const) {
  test(`${MODES[mode].name} brings combos, and every obstacle can be cleared`, () => {
    const { state, hasCombo } = autoRun(inMode(mode), 1000);
    expect(bugRunner.status(state)).toMatchObject({
      phase: "playing",
      score: 1000 * MODES[mode].multiplier,
    });
    expect(hasCombo).toBe(true);
  });
}
