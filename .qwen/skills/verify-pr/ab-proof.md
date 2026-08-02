# A/B load-bearing proof

Run the identical scenario against the PR build and a control build that
differs only by the change under test; the verdict is the pair of counts.

- Base side: `git worktree add tmp/base-tree <base>` where `<base>` is
  `HEAD^1` **only on the CI merge-ref checkout**; in local mode it is the
  resolved `baseRefOid` from the metadata snapshot, because a plain PR-head
  checkout's `HEAD^1` is the previous PR commit and would attribute earlier
  commits of this PR to the change under test. (Keep scratch worktrees
  under `tmp/` and `git worktree remove --force` them once the A/B cells are
  captured — the workflow sweeps leftover `tmp/` worktrees as a backstop, but
  never rely on it), then rebuild **only the
  affected workspace or file** — e.g. `npm run build -w packages/<ws>` inside
  the base tree wired to the already-installed root `node_modules`, or
  recompile the single changed module. A full base `npm ci` rarely fits the
  budget; say so in the report if you had to spend it.
- ⚠️ Reusing the root `node_modules` for the base side is only a clean
  control when the PR leaves `package.json`/`package-lock.json` untouched.
  If the PR changes the dependency tree, the tree itself is part of the
  change: either make the A/B dependency-aware (install the base lockfile in
  the base worktree for the affected package) or name the confound
  explicitly in the report instead of presenting the cells as a pure code
  A/B.
- ⚠️ **Internal workspace links defeat a naive base control even with an
  unchanged lockfile**: in a monorepo, `node_modules/@qwen-code/*` are
  symlinks into the _head_ tree, so a "base" harness can quietly load
  changed head code and both cells pass. Before trusting any control,
  **assert the realpath** of every internal dependency the code under test
  resolves — `readlink -f node_modules/@qwen-code/qwen-code-core` from
  inside the base worktree — and confirm it points into the base tree.
  (Do NOT reach for `require.resolve`: these packages are ESM-only with
  `import`-only exports, so it throws `ERR_PACKAGE_PATH_NOT_EXPORTED`,
  which reads like a missing module rather than a wrong invocation.) — then quote that check in the methodology note. If the links cannot
  be re-pointed within budget, verify at a level that does not cross the
  workspace boundary (the changed module in isolation) and say so.
- Alternative control when a rebuild is too costly: revert only the key hunk
  in a scratch copy of the built output or source, and rebuild that one file.
  The control must differ by nothing else — name the exact commit/hunk it
  represents.
- Report the cell table: environment per cell, observable oracle per cell
  (exit code, stderr line, wire request, rendered frame), and `X/Y` at head
  vs control. "5/9 flip from broken to fixed" is the shape to aim for.
- When a change **suppresses** output — a removed notice, a narrowed log, a
  swallowed error — check whether the information survives anywhere before
  calling the suppression correct. Follow the value: is the cause still
  carried in a field someone reads? Grep the repo for that field; a bare
  `catch {}` on the path and a field with no readers anywhere means the
  reason is now unobservable even in devtools. Losing "which failure was
  this" is a real regression even when hiding the message was the goal, and
  it is invisible to any behavioural assertion.
- Probe the type boundaries of the changed expression, not just the
  reported repro: a coercion/conversion fix gets cells for `null`, boolean,
  object, and astral inputs, and lossy results (e.g. `String({})` →
  `"[object Object]"`) are called out in Findings even when every scripted
  assertion passes. A fix that holds only for the reported input shape is a
  finding, not a pass.
- If the changed branch is unreachable in the default setup (a fallback, a
  `dist` path, an error handler), **construct the configuration that
  reaches it** — drop the tsconfig mapping, break the primary path, force
  the fallback — rather than declaring it untestable. A branch nobody can
  reach is itself a finding.
- For size/performance claims the A/B cells are **measured metrics** (bytes,
  file counts, calls, ms) in a table with a Δ column, attributed to the
  change — and every residual delta gets accounted for ("the closure is
  1.3 KB larger: that is the new guards themselves"). An unexplained
  residue is a finding, not noise.
- **Isolate the slice the mechanism can actually affect, then show what
  fraction of the total it is.** A speedup claim is really two claims: the
  mechanism works, and the thing it speeds up matters. Add an arm that
  strips everything the mechanism cannot touch — measured example: an npm
  download cache was claimed to cut `npm ci` by ~75%; running with
  `--ignore-scripts` isolated pure download+extract at 36 s cold of a 226 s
  install, and warming just that slice removed 20 s of it (36 s → 16 s) —
  the cache's ceiling. End-to-end the install went 226 s → 193 s, a 15%
  saving rather than the claimed 75%, the rest of the cost being the repo's
  own `postinstall`/`tsc`/bundler work. Then check that saving against the
  **whole job budget**: 33 s off a 14 m 37 s job is not the headline the
  description claimed. A perf PR whose mechanism works but targets 15% of the
  cost is a finding about the premise, not the code.
- **A mechanism that persists something has a cost, not only a benefit —
  price it.** Caches, artifacts and generated entries consume a shared,
  bounded resource. Measure what it adds (219 MB per lockfile hash), what
  the pool holds (9.98 GB of a 10 GB cap), and the churn rate (39 distinct
  lockfile states in 30 days) — because at the cap every new entry evicts
  by LRU, including entries other jobs depend on, and possibly its own,
  degrading the very hit rate the saving assumes.
- **Test the scarier consequences and report which ones do NOT hold.** Having
  found a real problem, the temptation is to report the worst reading of it.
  Bound it instead: in the cache case the write-path finding was real
  (a post-step uploads the directory that untrusted code can write), but
  code injection was **disproved** — tampering with a cached tarball made
  npm reject it against the lockfile hash and refetch under the flag CI
  uses, and all 2262 lockfile entries carry an `integrity` hash, so nothing
  installs unhashed — and privilege escalation was **disproved** —
  `chown -R` does not follow symlinks. What survived was content and quota
  abuse. A finding that names what it is _not_ is far harder to wave away
  than one that implies everything.
- When the PR adds a defensive guard or shape check, its unit tests usually
  mock the reject path — so verify the **accept path against the real
  artifacts it will see in production** (the shipped chunks, the real
  module namespaces, the actual wire payloads). A guard that is too strict
  fails in production on a path no mocked test covers.
- **When one fix bundles two changes, build the intermediate variants.** An
  A/B against base proves the pair works; it says nothing about what each
  half does or whether both are needed. Compile a third build with one half
  reverted and put all three in one table. Worked example, on a first-poll
  drain fix that both replaced `Math.max(...spread)` with `reduce()` and
  moved `initialized = true` after the fallible work:

  | build                         | RangeError | prompts dispatched     | cursor saved |
  | ----------------------------- | ---------- | ---------------------- | ------------ |
  | base (`Math.max`, flag first) | yes        | **2,999 and climbing** | none         |
  | flag moved only               | yes        | 0                      | none         |
  | both (head)                   | no         | 0                      | saved        |

  The ordering change is what converts a backlog flood into a fail-safe
  retry; `reduce()` is what restores liveness. Either alone leaves a channel
  that floods or wedges — a conclusion the two-cell A/B cannot reach.

- **A limit measured in isolation does not transfer to the real call site.**
  Argument-count caps, stack depth, buffer sizes and timeouts all move with
  context: the same `Math.max` spread threw between 110k and 130k elements
  inside a deep async stack, well below what a standalone micro-benchmark
  suggests. Bisect the threshold **through the real code path**, and quote
  the harness you bisected with — a limit quoted from documentation or from
  a toy loop is a guess about the system under test.
- **When the same predicate is checked in two places, verify they see the
  same state.** A guard duplicated across a process boundary — a route and
  the child it spawns, a parent and a worker, a cache and its source — is
  two implementations of one question, and they diverge whenever their
  _inputs_ differ rather than their logic. Find the configuration that makes
  them disagree and drive it: one measured case had the route ask
  `sessionExistsInAnyState()` with an unpinned runtime dir while the child
  asked it with a pinned one, so a single settings key flipped a clean 409
  into a 500 plus a `process.exit(1)` that killed every session on the
  channel. Two related questions expose most of this class: does one side
  observe state the other cannot, and **is the state observable yet at all**
  — lazily-created backing files (`ensureConversationFile()` writes nothing
  until the first prompt) leave a window in which a just-created entity is
  invisible to any existence check that looks on disk.
- **Measure the blast radius on bystanders, not just on the caller.** When a
  failure path can take down shared infrastructure, the interesting number
  is what happened to everything else: an unrelated session going
  `200 → 404`, a workspace list going `2 → 0`. Assert on a third party you
  set up beforehand — the caller's own error code understates a shared-state
  failure every time.
- **Run every control on BOTH arms, not just the arm that needs it.** A
  control usually exists to validate the probe on one side — "the empty list
  on base is a real absence, so let the model call the API explicitly and
  watch an entry appear". Run that same step on head anyway. The single
  highest-value finding of a real round came from exactly this: the
  base-side positive control, executed identically on head, showed the
  curated title being silently discarded. The control was not looking for a
  bug; running it symmetrically is what found one.
- **A new writer into a shared store is an ordering change, not just an
  addition.** When the PR makes some new path write into a store that
  already has writers — an artifact list, a cache, a registry, a settings
  merge — the bug is rarely in the new writer. It is in the _collision_:
  the store's existing merge policy (first-writer-wins, last-writer-wins,
  shallow merge) was chosen when only one writer existed, and the PR
  changes who arrives first. Enumerate the other writers, exercise the
  collision **in both orders**, and check what the loser is told — a silent
  no-op that reports success is a finding even when the merge policy itself
  is pre-existing and correct. Name the pre-existing cause and the PR's
  contribution separately, so the author is not blamed for the policy.
