---
name: deep-module
description: Design deep modules — lots of functionality behind a simple
  interface — and refactor shallow modules into them. Use when the codebase is
  a sea of small scattered functions the AI cannot navigate, when a module's
  interface is complex for the value it provides, or when designing a new
  seam. Grounded in John Ousterhout's "A Philosophy of Software Design".
blueprint:
  strictOrder: true
  completionCheck: 'Shallow modules identified and at least one deep-module refactor logged with its simplified interface.'
  steps:
    - description: 'Identify shallow modules (little functionality, complex interface)'
      tool: 'agent'
    - description: 'Design the deep module: what interface hides what implementation'
      requires: 'Shallow modules identified'
    - description: 'Refactor or document the deep-module design'
      tool: 'edit'
      requires: 'Deep-module design agreed'
constraints:
  - type: mandatory
    description: 'Before adding a new module, state its interface surface and what implementation it hides'
    mandatory:
      condition: 'new module or public API is being introduced'
---

# Deep Modules

A **deep module** hides a lot of complexity behind a simple interface. A
**shallow module** exposes a complex interface for very little functionality.

Based on John Ousterhout's _A Philosophy of Software Design_. Complexity is the
enemy: the best modules are "deep" — small, powerful interfaces that conceal
real work, so callers think in simple terms while the module does the heavy
lifting.

## Why This Matters With AI

An AI is naturally good at creating **shallow-module-dense** codebases — a pile
of tiny scattered functions and files. But such a codebase is a disaster for the
AI itself: when it explores, it drowns in a sea of fragments and cannot tell
what the code actually does. Deep modules give the AI (and humans) a clean,
navigable structure.

## Deep vs Shallow

|                | Deep module                                 | Shallow module                              |
| -------------- | ------------------------------------------- | ------------------------------------------- |
| Interface      | Small, simple, powerful                     | Complex, wordy                              |
| Implementation | Hides lots of real work                     | Little functionality behind the interface   |
| Cost           | Cheap to use, expensive to build (worth it) | Cheap to build, expensive to use everywhere |
| AI effect      | Easy to navigate, understand, reuse         | Drowns in fragment sea                      |

## When To Use

- The codebase is a sea of small scattered functions the AI cannot navigate.
- A module's interface is complex for the value it provides.
- You are about to introduce a new module or public API.
- You want to make the code more testable or AI-navigable.

## How To Design A Deep Module

1. **Start from the interface.** What do callers need? Give them the simplest
   interface that fully serves them.
2. **Hide the implementation.** The interface should not leak details (config
   flags, internal state, transport details) that callers do not need.
3. **Find the "deep" work.** The module should do substantial, valuable work
   behind that interface — not just pass through.
4. **Merge shallow fragments.** Look for groups of small functions that are
   always used together; collapse them behind one deep interface.

## Rules

- **Interface simplicity is the goal.** A deep module is a small interface
  hiding real work, not a big interface hiding nothing.
- **Add a new module only if its interface is simpler than the complexity it
  removes.** Otherwise it is a shallow module and increases complexity.
- **Avoid leaking implementation** through the interface (flags, internals).
- **Refactor incrementally.** Scan for shallow modules, merge them into deep
  ones, keep tests green.

## Concrete Steps

1. Scan the codebase for shallow modules (small functions with many parameters,
   pass-through wrappers, leaky interfaces).
2. Group fragments that are always used together.
3. Design one deep interface that serves those callers.
4. Move the implementation behind it.
5. Simplify call sites to use the deep interface.
