---
name: verify-gate
description: Before claiming a task is done, run deterministic verification
  (typecheck, relevant tests, interface checks); if it fails, reflect on the
  root cause and redo, then re-verify. Grounded in OpenCodeReview's
  "deterministic verification → agent reflection → re-verify" loop — the
  programmatic knowledge beats declared knowledge.
blueprint:
  strictOrder: true
  completionCheck: 'Deterministic verification passes before the task is claimed complete'
  steps:
    - description: 'Run deterministic verification for the change: typecheck, relevant unit tests, and interface grep of changed surfaces'
      tool: 'run_shell_command'
    - description: 'If verification fails, reflect on the root cause and fix the implementation'
      tool: 'edit'
      requires: 'Verification failed'
    - description: 'Re-verify after the fix; do not claim completion until verification passes'
      tool: 'run_shell_command'
      requires: 'Fix applied'
constraints:
  - type: ordering
    description: 'Do not claim a task complete until deterministic verification passes'
    ordering:
      before: 'Run deterministic verification'
      after: 'Claiming the task is complete'
  - type: mandatory
    description: 'If verification fails, fix the root cause and re-verify before claiming completion; never claim done on a failing check'
    mandatory:
      tool: 'run_shell_command'
      condition: 'Deterministic verification fails'
---

# Verify Before Claiming Done

Before you claim a task is complete, run deterministic verification. If it
fails, do not hand-wave it away — reflect on the root cause, fix it, and
re-verify.

## Why This Matters

OpenCodeReview's strongest lesson is the verification loop: when deterministic
matching fails, it hands the problem to the agent to regenerate a precise
snippet, then re-runs the deterministic check. It never trusts the agent's
claim — it verifies at the seam. The same principle applies here: a passing
check is proof; a claim is not.

## How To Do It

1. **Verify.** Run typecheck, the relevant tests, and grep the interfaces you
   changed. Get a deterministic pass/fail signal.
2. **Reflect on failure.** If a check fails, read the actual error and find the
   root cause. Do not say "it probably works" or assume the failure is
   unrelated.
3. **Fix and re-verify.** Apply the fix, then re-run the check. Repeat until it
   passes. Only then claim completion.

## Rules

- **A claim is not evidence.** A passing check is. Never claim "done" on a
  check you have not run to green.
- **Reflection is mandatory on failure.** Fix the root cause, not the symptom;
  do not silence a failing check to make it green.
- **Re-verify after every fix.** The last word is the deterministic check, not
  your estimate.
- **Match the house gates.** This complements the Stop truth-guard hook and the
  5-technique feat-dev blueprint: verify-gate is the semantic-layer instruction
  that makes the model self-check before the mechanical gate runs.
