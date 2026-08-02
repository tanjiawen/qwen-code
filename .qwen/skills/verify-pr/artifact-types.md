# Match the method to the artifact type

- **Test-only PRs** (the diff touches tests, not production code): the
  question is not "does it pass" but "does the suite now hold down what it
  claims to". Run a **mutation A/B across test files**: build a matrix of
  single-point mutants of the _unmodified_ production file and run each
  against the old test file and the new one, changing nothing else. Report
  killed/total on both sides (`8/13 → 10/13`) and state explicitly that **no
  mutant regressed from killed to survived** — a test change that kills two
  new mutants while quietly losing one is a net loss. Then check
  **attribution**: the assertion that kills each newly-killed mutant must be
  the one the commit says it strengthened, not an unrelated test that
  happened to go red. Finally, **adjudicate every survivor** — for each, say
  whether it is a coverage gap or a real defect, and prove which
  independently rather than by reading the code. Confirm the unmutated
  control is green, or the kills mean nothing.
- **Third-party actions and dependencies**: verify what they do from **their
  own manifest**, never from the PR's description of them. A change asserted
  that a cache directory was "ephemeral, discarded after the job"; reading
  `action.yml` showed `post: 'dist/save/index.js'` with `post-if: success()`
  — a post-step uploads that directory as root with the Actions credentials
  intact, which is the opposite of the claim and the whole finding. Also
  confirm a pinned SHA dereferences to the tag the PR says it does.
- **Committed generated artifacts** (a `patch-package` patch, a lockfile, a
  generated schema or `.d.ts`, a checked-in snapshot): the description
  usually says it was regenerated with the tool. **Re-run the generator and
  diff its output against what was committed.** A byte-difference proves the
  file was hand-edited rather than generated, which is a maintenance hazard
  even when the content is functionally identical and applies cleanly — the
  next regeneration will produce a confusing diff. Worked example: re-running
  `npx patch-package ink` produced hunk headers carrying the function-context
  suffix that the committed `.d.ts` hunks lacked. Report it at the severity
  it deserves (usually a nit), and say plainly that the content matched.
- **Multi-commit PRs**: verify each commit's claim separately when the
  commits are reachable. In CI they usually are **not** — the checkout is
  depth 2, giving only the merge commit, the base tip (`HEAD^1`), and the PR
  head (`HEAD^2`). A bare `git rev-list --count HEAD^1..HEAD^2` is NOT a
  sufficient check: at a shallow boundary it returns a plausible small
  number (often `1`) instead of erroring, so the gap goes unnoticed. Compare
  the locally reachable commits (`git rev-list HEAD^1..HEAD^2`) against the
  `commits` array in `$QWEN_VERIFY_CONTEXT`, and treat
  `git rev-parse --is-shallow-repository` returning true as "assume
  unreachable unless proven otherwise". If they do not match, verify the
  aggregate `HEAD^1..HEAD` diff and state in _Not covered_ that per-commit
  attribution was out of reach. Never
  present a per-commit table whose rows were not individually exercised.
- **Workflow / CI / script PRs**: unit tests are the wrong oracle. Extract
  and **execute** the embedded bash/jq/python against real data (local
  replay), and run whichever repo lint gates the container actually has —
  `bash -n` and `shellcheck` on extracted `run:` blocks always work; the
  repo's wrapper only lints when the pinned binaries are present, so
  install them with `node scripts/lint.js --setup` and then invoke the
  individual non-mutating checks (`--actionlint`, `--yamllint`, `--eslint`).
  **Never run `node scripts/lint.js` with no arguments** — the no-arg form
  also runs `prettier --write .`, which rewrites the PR working tree
  underneath your A/B and replay harnesses. If the tools cannot be installed
  in-container, say which gate you could not run rather than implying it
  passed. For a new automated trigger, do the day-one cost math
  — arrival rate against the job's drain rate. Event history needs the API,
  which this environment does not have: derive what you can from the local
  repo (tags, release commits, merge cadence in `git log`), label it as the
  bounded local estimate it is, and name the exact query a maintainer should
  run to confirm.
- **Config knobs**: trace every new input, flag, or option to an observable
  effect — a control that is recorded but never wired to behavior is a
  finding. Probe the **default** path of manual dispatch/config combinations
  (what happens when an operator submits the pre-filled form as-is), not
  just the documented happy path.
