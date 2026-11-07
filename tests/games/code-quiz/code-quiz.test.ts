import { expect, test } from "claude-code/testing";
import { codeQuiz, LIVES, type QuizState, SERIES } from "../../../src/games/code-quiz/code-quiz";
import { CSHARP } from "../../../src/games/code-quiz/csharp";
import { CATEGORIES, questionsOf, TOPICS } from "../../../src/games/code-quiz/topics";
import { SEED } from "../../fixtures/engine";

const press = (s: QuizState, ...ids: string[]) => ids.reduce(codeQuiz.onControl, s);

// C#, then a category: 1 is Mixed
const csharp = (category = "option-1") => press(codeQuiz.init(SEED), "option-1", category);

const question = (s: QuizState) => CSHARP[s.order[s.at] ?? -1];

// The key that shows the right option, and one that shows a wrong one
const rightKey = (s: QuizState) => `option-${s.options.indexOf(question(s)?.answer ?? -1) + 1}`;
const wrongKey = (s: QuizState) =>
  `option-${s.options.findIndex((o) => o !== question(s)?.answer) + 1}`;

const texts = (s: QuizState) => codeQuiz.board(s).lines.map((l) => l.text);

test("a game starts on the topic picker, with no question", () => {
  const s = codeQuiz.init(SEED);
  expect(s.topic).toBe(null);
  expect(codeQuiz.status(s)).toEqual({
    phase: "playing",
    score: 0,
    line: "Pick a topic with its number",
  });
  expect(texts(s)).toContain("1  C#");
});

test("on the topic picker, Next and a key with no topic change nothing", () => {
  const s = codeQuiz.init(SEED);
  expect(press(s, "next")).toBe(s);
  expect(press(s, `option-${TOPICS.length + 1}`)).toBe(s);
});

test("picking C# shows its categories, each with its best", () => {
  const s = press(codeQuiz.init(SEED), "option-1");
  expect(s.topic).toBe(0);
  expect(s.category).toBe(null);
  expect(codeQuiz.status(s).line).toBe("Pick a category with its number");
  expect(texts(s)).toContain("1  Mixed · best 0");
  expect(texts(s)).toContain("5  Design patterns · best 0");
  expect(press(s, "next")).toBe(s);
});

test("every C# category has enough questions for a series", () => {
  for (const [i] of CATEGORIES.entries()) {
    expect(questionsOf(0, i).length).toBeGreaterThanOrEqual(SERIES);
  }
  expect(questionsOf(0, 0).length).toBe(CSHARP.length);
});

test("Mixed asks every question once, in a shuffled order", () => {
  const s = csharp();
  expect(s.category).toBe(0);
  expect([...s.order].sort((a, b) => a - b)).toEqual(CSHARP.map((_, i) => i));
  expect(s.order).not.toEqual(CSHARP.map((_, i) => i));
  expect([...s.options].sort()).toEqual([0, 1, 2, 3]);
  expect(codeQuiz.status(s).line).toBe("Series 1 · Question 1/10 · ♥♥♥");
});

test("a category asks only its own questions", () => {
  for (const [i, category] of CATEGORIES.entries()) {
    if (!category.only) continue;
    const s = csharp(`option-${i + 1}`);
    expect(s.order.length).toBeGreaterThan(0);
    for (const at of s.order) expect(CSHARP[at]?.category).toBe(category.only);
  }
});

test("the same seed plays the same questions", () => {
  expect(csharp()).toEqual(csharp());
});

test("a right answer scores and sets the category's best only", () => {
  const s = csharp("option-4");
  const after = press(s, rightKey(s));
  expect(after.correct).toBe(1);
  expect(after.lives).toBe(LIVES);
  expect(after.records).toEqual([[0, 0, 0, 1, 0]]);
  expect(codeQuiz.status(after).score).toBe(1);
  expect(codeQuiz.status(after).line).toBe("N for the next question");
  expect(texts(after)).toContain("Right!");
});

test("a wrong answer costs a life and shows the explanation", () => {
  const s = csharp();
  const after = press(s, wrongKey(s));
  expect(after.correct).toBe(0);
  expect(after.lives).toBe(LIVES - 1);
  expect(texts(after)).toContain(question(s)?.explanation);
  expect(codeQuiz.board(after).lines.some((l) => l.tone === "right")).toBe(true);
  expect(codeQuiz.board(after).lines.some((l) => l.tone === "wrong")).toBe(true);
});

test("a question takes one answer among four, and Next waits for it", () => {
  const s = csharp();
  expect(press(s, "next")).toBe(s);
  expect(press(s, "option-5")).toBe(s);
  const answered = press(s, rightKey(s));
  for (const key of ["option-1", "option-2", "option-3", "option-4", "option-5"]) {
    expect(press(answered, key)).toBe(answered);
  }
});

test("Next asks the next question", () => {
  const s = csharp();
  const after = press(s, rightKey(s), "next");
  expect(after.at).toBe(1);
  expect(after.asked).toBe(2);
  expect(after.picked).toBe(null);
  expect(codeQuiz.status(after).line).toBe("Series 1 · Question 2/10 · ♥♥♥");
});

test("after 10 questions comes series 2", () => {
  let s = csharp();
  for (let i = 0; i < SERIES; i++) s = press(s, rightKey(s), "next");
  expect(codeQuiz.status(s).line).toBe("Series 2 · Question 1/10 · ♥♥♥");
});

test("once every question is asked, a new order starts on another question", () => {
  let s = csharp();
  for (let i = 0; i < CSHARP.length - 1; i++) s = press(s, rightKey(s), "next");
  const last = s.order[s.at];
  s = press(s, rightKey(s), "next");
  expect(s.at).toBe(0);
  expect(s.order[0]).not.toBe(last);
  expect(s.correct).toBe(CSHARP.length);
});

test("the third wrong answer ends the game", () => {
  let s = csharp();
  for (let i = 0; i < LIVES - 1; i++) s = press(s, wrongKey(s), "next");
  s = press(s, rightKey(s), "next");
  s = press(s, wrongKey(s));
  expect(codeQuiz.status(s)).toEqual({
    phase: "lost",
    score: 1,
    line: "Out of lives · R to play again",
  });
  expect(press(s, "next")).toBe(s);
});

test("a restart goes back to the topic picker and keeps the bests", () => {
  const s = csharp("option-2");
  const scored = press(s, rightKey(s), "next");
  const again = codeQuiz.restart?.(scored, SEED);
  expect(again).toEqual({ ...codeQuiz.init(SEED), records: [[0, 1, 0, 0, 0]] });
  expect(again && texts(press(again, "option-1"))).toContain("2  Read code · best 1");
});

for (const topic of TOPICS) {
  test(`every ${topic.name} question has a prompt, four distinct options and an explanation`, () => {
    for (const q of topic.questions) {
      expect(q.prompt.trim()).not.toBe("");
      expect(q.explanation.trim()).not.toBe("");
      expect(new Set(q.options).size).toBe(4);
      for (const option of q.options) expect(option.trim()).not.toBe("");
    }
  });
}
