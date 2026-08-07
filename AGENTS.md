# AGENTS.md

Guidance for Qwen Code when working in this repository.

## Working Principles

### Simplicity First

**Minimum code that solves the problem. Nothing speculative.**
**(This is the principle we care about most.)**

- No features beyond what was asked; no abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

### Core Infrastructure Is Maintainer-Only (triage gate, two-tier rule)

Core modules — `packages/core/src/**`, `packages/*/src/{auth,providers,models,
config,tools,services}/**`, and cross-package changes — are the architectural
backbone. External PRs touching them face a two-tier gate (maintainer PRs
exempt):

1. **Large-scope `refactor` changes (500+ production logic lines in core,
   excluding tests/generated/schema) → hard block**, maintainer-only. Line
   counts exclude `*.test.{ts,tsx}`, `*.spec.*`, `__tests__/**`, `*.schema.*`,
   `*.generated.ts`, `**/generated/**`. Non-`refactor` PRs are not hard-blocked
   on size but escalate; an advisory applies at 1000+ lines. Breadth alone is
   not size — a low-risk sweep is judged under Tier 2.
2. **Small-scope changes → gate may evaluate, but must be 100% confident.**
   Any doubt → escalate. The gate must name every downstream consumer.

**When in doubt, escalate. Better to wrongly escalate than wrongly approve.**

## Common Commands

Full command reference (build, dev, unit/integration testing, lint/format) in
[AGENTS_REFERENCE.md](AGENTS_REFERENCE.md). Key commands:

```bash
npm run build      # Build all packages
npm run dev        # Run CLI directly from TS source (no build)
npm run typecheck  # TypeScript type check
npm run lint       # ESLint check
```

**Tests:** run from the package directory (`npx vitest run <file>`), never
`--filter` from root; use `vi.hoisted()` for CLI mocks.

## Code Conventions

- **Module system**: ESM throughout (`"type": "module"` in all packages)
- **TypeScript**: Strict mode with `noImplicitAny`, `strictNullChecks`,
  `noUnusedLocals`, `verbatimModuleSyntax`
- **Formatting**: Prettier — single quotes, semicolons, trailing commas,
  2-space indent, 80-char width
- **Linting**: No `any` types, consistent type imports, no relative imports
  between packages
- **Tests**: Collocated with source (`file.test.ts` next to `file.ts`),
  vitest framework
- **File naming**: `PascalCase.tsx` for React, `kebab-case.ts` for `.ts` in
  `packages/core`/`packages/cli` (allowlisted in `eslint.legacy-filenames.mjs`).
- **Comments**: Default to none. Add only when _why_ is non-obvious; don't delete existing ones as cleanup.
- **Commits**: Conventional Commits (e.g., `feat(cli): Add --json flag`)
- **Node.js**: Development and production both require `>=22` (Ink 7 + React 19.2 requirement)

### Web Shell UI development

Prefer `packages/web-shell/client/components/ui` primitives; use
`useWebShellPortalRoot()` for portal components; keep shadcn additions isolated
from the global CSS/portal-root. React 18+19 → ref-sensitive wrappers use
`React.forwardRef`. Conventions: [AGENTS_REFERENCE.md](AGENTS_REFERENCE.md).

## Development Guidelines

### Engineering practices

Layered practices enforced (see `engineering-practices/README.md`): mechanical
(compiles, tests, interface-grep) + required (`grill-me`, `tdd-first`,
`domain-glossary`, `deep-module`, `design-interface`, `verify-gate`).
Non-trivial features → `/feat-dev`, bugs → `/bugfix` (blueprints force
grill → glossary → failing-test → verify-before-done). Edit/read only through
cache-verified real paths; never invent a path (P2, from OpenCodeReview).
After changing source files you **must** call the `ocr-review` subagent to run
a complete OpenCodeReview of the current changes (ocr delegate mode); a Stop
hook (`stop-ocr-review-guard.sh`) blocks Stop until it has run.

### General workflow

1. **Design doc for non-trivial work** — in `docs/design/` when the change spans multiple files or design decisions; skip bugfixes.
2. **Test plan for behavioral changes** — an E2E test plan in `.qwen/e2e-tests/`; dry-run against the global `qwen` CLI first.
3. **Build, typecheck, test before done**: `npm run build && npm run typecheck`, plus unit tests for changed files.
4. **Self-audit before done** — read the full diff, presuming each green test
   wrong; two clean passes suffice. Fix re-runs step 3; five passes → say so.
5. **Code review** — run `/review` (the Codex workflow, not Qwen Review); triage comments, fixes back through steps 3-4.
6. **Better Harness gate (mandatory)** — every change gated by the Stop hook
   (`~/.qwen/scripts/better-harness-stop-gate.sh`) and pre-commit hook
   (`scripts/better-harness-gate.mjs`); maintainer exemption downgrades core
   blocks. Run `/better-harness` at milestones; thresholds in blast-radius.json.

### Feature development

Use the `/feat-dev` skill: investigate, design, test plan, dry-run, implement,
verify, self-audit, code review, iterate.

### Bugfix

Use the `/bugfix` skill: reproduce first, then fix, verify, test, self-audit,
code review.

## Code Review

Project-specific rules for `/review`. The skill loads this section verbatim (by
its `## Code Review` heading) and hands it to every review agent, so keep it to
things a reviewer of _this_ codebase must check — not general advice.

- **Verify a finding against the exact reviewed commit before reporting it.**
  Read the lines you are about to cite. A Critical that quotes code not present at
  the commit under review is worse than no finding — it blocks the author over
  nothing. Do not report a defect you have only inferred from a symbol name or a
  diff fragment.
- **A `C=0` / APPROVE is a claim, not a default.** Before submitting one, take
  each unresolved Critical already on the PR and check it against the code as it
  stands: _still stands_ / _fixed by this diff_ / _cannot tell_. A GitHub thread
  can read `isResolved: false, isOutdated: false` for a bug that a later commit
  fixed on an adjacent line — the flag tracks the anchored line, not the fix.
- **For every added field, option, or optional parameter, grep its read sites**,
  including outside the diff. A `foo?: boolean` that is declared and read but never
  set by any caller is a dead switch (`options.foo ?? true` always takes the
  default). Decide severity at the read site; never explain an unpopulated field
  with author intent you cannot observe.
- **Classify every added or changed daemon route by ownership.** Name whether it
  is process-global, legacy-primary, selected-runtime, live-session-owner, or
  persisted-workspace scoped, and verify every downstream consumer matches that
  scope.
- **Verify workspace-scoped routes stay inside the resolved runtime.** Check the
  environment, bridge, service, filesystem, trust boundary, and failure paths.
  Each unknown, untrusted, ambiguous, bootstrapping, draining, or removed state
  must follow its declared failure semantics and must never fall back to the
  primary runtime.
- **Match the house style when judging.** ESM only; no `any`; no relative imports
  between packages; `kebab-case.ts` for `.ts` in `packages/core` and `packages/cli`,
  `PascalCase.tsx` for React components; tests collocated as `file.test.ts`.
  Comments default to none — flag a _missing_ comment only where the _why_ is
  genuinely non-obvious, and never fault a diff for deleting a comment that no
  longer applies.
- **A missing test for changed behavior is a Suggestion, not a Critical**, unless
  the untested path is itself the defect.

## GitHub Operations

Use the `gh` CLI for all GitHub operations — `gh issue view`, `gh pr view`,
`gh pr checks`, `gh run view`, `gh api` — over web fetches or manual REST.

## Testing, Debugging, and Bug Fixes

- **Bug reproduction & verification**: spawn the `test-engineer` agent (reads
  code/docs, reproduces via E2E; cannot edit source).
- **Hard bugs**: use the `structured-debugging` skill (first fix failed or
  seems impossible).
- **E2E testing**: the `e2e-testing` skill covers headless/interactive/MCP
  testing (test-engineer invokes it internally).

## Submitting PRs

Follow `.github/pull_request_template.md`; after submitting, post the E2E test
report as a separate comment.

- **PR description**: prose on motivation, not file/function names.
- **Reviewer Test Plan**: behaviors to verify and expect, not scripted
  commands; use **How to verify** / Before-After for TUI evidence.
- **Line wrapping**: one long line per paragraph/list item (GitHub renders a
  single newline as `<br>`).
- **~5 review rounds cap**: beyond that, land only Critical fixes and defer
  Suggestions to a follow-up, recording each in the PR thread.

## Project Directories

| Directory                                                                        | Purpose                                        |
| -------------------------------------------------------------------------------- | ---------------------------------------------- |
| `docs/design/`, `docs/plans/`                                                    | Design docs & implementation plans (committed) |
| `.qwen/e2e-tests/`, `.qwen/issues/`, `.qwen/pr-drafts/`, `.qwen/investigations/` | Working artifacts (git-ignored)                |
