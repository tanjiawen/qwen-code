---
name: bugfix
description: Fix a bug from a GitHub issue, following the reproduce-first
  workflow. Use when the user asks to fix a bug, investigate a GitHub issue, or
  debug a user-reported problem. Takes a GitHub issue URL or number as input.
blueprint:
  strictOrder: true
  completionCheck: 'All tests pass, verification returns VERIFIED_FIXED, and self-audit has two consecutive clean passes.'
  steps:
    - description: 'Read the GitHub issue and create the artifact file'
      tool: 'run_shell_command'
    - description: 'Grill-me: confirm the expected behavior and the definition of done for the fix'
      tool: 'agent'
      requires: 'Issue artifact file exists'
    - description: 'Read GLOSSARY.md if it exists and use canonical terms'
      tool: 'read_file'
      requires: 'Expected behavior confirmed'
    - description: 'Write a failing test that reproduces the bug (tdd-first, red)'
      tool: 'write_file'
      requires: 'Glossary terms confirmed'
    - description: 'Reproduce the bug via test-engineer agent'
      tool: 'agent'
      requires: 'Failing reproduction test written'
    - description: 'Fix the bug to make the failing test pass (green)'
      tool: 'edit'
      requires: 'Reproduction status is REPRODUCED'
    - description: 'Verify the fix via test-engineer agent'
      tool: 'agent'
      requires: 'Fix has been applied and build succeeds'
    - description: 'Run unit tests for modified packages'
      tool: 'run_shell_command'
      requires: 'Verification returns VERIFIED_FIXED'
    - description: 'Self-audit and code review'
      requires: 'All tests pass'
constraints:
  - type: ordering
    description: 'Reproduction must complete before any source code edit'
    ordering:
      before: 'Reproduce the bug via test-engineer agent'
      after: 'Fix the bug based on reproduction report'
  - type: mandatory
    description: 'Before changing a function signature, export name, or public interface, grep all call sites and imports first'
    mandatory:
      tool: 'grep_search'
      condition: 'edit targets a function signature, export, or public interface'
  - type: mandatory
    description: 'After multi-file edits, run typecheck to catch missed references'
    mandatory:
      tool: 'run_shell_command'
      condition: 'edit touches more than one file'
  - type: ordering
    description: 'Verification must pass before self-audit'
    ordering:
      before: 'Verify the fix via test-engineer agent'
      after: 'Self-audit and code review'
  - type: ordering
    description: 'A failing test that reproduces the bug must exist before the fix (tdd-first)'
    ordering:
      before: 'Write the failing reproduction test'
      after: 'Fix the bug based on reproduction report'
  - type: mandatory
    description: 'Before fixing, read GLOSSARY.md if it exists and use canonical terms'
    mandatory:
      tool: 'read_file'
      condition: 'GLOSSARY.md exists at the project root'
---

# Bugfix Workflow

Follow this workflow for GitHub issue bugfixes. Do not skip reproduction; fixing
without first reproducing the bug tends to produce incomplete fixes and
regressions.

## Input

A GitHub issue URL or number. Slash-command arguments are appended to this skill
body by Qwen Code.

## Artifact Path

Use `.qwen/issues/` in this repo. In the steps below, `<issue-file>` means the
selected issue markdown file.

## Step 1: Read The Issue

Create the artifact directory if needed, then pipe the issue directly into a
markdown file using `gh`:

```bash
mkdir -p .qwen/issues
gh issue view <number> \
  --json number,title,body \
  -t '# Issue #{{.number}}: {{.title}}

{{.body}}

---

## Reproduction report

_Pending - to be filled by the test engineer._

## Verification report

_Pending - to be filled by the test engineer._
' > .qwen/issues/issue-<number>.md
```

## Step 2: Reproduce

Spawn the `test-engineer` agent and point it at `<issue-file>`. State only the
goal: reproduce the bug. Keep the prompt minimal; the test engineer owns the
reproduction strategy.

Wait for the test engineer to finish. Then read `<issue-file>` to get the
reproduction report. If the status is `NOT_REPRODUCED`, report that and stop.

## Step 3: Fix

Read the relevant code and make the fix. Use the reproduction report for
context; it should contain observed behavior, expected behavior, and useful code
paths.

### Multi-file edit safety (MANDATORY)

Before changing a function signature, export name, or public interface:

1. Use `grep_search` to find all call sites and imports of the symbol being
   changed.
2. List every file that references it.
3. Include all affected files in the edit plan before making any changes.
4. After editing, run the project's typecheck (`npm run typecheck` or
   equivalent) to catch missed references.

If the bug is complex enough that the first attempt does not work, use the
`structured-debugging` skill and work through hypotheses systematically.

## Step 4: Verify

Build and bundle your changes:

```bash
npm run build && npm run bundle
```

Spawn the `test-engineer` agent again, pointing it at the same issue file. State
the goal: verify the fix using `node dist/cli.js`.

If the verification status is `STILL_BROKEN`, read the updated issue file, go
back to Step 3, and iterate. Do not proceed until verification returns
`VERIFIED_FIXED`.

## Step 5: Tests

Run unit tests for any packages you modified. If the test engineer wrote a
failing test during reproduction, make sure it passes after the fix. Otherwise,
add focused regression coverage for the failure scenario.

## Step 6: Self-Audit and Code Review

First self-audit the full diff per the self-audit step in AGENTS.md's General
workflow (open-ended passes plus presume-wrong verification, until two
consecutive clean passes; one clean pass suffices for a trivial fix). If the
audit changes source, re-run Step 4 before resuming it. Skip the review below
only for a plain one-line or trivial config fix. For anything else, run
`/review` with a review task listing all changed files. Triage each comment
with a verdict:

- **Valid**: real bug or meaningful improvement. Fix it.
- **False positive**: reviewer missed context. Skip it.
- **Overthinking**: technically plausible but not worth the complexity. Skip
  it.

After fixing valid issues, re-run unit tests and a quick verification sanity
check.

## Iteration Rules

- If Step 4 fails, go back to Step 3, then re-run Step 4.
- If Step 6 finds valid issues, fix them, re-run Step 4 as a sanity check,
  and re-run the self-audit.
- Do not loop more than 3 times between Steps 3-6 without asking the user.
