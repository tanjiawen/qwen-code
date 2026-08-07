## Engineering Practices (enforced)

This project enforces a layered set of engineering practices. They are grounded
in four classic books and Matt Pocock's AI-era synthesis; see
`engineering-practices/README.md` for the full model.

Mandatory (mechanical, no choice):

- **Compiles.** Source must typecheck/build before "done".
- **Tests exist.** Changing source code requires test evidence; a large change
  without tests is blocked.
- **Interface changes are checked.** Before changing a signature, export, or
  public interface, grep all call sites and imports first.

Required (advisory constraints, follow unless you can justify otherwise):

- **Align before building** (`grill-me`): reach a shared design concept before
  implementation. Do not start coding on a vague idea.
- **Test first** (`tdd-first`): a failing test capturing the behavior must exist
  before implementation.
- **Shared vocabulary** (`domain-glossary`): read `GLOSSARY.md` if present and
  use its canonical terms.
- **Deep modules** (`deep-module`): prefer a small interface hiding real work
  over a sea of shallow fragments. Enforced in feat-dev before the failing test.
- **Interface delegation** (`design-interface`): you design module boundaries
  and interfaces; the model fills interface internals; you write tests at the
  interface to verify the model's output. Enforced in feat-dev before
  implementation.
- **Verify before claiming done** (`verify-gate`): run deterministic
  verification (typecheck, tests, interface grep) before claiming a task is
  complete; on failure, reflect on the root cause, fix, and re-verify. Enforced
  in feat-dev before self-audit.
- **Real paths only**: edit/read only through paths verified by the file cache;
  never invent or hallucinate a path. Grounded in OpenCodeReview's forced path
  injection.

The skills are: `grill-me`, `domain-glossary`, `tdd-first`, `deep-module`,
`design-interface`, `verify-gate`.
