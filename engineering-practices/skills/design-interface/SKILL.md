---
name: design-interface
description: Design the module boundaries and interfaces, delegate the
  interface internals to the model, and write tests at the interface to verify
  the model's output. Use when building a feature that adds a new module,
  public API, or seam. This is Matt Pocock's 5th technique — the human owns the
  strategy (interfaces), the AI owns the tactics (implementations).
blueprint:
  strictOrder: true
  completionCheck: 'Module boundaries and interfaces are defined, the model has filled the internals, and tests at the interface verify the output.'
  steps:
    - description: 'Design module boundaries and interfaces; state what each interface hides. Do not write the implementation.'
      requires: 'Feature scope is understood'
    - description: 'Delegate the interface internals to the model to implement'
      tool: 'edit'
      requires: 'Interfaces are defined'
    - description: 'Write tests at the interface to verify the model output'
      tool: 'write_file'
      requires: 'Implementation fills the interfaces'
constraints:
  - type: ordering
    description: 'Define the interface boundaries before filling in the implementation'
    ordering:
      before: 'Design module boundaries and interfaces'
      after: 'Delegate the interface internals to the model'
---

# Design Interface, Delegate Implementation

The final form of the five techniques: the human works at the strategic layer,
the AI at the tactical layer.

- **You** design the module boundaries and interfaces (this needs software
  fundamentals).
- **The model** fills the interface internals (constrained by the interfaces).
- **You** write tests at the interface to verify the model's output.

Matt Pocock's frame: "I just say, AI, handle the inside of the big block. I
just test it from the outside. This really saves my brain." The human is the
strategist; the AI is the tactical line worker.

## Why This Matters With AI

When you hand a model a well-defined interface, it no longer has to guess the
design. It implements against a contract you own, and you verify at the seam.
This is the reliable division of labor: the model's output is bounded by your
interface and checked by your interface tests, so its work is verifiable
instead of trusted.

## How To Do It

1. **Design the interface first.** From the callers' perspective, what is the
   simplest interface that fully serves them? State what it hides. Do not write
   the implementation yet.
2. **Delegate the internals.** Hand the interface to the model and let it fill
   the implementation, constrained by the interface you defined.
3. **Test at the interface.** Write tests against the public interface to
   verify the model's output. The interface is the contract; the tests prove
   the contract holds.

## Rules

- **The interface is the boundary.** You own it; the model works inside it.
- **Test at the seam, not the internals.** Verify behavior through the public
  interface; do not reach into the implementation.
- **Keep the interface small.** A deep interface (little surface, real work
  behind it) is the goal — see `deep-module`.
- **Do not implement what you delegate.** If you are filling the internals
  yourself, you are not delegating.
