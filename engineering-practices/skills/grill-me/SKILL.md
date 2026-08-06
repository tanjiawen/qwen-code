---
name: grill-me
description: A relentless interview to sharpen a plan or design before anyone
  writes code. Use when the user is about to start non-trivial work, has a
  vague idea, or wants to nail down what "done" means before the model acts.
  Grounded in Frederick Brooks' "Design Concept" (The Design of Design).
blueprint:
  strictOrder: true
  completionCheck: 'Shared design concept recorded and user confirms we can start.'
  steps:
    - description: 'Identify the decision tree of the plan'
      requires: 'User states the plan or goal'
    - description: 'Interview the user branch by branch, one decision at a time'
      tool: 'agent'
      requires: 'Decision tree identified'
    - description: 'Resolve dependencies between decisions'
      requires: 'Interview covers all branches'
    - description: 'Record the shared design concept as a markdown file'
      tool: 'write_file'
      requires: 'User confirms shared understanding'
constraints:
  - type: ordering
    description: 'Do NOT write code or a plan doc until the user confirms the shared design concept'
    ordering:
      before: 'Record the shared design concept'
      after: 'Start implementation'
  - type: mandatory
    description: 'Ask questions, not produce artifacts — the goal is shared understanding, not a plan asset'
    mandatory:
      tool: 'ask_user_question'
      condition: 'the user has not yet confirmed the design concept'
---

# Grill Me

Grill the user relentlessly about every aspect of a plan until you reach a
shared understanding. This is the opposite of Plan Mode's "produce a plan asset
and start". It deliberately slows down to avoid building the wrong thing.

Based on Frederick Brooks' **Design Concept**: in multi-person design there is an
invisible, shared understanding floating between the participants. It cannot be
written down, but once it is lost the whole design falls apart. The goal of this
skill is to make that shared understanding explicit _before_ any code exists.

## When To Use

- The user is about to start non-trivial work (feature, refactor, architecture).
- The user gives a one-line idea that could mean many things.
- The user says things like "we should probably..." or "let's do X".
- You are unsure what "done" actually means.

## How To Interview

Do NOT write a plan document first. Interview the user with questions, walking
down each branch of the design tree and resolving dependencies between decisions
one by one.

- Start broad: "What is the intended outcome, and what would prove it worked?"
- Walk each branch of the design: scope, boundaries, exclusions, risks,
  acceptance criteria, rollback.
- Resolve dependencies: "If we decide A, does that force B?"
- Ask until the user can answer "what does done look like" without hesitation.

## Input: The Design Tree

Cover at least these branches (scale to the size of the task):

| Branch     | Sample questions                                             |
| ---------- | ------------------------------------------------------------ |
| Outcome    | What is the observable result? How would we prove it?        |
| Scope      | What is explicitly included? Excluded? What is a non-goal?   |
| Boundary   | What subsystems/files are touched? What effects are visible? |
| Risk       | What could fail? What is the blast radius?                   |
| Acceptance | What exact check must pass for "done"?                       |
| Rollback   | If it goes wrong, how do we undo it?                         |

## Output: Shared Design Concept

Once the user confirms shared understanding, record it as a concise markdown
file so the conversation has a recoverable anchor:

`docs/design/<topic>.design-concept.md`

Include: the intended outcome, the confirmed scope boundary, the acceptance
criteria, and the open questions that were resolved. Keep it short — it is a
shared memory aid, not a spec.

## Rules

- **Ask, don't write.** The deliverable of this skill is shared understanding,
  not a plan document.
- **One decision at a time.** Resolve each branch before moving to the next.
- **Stop when the user is confident.** Do not manufacture questions to pad the
  count; stop once the design concept is clear.
- **Never start coding** until the user has explicitly confirmed the shared
  design concept.
