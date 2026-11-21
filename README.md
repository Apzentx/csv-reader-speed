# CSV Reader Speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Apzentx/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Apzentx/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Built for the [make.fun "Read broken CSV files faster" bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121) — a faster drop-in for csv-reader 1.0.0 that returns exactly the same `{columns, rows, errors}` for every input, broken rows included.

## How it works

The reference reader walks the text one character at a time and builds every
field up a character at a time. This reader does the same reading, but jumps
from delimiter to delimiter with native scans (`RegExp` exec / `indexOf`) and
copies whole spans with `slice()`: a short unquoted field costs one native
scan and one slice instead of a loop over every character, and a single-line
quoted field costs one scan for its closing quote. All of csv-reader's
broken-row policy is preserved exactly — BOM, stray CRs, doubled quotes,
unterminated quotes re-read as unquoted, quote junk, short/long rows, and the
error records with their line and row.

## Files

- `solve.js` — the reader: `run(input)` returns csv-reader 1.0.0's answer.
- `main.ts` — the house driver: reads `/input/cases.json`, answers each case
  with `run`, writes `/output/answers.json`.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

No dependencies, no network, deterministic.

## License

MIT — see [LICENSE](LICENSE).
