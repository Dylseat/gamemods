# Bug Runner

An endless runner. A little star runs through the terminal: jump over the bugs on the ground, duck under the errors floating at head height. There is no finish line: run as far as you can.

## Play

| Key | Action                                     |
| :-- | :----------------------------------------- |
| `f` | Jump                                       |
| `g` | Duck for 5 steps; in the air, dive down    |
| `h` | Next mode, in a new game                   |

The world moves step by step, and speeds up the farther you run; the status line shows the speed in steps a second. A jump lasts 5 steps and clears a bug, but an error is too low to jump over: duck under it. You jump from the ground only, ducked or not. `g` in the air dives straight down into a duck, and `g` while ducked holds the duck 5 more steps: chain a jump and a duck to clear a bug and an error close together. Rising into an error or diving onto a bug hits it.

Hitting an obstacle ends the game. `r` plays again in the same mode.

## Modes

`h` goes from Easy to Medium to Hard, then back to Easy. The mode shows on the status line.

| Mode   | Speed, steps a second       | Obstacles                                                         | Points per step |
| :----- | :-------------------------- | :---------------------------------------------------------------- | :-------------- |
| Easy   | 4, +1 every 120 steps, to 6 | Bugs only for the first 40 steps, then errors too                 | 1               |
| Medium | 5, +1 every 100 steps, to 7 | Closer together, errors from the start, some bug-and-error combos | 2               |
| Hard   | 6, +1 every 80 steps, to 8  | Closer still, and more combos, 2 steps apart: jump, then dive     | 3               |

In every mode the obstacles also come closer together the farther you run. The speed stops at 8 steps a second: faster, Desktop would redraw often enough to drop keys.

The score is the distance run times the mode's points per step. Every mode shares one best score, so a harder mode is the way to beat it.

## Manual checks

Part of the manual protocol of [CONTRIBUTING.md](../../../CONTRIBUTING.md#manual-protocol):

- The runner's legs move, the obstacles scroll from right to left, the score goes up at each step.
- `f` just before a bug clears it; running into a bug ends the game with "Hit a bug".
- `g` just before an error clears it; jumping or running into an error ends the game with "Hit an error".
- `g` in the air dives down: a bug and an error 2 steps apart are cleared with `f` then `g`.
- `h` cycles Easy, Medium, Hard, each in a new game; `r` keeps the mode; the score goes up by 1, 2 and 3.
- Run past 40 steps in Easy to see the first errors, keys chained fast with no key lost.
- Run in Hard past 160 steps: the status line reaches 8 steps/s, the world visibly faster, and no key is lost on Desktop.
- `p` mid-jump, then `p` again: the jump goes on where it stopped.
