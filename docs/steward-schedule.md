# Running the steward on a schedule

`npm run steward` answers "is anything wrong?" against the live machine, and
desk panel 09 answers it without a terminal. Neither runs on its own — and a
watchdog nobody runs is a document.

## Why this is a file instead of a workflow

The stored `gh` OAuth token has no `workflow` scope, so this session could not
push `.github/workflows/steward.yml`:

```
refusing to allow an OAuth App to create or update workflow
`.github/workflows/steward.yml` without `workflow` scope
```

Granting that scope means re-running the device flow in a browser, which is an
owner action. So the workflow is written out here, verified, ready to paste.

## Two owner actions, then it runs itself

1. **Settings → Secrets and variables → Actions → Secrets**: add
   `DATABASE_URL` (and `DATABASE_SSL_CA` if the deploy uses one).
2. **Same page → Variables**: add `STEWARD_ENABLED` = `true`.

Then commit the file below as `.github/workflows/steward.yml`.

The steward only ever reads: no writes, no migrations, no deletions, no
external calls.

## Why the job is guarded rather than always-on

Without a database every check returns `unmeasurable` and the run exits 2.
That is the right answer for the CLI — a dark board is not a green one — and
the wrong alarm for a schedule, because a job that fails every morning for a
reason nobody can fix teaches everyone to ignore it. Guarded, the job SKIPS,
and GitHub renders skipped as skipped: it never reports a pass it did not earn.

Exit codes: `0` nothing needs a person · `1` a blocker · `2` warn or
unmeasurable. Anything but 0 fails the run.

```yaml
name: Steward

# The steward answers "is anything wrong?" against the LIVE machine, so unlike
# CI it needs a database to read. It runs every morning and on demand.
#
# WHY THE JOB IS GUARDED RATHER THAN ALWAYS-ON. Without DATABASE_URL every
# check returns `unmeasurable` and the run exits 2 — correct behaviour for the
# CLI (a dark board is not a green one) and useless behaviour for a schedule,
# because a job that fails every morning for a reason nobody can fix teaches
# everyone to ignore it. So the job is SKIPPED when the secret is absent, and
# GitHub shows skipped as skipped. It never reports a pass it did not earn.
#
# TO TURN IT ON: add DATABASE_URL to the repository secrets (Settings →
# Secrets and variables → Actions). The steward only ever reads.
#
# Exit codes, from scripts/steward.mjs: 0 nothing needs a person · 1 a blocker
# · 2 something is warn or could not be measured. Anything but 0 fails the run.

on:
  schedule:
    - cron: "23 12 * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  watch:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    if: ${{ vars.STEWARD_ENABLED == 'true' }}
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: read the board
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          DATABASE_SSL_CA: ${{ secrets.DATABASE_SSL_CA }}
        run: npm run steward
```
