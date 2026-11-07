import type { RenderElement } from "claude-code";
import type { BoardElements, Draw, Game, Phase } from "../game";
import { roll } from "../random";
import { CATEGORIES, type Question, questionsOf, TOPICS } from "./topics";

export type QuizState = {
  // Index in TOPICS; null on the topic picker
  topic: number | null;
  // Index in CATEGORIES; null on the category picker
  category: number | null;
  // The category's question indexes in play order, shuffled again once all are asked
  order: readonly number[];
  // Position of the current question in `order`
  at: number;
  // Questions asked this game, the current one included: the series and its count
  asked: number;
  // The original option shown on each key: options[k] is drawn on key k + 1
  options: readonly number[];
  // The key picked for the current question, 0 to 3; null until answered
  picked: number | null;
  // Right answers this game; the score
  correct: number;
  lives: number;
  rng: number;
  // Best score per topic and category, kept across restarts while the game stays loaded
  records: readonly (readonly number[])[];
};

export type Tone = "title" | "code" | "option" | "right" | "wrong" | "dim";
export type Line = { text: string; tone?: Tone };
export type QuizBoard = { lines: readonly Line[] };

export const LIVES = 3;
export const SERIES = 10;
// The answer keys, and the keys a picker reads: one per category
const KEYS = 4;
const PICK_KEYS = CATEGORIES.length;

// Inside the frame; `size` adds the frame and the pane chrome around it
const BOARD = { columns: 36, rows: 12 };

const COLORS: Record<Tone, string | undefined> = {
  title: undefined,
  code: "#d7af5f",
  option: undefined,
  right: "#87d787",
  wrong: "#ff8787",
  dim: undefined,
};

// Fisher-Yates on the seeded roll
const shuffle = (items: readonly number[], rng: number): [number[], number] => {
  const out = [...items];
  let next = rng;
  for (let i = out.length - 1; i > 0; i--) {
    const [r, after] = roll(next);
    next = after;
    const j = Math.floor(r * (i + 1));
    [out[i], out[j]] = [out[j] as number, out[i] as number];
  }
  return [out, next];
};

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

const questionOf = (s: QuizState): Question | undefined =>
  s.topic === null || s.category === null
    ? undefined
    : TOPICS[s.topic]?.questions[s.order[s.at] ?? 0];

const isRight = (s: QuizState, question: Question): boolean =>
  s.picked !== null && s.options[s.picked] === question.answer;

const phaseOf = (s: QuizState): Phase => (s.lives === 0 ? "lost" : "playing");

const init = (seed: number): QuizState => ({
  topic: null,
  category: null,
  order: [],
  at: 0,
  asked: 0,
  options: [],
  picked: null,
  correct: 0,
  lives: LIVES,
  rng: seed | 0,
  records: TOPICS.map(() => CATEGORIES.map(() => 0)),
});

const pickTopic = (s: QuizState, topic: number): QuizState =>
  topic < TOPICS.length ? { ...s, topic } : s;

const pickCategory = (s: QuizState, topic: number, category: number): QuizState => {
  const questions = category < CATEGORIES.length ? questionsOf(topic, category) : [];
  if (questions.length === 0) return s;
  const [order, afterOrder] = shuffle(questions, s.rng);
  const [options, rng] = shuffle(range(KEYS), afterOrder);
  return { ...s, category, order, at: 0, asked: 1, options, picked: null, rng };
};

const answer = (s: QuizState, key: number): QuizState => {
  const question = questionOf(s);
  if (!question || s.picked !== null || key >= KEYS) return s;
  const answered = { ...s, picked: key };
  if (!isRight(answered, question)) return { ...answered, lives: s.lives - 1 };
  const correct = s.correct + 1;
  const records = s.records.map((bests, t) =>
    bests.map((best, c) => (t === s.topic && c === s.category ? Math.max(best, correct) : best)),
  );
  return { ...answered, correct, records };
};

// The next question; past the last one, a new order that does not start on the one just asked
const next = (s: QuizState): QuizState => {
  if (s.picked === null || phaseOf(s) !== "playing") return s;
  let { order, at, rng } = s;
  at++;
  if (at >= order.length) {
    const last = order[order.length - 1];
    [order, rng] = shuffle(order, rng);
    if (order.length > 1 && order[0] === last) order = [...order.slice(1), last as number];
    at = 0;
  }
  const [options, afterOptions] = shuffle(range(KEYS), rng);
  return { ...s, order, at, asked: s.asked + 1, options, picked: null, rng: afterOptions };
};

const hearts = (lives: number): string => "♥".repeat(lives) + "♡".repeat(LIVES - lives);

const topicLines = (): Line[] => [
  { text: "Pick a topic", tone: "title" },
  { text: "" },
  ...TOPICS.map((topic, i) => ({ text: `${i + 1}  ${topic.name}`, tone: "option" as const })),
  { text: "" },
  { text: `${LIVES} lives · ${SERIES} per series · no end`, tone: "dim" },
];

const categoryLines = (s: QuizState, topic: number): Line[] => [
  { text: `${TOPICS[topic]?.name}: pick a category`, tone: "title" },
  { text: "" },
  ...CATEGORIES.map((category, i) => ({
    text: `${i + 1}  ${category.name} · best ${s.records[topic]?.[i] ?? 0}`,
    tone: "option" as const,
  })),
  { text: "" },
  { text: "Each category keeps its own best.", tone: "dim" },
];

const optionLine = (s: QuizState, question: Question, key: number): Line => {
  const option = s.options[key] ?? 0;
  const text = question.options[option] ?? "";
  if (s.picked === null) return { text: `${key + 1}  ${text}`, tone: "option" };
  if (option === question.answer) return { text: `✓  ${text}`, tone: "right" };
  if (key === s.picked) return { text: `✗  ${text}`, tone: "wrong" };
  return { text: `   ${text}`, tone: "dim" };
};

const feedbackLines = (s: QuizState, question: Question): Line[] => {
  if (s.picked === null) return [];
  const verdict: Line = isRight(s, question)
    ? { text: "Right!", tone: "right" }
    : { text: "Wrong: the right answer is marked ✓.", tone: "wrong" };
  return [{ text: "" }, verdict, { text: question.explanation }];
};

const questionLines = (s: QuizState, question: Question): Line[] => [
  { text: question.prompt, tone: "title" },
  ...(question.code
    ? [{ text: "" }, ...question.code.map((text) => ({ text, tone: "code" as const }))]
    : []),
  { text: "" },
  ...range(KEYS).map((key) => optionLine(s, question, key)),
  ...feedbackLines(s, question),
];

const seriesLine = (s: QuizState): string => {
  const series = Math.floor((s.asked - 1) / SERIES) + 1;
  const count = ((s.asked - 1) % SERIES) + 1;
  return `Series ${series} · Question ${count}/${SERIES} · ${hearts(s.lives)}`;
};

export function drawQuiz(
  { Box, Text }: BoardElements,
  board: QuizBoard,
  draw: Draw<never>,
): RenderElement {
  return Box({
    flexDirection: "column",
    width: BOARD.columns,
    minHeight: BOARD.rows,
    children: board.lines.map((line) => {
      const color = COLORS[line.tone ?? "option"];
      return Text({
        ...(line.tone === "title" && { bold: true }),
        ...((draw.dimmed || line.tone === "dim") && { dimColor: true }),
        ...(color && { color }),
        // An empty Text collapses to no row
        children: [line.text || " "],
      });
    }),
  });
}

export const codeQuiz: Game<QuizState, QuizBoard> = {
  controls: [
    // Four answers; the fifth key serves the category picker only
    ...range(PICK_KEYS).map((key) => ({
      id: `option-${key + 1}`,
      label: `Option ${key + 1}`,
      hotkey: `${key + 1}`,
    })),
    { id: "next", label: "Next", hotkey: "n" },
  ],
  size: { columns: BOARD.columns + 2, rows: BOARD.rows + 11 },
  init,
  // A new game, back on the topic picker, keeps the records
  restart: (s, seed) => ({ ...init(seed), records: s.records }),
  onControl: (s, id) => {
    if (id === "next") return next(s);
    const key = Number(id.replace("option-", "")) - 1;
    if (!(key >= 0 && key < PICK_KEYS)) return s;
    if (s.topic === null) return pickTopic(s, key);
    if (s.category === null) return pickCategory(s, s.topic, key);
    return answer(s, key);
  },
  board: (s) => {
    const question = questionOf(s);
    if (question) return { lines: questionLines(s, question) };
    return { lines: s.topic === null ? topicLines() : categoryLines(s, s.topic) };
  },
  render: drawQuiz,
  status: (s) => {
    const phase = phaseOf(s);
    if (s.topic === null) return { phase, score: s.correct, line: "Pick a topic with its number" };
    if (s.category === null)
      return { phase, score: s.correct, line: "Pick a category with its number" };
    if (phase === "lost")
      return { phase, score: s.correct, line: "Out of lives · R to play again" };
    const line = s.picked === null ? seriesLine(s) : "N for the next question";
    return { phase, score: s.correct, line };
  },
};
