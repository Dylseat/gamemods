# Code Quiz

A quiz to sharpen your coding skills. Pick a topic and a category, then answer one question at a time: four options, one right. Each answer shows why, right or wrong. Questions come shuffled, in series of 10, with no end: the game goes on until you run out of lives.

Topics: C#, with 83 questions. Categories: Mixed (every question), Read code, Language, OOP and Design patterns.

A topic is a list of questions in its own file (`csharp.ts`), added to `TOPICS` in `topics.ts`. Each question names its category; the categories are listed in `CATEGORIES`, one key each.

## Play

| Key       | Action                                    |
| :-------- | :---------------------------------------- |
| `1` - `5` | Pick a topic, then a category             |
| `1` - `4` | Answer the question                       |
| `n`       | Next question                             |

The score is your count of right answers. You start with 3 lives; each wrong answer costs one, and the game ends at the third. `r` goes back to the topic picker. The category picker shows your best per category: `r` keeps it, and it lasts while the game stays loaded. The best score saved between sessions is the best of all categories.

## Manual checks

Part of the manual protocol of [CONTRIBUTING.md](../../../CONTRIBUTING.md#manual-protocol): pick C# with `1` and a category with `1` - `5`, answer right and wrong with `1` - `4`, go on with `n`, lose the 3 lives, then `r` and `1`: the category picker shows the best.
