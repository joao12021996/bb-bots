# Notes for Claude

## Tests

The full jest suite is very slow (over 10 minutes), so don't run all of it after every change.

- Run only the test file(s) that cover the code you changed, e.g.
  `CI=true npx react-scripts test --watchAll=false src/playerMode/comps`
  Narrow further with `-t "<test name>"` when you can.
- For small or cosmetic changes (copy, styling), skip tests; `npx tsc --noEmit` is enough.
- Run the full suite only when asked, or when the change touches shared logic that every test depends on.
- Always say which tests you ran and which you skipped.

## Git

Commit and push directly on `master`; no feature branches.
