import { CSHARP } from "./csharp";

export type CategoryId = "code" | "language" | "oop" | "patterns";

// One question: four options, `answer` the index of the right one
export type Question = {
  category: CategoryId;
  prompt: string;
  // Lines of code shown under the prompt, if any
  code?: readonly string[];
  options: readonly [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  // Shown once answered, right or wrong: what the question teaches
  explanation: string;
};

export type Topic = { name: string; questions: readonly Question[] };

// The category picker, one key each: `only` absent, every question of the topic
export const CATEGORIES: readonly { name: string; only?: CategoryId }[] = [
  { name: "Mixed" },
  { name: "Read code", only: "code" },
  { name: "Language", only: "language" },
  { name: "OOP", only: "oop" },
  { name: "Design patterns", only: "patterns" },
];

// The topic picker lists them in this order, one key each: at most four
export const TOPICS: readonly Topic[] = [{ name: "C#", questions: CSHARP }];

// The indexes, in `topic`'s questions, of those `category` asks
export const questionsOf = (topic: number, category: number): number[] => {
  const only = CATEGORIES[category]?.only;
  return (TOPICS[topic]?.questions ?? []).flatMap((q, i) =>
    only === undefined || q.category === only ? [i] : [],
  );
};
