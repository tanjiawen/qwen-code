---
name: tdd-first
description: Test-driven development — write the failing test first, then the
  smallest implementation to make it green, then refactor. Use when building
  features or fixing bugs test-first, or when the AI is producing large
  batches of code before checking anything. Grounded in Kent Beck's TDD and
  the Pragmatic Programmer's "feedback speed is your speed limit".
blueprint:
  strictOrder: true
  completionCheck: 'A failing test exists before implementation, the implementation makes it pass, and refactor keeps the suite green.'
  steps:
    - description: 'Write one failing test that captures the desired behavior'
      tool: 'write_file'
    - description: 'Run the test and confirm it fails for the right reason (red)'
      tool: 'run_shell_command'
      requires: 'Test written'
    - description: 'Write the smallest implementation to make it pass (green)'
      tool: 'edit'
      requires: 'Test confirmed failing'
    - description: 'Refactor while keeping the suite green'
      requires: 'Test passing'
constraints:
  - type: ordering
    description: 'A test must fail before the implementation exists'
    ordering:
      before: 'Write one failing test'
      after: 'Write the smallest implementation'
  - type: mandatory
    description: 'Do not write implementation for a feature until a failing test exists for it'
    mandatory:
      condition: 'implementation would add behavior without a preceding test'
---

# Test-Driven Development (TDD)

Write the test first. Watch it fail for the right reason. Write the smallest
implementation that makes it pass. Refactor. Repeat in small steps.

Based on Kent Beck's _Test-Driven Development_ and the Pragmatic Programmer's
idea that **feedback speed is your speed limit** — the faster you get a signal
that your change is wrong, the safer the change is.

## Why This Matters With AI

An AI's default behavior is to generate a huge batch of code, then check
types at the end. That is "outrunning your headlights" — moving faster than you
can see. TDD forces small steps, so each step gets fast, local feedback instead
of one giant, late, confusing failure.

## The Red-Green-Refactor Loop

### 1. Red — write a failing test

Write one test that captures the exact behavior you want, using the interface
you intend. Run it and confirm it fails **for the right reason** (assertion
fails, not a crash or a missing import).

### 2. Green — smallest implementation

Write the smallest amount of code that makes that test pass. Do not build the
whole feature. Resist the urge to add anything the test does not require.

### 3. Refactor — clean up, keep green

Improve the code you just wrote (names, duplication, structure) while keeping
the suite green. This is where design quality lives — the test is your safety
net for changing code without fear.

## Rules

- **Test first, always.** No test, no implementation for that behavior.
- **One failing test at a time.** Do not batch tests and implementation.
- **Red before green.** If a test passes immediately, it is not testing what
  you think — question it.
- **Smallest step.** Implement only what the current test requires.
- **Keep the suite green during refactor.** Refactor is only safe because the
  tests hold the behavior.

## Concrete Steps

1. Identify the smallest unit of desired behavior.
2. Write the test against the public interface.
3. Run it — confirm it fails.
4. Implement the minimum to pass it.
5. Refactor.
6. Repeat until the feature is complete.

For qwen-code, run tests from the package directory:
`cd packages/core && npx vitest run <file>`.
