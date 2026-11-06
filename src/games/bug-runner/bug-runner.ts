import { drawCells } from "../cells";
import type { Cell, CellBoard, Game } from "../game";
import { roll } from "../random";

// The world moves in steps, and a tick adds `speed` tenths of a step: at speed 5, a step every
// 200 ms. A tick that makes no step changes nothing shown, so the pane does not redraw. The speed
// stays under 10 steps a second: at 10 redraws a second Desktop drops keys
const TICK_MS = 100;
export const TENTHS_PER_STEP = 10;
export const COLUMNS = 18;
// Rows 0 (top) to 3 (just above the ground); the ground is drawn below them
const ROWS = 4;
export const PLAYER_X = 3;

// How high the runner is lifted at each step of a jump, from the press on
export const JUMP_HEIGHTS = [1, 2, 2, 2, 1];
export const DUCK_STEPS = 5;

export type ModeId = "easy" | "medium" | "hard";

// Gaps are in steps, the same as columns: an obstacle moves one column a step
type Mode = {
  name: string;
  // Points per step: one best score covers every mode, so a harder one pays more
  multiplier: number;
  // Steps a second at the start, plus one every `speedStep` steps, up to `topSpeed`
  speed: number;
  topSpeed: number;
  speedStep: number;
  firstGap: number;
  // The shortest gap starts at `maxGap` and shrinks by one step every `gapStep` steps, to `minGap`
  maxGap: number;
  minGap: number;
  gapStep: number;
  // Added to the shortest gap: up to `spread - 1` steps more
  spread: number;
  // Errors join the bugs once the runner is this far
  errorsFrom: number;
  errorRate: number;
  // The chance that an obstacle comes with one of the other kind `comboGap` steps behind it
  comboRate: number;
  comboGap: number;
};

// A bug follows another 5 steps behind at least: the runner lands, then jumps again
export const MODES: Record<ModeId, Mode> = {
  easy: {
    name: "Easy",
    multiplier: 1,
    speed: 5,
    topSpeed: 7,
    speedStep: 150,
    firstGap: 10,
    maxGap: 12,
    minGap: 6,
    gapStep: 50,
    spread: 6,
    errorsFrom: 40,
    errorRate: 0.35,
    comboRate: 0,
    comboGap: 0,
  },
  medium: {
    name: "Medium",
    multiplier: 2,
    speed: 6,
    topSpeed: 8,
    speedStep: 120,
    firstGap: 8,
    maxGap: 9,
    minGap: 5,
    gapStep: 60,
    spread: 4,
    errorsFrom: 0,
    errorRate: 0.45,
    comboRate: 0.15,
    comboGap: 3,
  },
  hard: {
    name: "Hard",
    multiplier: 3,
    speed: 6,
    topSpeed: 8,
    speedStep: 80,
    firstGap: 6,
    maxGap: 7,
    minGap: 5,
    gapStep: 60,
    spread: 3,
    errorsFrom: 0,
    errorRate: 0.5,
    comboRate: 0.35,
    comboGap: 2,
  },
};

const MODE_ORDER: ModeId[] = ["easy", "medium", "hard"];

export const COLORS = {
  runner: "#d97757",
  bug: "#5fd75f",
  error: "#ff5f5f",
  ground: "#5a5a5a",
};

export type ObstacleKind = "bug" | "error";
export type Obstacle = { kind: ObstacleKind; x: number };

export type Pose =
  | { kind: "run" }
  // Steps since the jump began, an index in JUMP_HEIGHTS
  | { kind: "jump"; at: number }
  | { kind: "duck"; left: number };

export type BugRunnerState = {
  mode: ModeId;
  // Steps run; the score is this times the mode's multiplier
  distance: number;
  pose: Pose;
  obstacles: readonly Obstacle[];
  // Tenths of a step made since the last step
  progress: number;
  // Steps before the next obstacle appears on the right
  gap: number;
  // The kind the next obstacle must be: the second half of a combo
  combo: ObstacleKind | null;
  // What the runner hit, which ends the game
  crash: ObstacleKind | null;
  rng: number;
};

// A bug crawls on the ground; an error floats at head height, too low to jump over
const OBSTACLE_ROWS: Record<ObstacleKind, readonly number[]> = {
  bug: [3],
  error: [1, 2],
};

const OTHER: Record<ObstacleKind, ObstacleKind> = { bug: "error", error: "bug" };

const RUN: Pose = { kind: "run" };
const DUCK: Pose = { kind: "duck", left: DUCK_STEPS };

// The rows the runner fills, top first: two standing, one ducked, two lifted in a jump
export const runnerRows = (pose: Pose): number[] => {
  if (pose.kind === "duck") return [3];
  const lift = pose.kind === "jump" ? (JUMP_HEIGHTS[pose.at] ?? 0) : 0;
  return [2 - lift, 3 - lift];
};

const start = (mode: ModeId, seed: number): BugRunnerState => ({
  mode,
  distance: 0,
  progress: 0,
  pose: RUN,
  obstacles: [],
  gap: MODES[mode].firstGap,
  combo: null,
  crash: null,
  rng: seed | 0,
});

const init = (seed: number): BugRunnerState => start("easy", seed);

const nextMode = (mode: ModeId): ModeId =>
  MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length] ?? "easy";

const hit = (pose: Pose, obstacles: readonly Obstacle[]): ObstacleKind | null => {
  const rows = runnerRows(pose);
  const met = obstacles.find(
    (o) => o.x === PLAYER_X && OBSTACLE_ROWS[o.kind].some((row) => rows.includes(row)),
  );
  return met?.kind ?? null;
};

// A jump starts from the ground, ducked or not. A duck starts anywhere: in the air it is a dive
// straight down, and ducked it lasts a full DUCK_STEPS again
const posed = (pose: Pose, id: string): Pose => {
  if (id === "jump") return pose.kind === "jump" ? pose : { kind: "jump", at: 0 };
  if (id === "duck") return pose.kind === "duck" && pose.left === DUCK_STEPS ? pose : DUCK;
  return pose;
};

const onControl = (s: BugRunnerState, id: string): BugRunnerState => {
  // A new game in the next mode, ended or not
  if (id === "mode") return start(nextMode(s.mode), s.rng);
  if (s.crash) return s;
  const pose = posed(s.pose, id);
  // Rising into an error or diving onto a bug hits it at once
  return pose === s.pose ? s : { ...s, pose, crash: hit(pose, s.obstacles) };
};

const nextPose = (pose: Pose): Pose => {
  if (pose.kind === "jump") {
    return pose.at + 1 < JUMP_HEIGHTS.length ? { kind: "jump", at: pose.at + 1 } : RUN;
  }
  if (pose.kind === "duck") return pose.left > 1 ? { kind: "duck", left: pose.left - 1 } : RUN;
  return pose;
};

const shortestGap = (m: Mode, distance: number) =>
  Math.max(m.minGap, m.maxGap - Math.floor(distance / m.gapStep));

// Steps a second at `distance`
export const speedOf = (mode: ModeId, distance: number) => {
  const m = MODES[mode];
  return Math.min(m.topSpeed, m.speed + Math.floor(distance / m.speedStep));
};

// A new obstacle on the right edge, and the steps before the one after it
const spawn = (s: BugRunnerState, distance: number) => {
  const m = MODES[s.mode];
  const [kindRoll, afterKind] = roll(s.rng);
  const [gapRoll, afterGap] = roll(afterKind);
  // Easy rolls no combo: its games stay the same from the same seed
  const [comboRoll, next] = m.comboRate > 0 ? roll(afterGap) : [1, afterGap];
  const kind: ObstacleKind =
    s.combo ?? (distance >= m.errorsFrom && kindRoll < m.errorRate ? "error" : "bug");
  // The second half of a combo starts none of its own
  const isCombo = s.combo === null && comboRoll < m.comboRate;
  return {
    obstacles: [...s.obstacles, { kind, x: COLUMNS - 1 }],
    gap: isCombo ? m.comboGap : shortestGap(m, distance) + Math.floor(gapRoll * m.spread),
    combo: isCombo ? OTHER[kind] : null,
    rng: next,
  };
};

const step = (s: BugRunnerState): BugRunnerState => {
  const distance = s.distance + 1;
  const pose = nextPose(s.pose);
  const moved = s.obstacles.map((o) => ({ ...o, x: o.x - 1 })).filter((o) => o.x >= 0);
  const stepped = { ...s, distance, pose, obstacles: moved, gap: s.gap - 1 };
  const next = stepped.gap <= 0 ? { ...stepped, ...spawn(stepped, distance) } : stepped;
  return { ...next, crash: hit(pose, next.obstacles) };
};

const tick = (s: BugRunnerState): BugRunnerState => {
  if (s.crash) return s;
  const progress = s.progress + speedOf(s.mode, s.distance);
  return progress < TENTHS_PER_STEP
    ? { ...s, progress }
    : { ...step(s), progress: progress - TENTHS_PER_STEP };
};

const runnerCell = (s: BugRunnerState, row: number): Cell | null => {
  const rows = runnerRows(s.pose);
  if (!rows.includes(row)) return null;
  const fg = s.crash ? COLORS.error : COLORS.runner;
  if (row === rows[0]) return { ch: "✳", fg };
  // The legs: they swap at each step on the ground, fold in the air
  const legs = s.pose.kind === "jump" ? "╲╱" : s.distance % 2 ? "╱╲" : "││";
  return { ch: legs, fg };
};

const obstacleCell = (s: BugRunnerState, row: number, col: number): Cell | null => {
  const o = s.obstacles.find((ob) => ob.x === col && OBSTACLE_ROWS[ob.kind].includes(row));
  if (!o) return null;
  return o.kind === "bug" ? { ch: "ж", fg: COLORS.bug } : { ch: "✖", fg: COLORS.error };
};

const cellAt = (s: BugRunnerState, row: number, col: number): Cell =>
  (col === PLAYER_X && runnerCell(s, row)) || obstacleCell(s, row, col) || { ch: "" };

const STATUS_LINE: Record<ObstacleKind, string> = {
  bug: "Hit a bug",
  error: "Hit an error",
};

const columns = [...Array(COLUMNS).keys()];

export const bugRunner: Game<BugRunnerState, CellBoard> = {
  controls: [
    { id: "jump", label: "Jump", hotkey: "f" },
    { id: "duck", label: "Duck", hotkey: "g" },
    { id: "mode", label: "Mode", hotkey: "h" },
  ],
  size: { columns: 38, rows: 17 },
  tickMs: TICK_MS,
  init,
  // `r` plays again in the same mode
  restart: (s, seed) => start(s.mode, seed),
  onControl,
  tick,
  render: drawCells,
  board: (s) => ({
    cell: { width: 2, height: 1 },
    rows: [
      ...[...Array(ROWS).keys()].map((row) => columns.map((col) => cellAt(s, row, col))),
      columns.map(() => ({ ch: "──", fg: COLORS.ground })),
    ],
  }),
  status: (s) => {
    const m = MODES[s.mode];
    const speed = `${speedOf(s.mode, s.distance)} steps/s`;
    return {
      phase: s.crash ? "lost" : "playing",
      score: s.distance * m.multiplier,
      line: `${m.name} ×${m.multiplier} · ${s.crash ? STATUS_LINE[s.crash] : speed}`,
    };
  },
};
