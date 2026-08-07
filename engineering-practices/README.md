# Engineering Practices

A reusable, layered set of engineering practices for AI-assisted development.
It encodes the strongest software-engineering lessons — newer AI-era techniques
and decades-old classics — as **layered enforcement** so they actually get
applied, not just admired.

Inspired by Matt Pocock's AI Engineer Summit talk ("Software Fundamentals Matter
More Than Ever") and four classic books. The core thesis: **the better the
codebase, the more leverage AI gives you; the worse the codebase, the faster AI
rots it.** These practices protect the codebase so AI stays a multiplier.

## The Three-Layer Enforcement Model

Practices are enforced at three layers, from mechanical to advisory. This
matches the mental model: **Hook = traffic light (mechanical, no choice),
Constraint = traffic rules (advisory, follow or not)**.

| Layer             | Mechanism                       | Enforces                                            | Grounded in                                      |
| ----------------- | ------------------------------- | --------------------------------------------------- | ------------------------------------------------ |
| **L1 Mechanical** | Hooks + commit/stop gates       | Compiles, tests exist, blast radius tracked         | Ousterhout, Pragmatic Programmer, Better Harness |
| **L2 Constraint** | Skill frontmatter `constraints` | Ordering, must-do checks, interface-grep            | The four books                                   |
| **L3 Knowledge**  | Skills + glossary + docs        | How to align, model the domain, design deep modules | Matt's 5 techniques + four books                 |

- **L1** is small and low-risk on purpose: it blocks what is mechanically
  verifiable and never blocks on taste.
- **L2** encodes the workflow ordering and the must-do checks.
- **L3** teaches the _how_ — the shared vocabulary, deep-module design, TDD loop.

## What's Included

### Skills (L3 knowledge + L2 constraints)

| Skill                 | Purpose                                                    | Source                                        |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| `grill-me`            | Reach a shared design concept before writing code          | Brooks, _The Design of Design_                |
| `domain-glossary`     | Maintain a Ubiquitous Language in `GLOSSARY.md`            | Evans, _Domain-Driven Design_                 |
| `tdd-first`           | Test-first red-green-refactor in small steps               | Beck, _Test-Driven Development_               |
| `deep-module`         | Small interface hiding real work; refactor shallow modules | Ousterhout, _A Philosophy of Software Design_ |
| `design-interface`    | Design interfaces, delegate internals, test at the seam    | Matt Pocock's 5th technique                   |
| `verify-gate`         | Verify before claiming done; reflect, fix, re-verify       | OpenCodeReview deterministic loop             |
| `feat-dev` (enhanced) | Feature workflow + enforced practices                      | Matt's interface-delegation technique         |
| `bugfix` (enhanced)   | Reproduce-first + failing-test-before-fix                  | Pragmatic Programmer                          |

### Files

- `install.sh` — copy skills + glossary template + AGENTS fragment into a
  target project (idempotent, supports `--dry-run`).
- `AGENTS.partial.md` — a snippet to merge into the target project's AGENTS.md.
- `GLOSSARY.template.md` — starting point for a project glossary.

## The Four Books (and why)

| Book                              | Author           | Idea this pack uses                                   |
| --------------------------------- | ---------------- | ----------------------------------------------------- |
| _A Philosophy of Software Design_ | John Ousterhout  | Complexity is the enemy; deep modules.                |
| _The Pragmatic Programmer_        | Hunt & Thomas    | Feedback speed is your speed limit; software entropy. |
| _The Design of Design_            | Frederick Brooks | The shared "design concept" that grind-me surfaces.   |
| _Domain-Driven Design_            | Eric Evans       | Ubiquitous Language / shared vocabulary.              |
| _Test-Driven Development_         | Kent Beck        | The red-green-refactor loop.                          |

## Installation

```bash
# Copy the pack into a target project (defaults to current dir)
./install.sh /path/to/project

# Preview what would be copied without changing anything
./install.sh /path/to/project --dry-run

# Copy only skills
./install.sh /path/to/project --skills
```

`install.sh` is idempotent — re-running it does not duplicate anything. It never
overwrites an existing skill or an existing `GLOSSARY.md`.

## Usage

1. **Start a project** — install the pack, create `GLOSSARY.md` early.
2. **Before a feature** — run `grill-me` to align, then `tdd-first`.
3. **While coding** — prefer deep modules; the model fills interface internals
   while you own the boundaries and test at the interface.
4. **Gate** — the project's L1 hooks (compile, test evidence) mechanically
   enforce the floor.

## Design Notes

- **Layered, not one-size.** Only a few things deserve mechanical enforcement;
  most practices are advisory because taste is not mechanically checkable.
- **Reusable, not coupled.** The pack is self-contained under
  `engineering-practices/`; it does not assume the qwen-code repository.
- **Small and composable.** Each skill is short and adaptable; hack them to fit
  your project.
