# Notes for Claude

## Tests

The full jest suite takes about 3 minutes (playerMode.test.tsx ~170s, netSession.test.tsx ~100s), so don't run all of it after every change.

- Run only the test file(s) that cover the code you changed, e.g.
  `CI=true npx react-scripts test --watchAll=false src/playerMode/comps`
  Narrow further with `-t "<test name>"` when you can.
- For small or cosmetic changes (copy, styling), skip tests; `npx tsc --noEmit` is enough.
- Run the full suite for big changes: new features, refactors, changes spanning several areas (e.g. game
  logic plus online play), or edits to shared core code (the controller, model, save format). Also run it when asked.
- Always say which tests you ran and which you skipped.

## Git

Commit and push directly on `master`; no feature branches.
