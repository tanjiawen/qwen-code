# AGENTS Reference

This file holds the detailed command/workflow reference for the repository. It
is loaded from `AGENTS.md` (the single source of truth) when an agent needs
the full detail. Keep `AGENTS.md` as a scanable launch index; place long
scenario-specific workflows here.

## Common Commands

### Building

```bash
npm install        # Install all dependencies
npm run build      # Build all packages (TypeScript compilation + asset copying)
npm run build:all  # Build everything including sandbox container
npm run bundle     # Bundle dist/ into a single dist/cli.js via esbuild
                   # (requires build first)
```

`npm run build` compiles TS into each package's `dist/`. `npm run bundle`
takes that output and produces a single `dist/cli.js` via esbuild. Bundle
requires build to have run first.

### Development

```bash
npm run dev        # Run CLI directly from TypeScript source (no build needed)
```

Runs the CLI via `tsx` with `DEV=true`. Changes to `packages/core` or
`packages/cli` are reflected immediately without rebuilding.

### Unit Testing

Tests must be run from within the specific package directory, not the project
root.

**Run individual test files** (always preferred):

```bash
cd packages/core && npx vitest run src/path/to/file.test.ts
cd packages/cli && npx vitest run src/path/to/file.test.ts
```

**Update snapshots:**

```bash
cd packages/cli && npx vitest run src/path/to/file.test.ts --update
```

**Avoid:**

- `npm run test -- --filter=...` — does NOT filter; runs the entire suite
- `npx vitest` from the project root — fails due to package-specific vitest
  configs
- Running the whole test suite unless necessary (e.g., final PR verification)

**Test gotchas:**

- In CLI tests, use `vi.hoisted()` for mocks consumed by `vi.mock()` — the
  mock factory runs at module load time, before test execution.

### Integration Testing

Build the bundle first: `npm run build && npm run bundle`

Run from the project root using the dedicated npm scripts:

```bash
npm run test:integration:cli:sandbox:none
npm run test:integration:interactive:sandbox:none
```

Or combined in one command:

```bash
cd integration-tests && \
  cross-env QWEN_SANDBOX=false npx vitest run cli interactive
```

**Gotcha:** In interactive tests, always call `session.idle()` between sends —
ANSI output streams asynchronously.

### Linting & Formatting

```bash
npm run lint       # ESLint check
npm run lint:fix   # Auto-fix lint issues
npm run format     # Prettier formatting
npm run typecheck  # TypeScript type checking
npm run preflight  # Full check: clean → install → format → lint → build
                   # → typecheck → test
```

## Web Shell UI development

- Prefer the shared primitives in
  `packages/web-shell/client/components/ui` when developing Web Shell UI. Do
  not duplicate an existing primitive or rewrite stable CSS Modules solely for
  consistency.
- If a required primitive is missing, run
  `npx shadcn@latest add <component>` from `packages/web-shell`, then review the
  generated diff. Do not let the CLI overwrite the existing global CSS,
  semantic tokens, CSS scoping, or portal-root integration. Keep generated
  components internal unless a public package API is explicitly required.
- Web Shell supports React 18 and React 19. Generated shadcn components often
  assume React 19 ref semantics, so wrappers that accept or receive refs —
  including Radix `asChild`, `Slot`, `Presence`, and portal children — must use
  `React.forwardRef` and pass the ref to the underlying DOM or Radix primitive.
  Add a regression test for any ref-sensitive component path.
- Use unprefixed Tailwind classes and shadcn semantic color tokens such as
  `background`, `primary`, and `muted`. The package build scopes generated CSS
  to the Web Shell root and portal root and prefixes global animations and CSS
  property registrations; changes must preserve that isolation from host-page
  styles.
- Components with portals, such as dialogs, popovers, dropdown menus, and
  tooltips, must use `useWebShellPortalRoot()` as the Radix portal container so
  themes, scoped CSS, and z-index variables continue to apply. Preserve
  existing `data-web-shell-*` attributes and public `--web-shell-*` CSS
  variables. See `packages/web-shell/README.md` for the full conventions.
