# Artifact contract (the workflow collects and publishes these)

Create `tmp/pr<n>-verify-<YYYYMMDD-HHMMSS>/` (the `-verify-` infix is what the
workflow globs). It must contain:

- `report.md` — the deliverable (structure below).
- `verdict.txt` — exactly one word: `merge-ready` | `findings` | `blocked` |
  `inconclusive`. Anything else is discarded by the workflow.
- `assertions.json` — `{"pass": <int>, "fail": <int>, "total": <int>}`,
  counting **only scripted assertions that actually executed**.
- Harness scripts and raw logs (per-cell stdout/stderr, build logs).
- `evidence/*.png` — image evidence. **Produce these whenever you ran a
  harness**, not only for TUI work. A table in the report is your _claim_
  about what happened; a capture of the run is a _witness_ that the numbers
  came from a real execution, and it is the part a reviewer cannot get any
  other way. The highest-value shots, in order: the A/B cells side by side,
  the mutation matrix as it printed, and the raw harness output behind a
  headline number. One capture of the terminal showing `2999 → 0` is worth
  more than the sentence asserting it.

  **Chromium is pre-installed for you** when `QWEN_VERIFY_CHROMIUM=1` is set;
  `PLAYWRIGHT_BROWSERS_PATH` already points at it. Do **not** run
  `playwright install` — you run as `node` with a fresh `HOME` and no apt
  rights, so it downloads ~170 MB and then fails on system deps. If
  `QWEN_VERIFY_CHROMIUM` is unset the capability is unavailable in this run:
  ship the text-only report and note it under _Not covered_ in one line, do
  not spend budget working around it.

  Route: `terminal-capture` skill (node-pty → xterm.js → Playwright PNG).
  The publish job hosts what you produce on a per-PR branch
  (`pr-assets/<N>-verify`) and appends it below the report, capped at
  **8 images, 2 MB each**; anything
  beyond stays in the run artifacts. Name each file as a kebab-case caption
  that binds image to claim (`01-bundle-ab-base-vs-head.png`,
  `02-repaint-after-sigcont.png`) — the filename becomes the published
  caption — and reference it from report.md prose by that name. Before/after
  pairs beat single "after" shots; a screenshot that does not name what to
  look at proves nothing.

`verdict.txt` meanings: `merge-ready` = every executed assertion passed and no
new blocking finding; `findings` = evidence produced concrete problems worth a
reviewer's attention; `blocked` = the central claim failed its A/B or a
regression reproduced; `inconclusive` = budget or environment prevented the
central claim from being tested — say why.

### report.md structure

1. **Verdict line first**, with assertion totals and the verified head OID
   (`git rev-parse HEAD^2` — not the snapshot's, which may have drifted).
2. **中文摘要** in a collapsed `<details>` block, **immediately after the
   verdict**: verdict, A/B 结论, findings, 未覆盖范围. Collapsed, so it costs a
   reader who does not want it exactly one line; placed here rather than at
   the end, because the whole report is already inside a `<details>` on the
   PR — burying the Chinese summary under it made a Chinese reader expand a
   fold and scroll the entire report to reach the one section written for
   them. Cite the tables below by name instead of restating their numbers in
   prose: a number written twice is a number that can disagree with itself.
3. **Central claim + A/B table** (cells, oracles, head vs control counts).
   Reference the capture of those cells here by its filename — a table with
   no witness beside it is the shape every report has had so far.
4. **Corrections**, when an earlier review round or bot comment described
   the code inaccurately (a wrong ARIA role, a wrong mechanism, a
   misattributed cause). State the correct fact with its evidence and label
   it explicitly as a correction to the description — not as a request to
   change the code. Leaving a wrong description standing costs the next
   reader more than the original finding did.
5. **Findings**, ordered by severity, each with the exact reproducing
   command; for a blocker, enumerate the blast radius (the affected call
   sites, not just the one you hit), demonstrate the sharpest consequence
   end-to-end when budget allows, and where the cause is clear add a
   collapsed minimal suggested fix that preserves the original commit's
   intent.
6. **Not covered** — every claim, surface, or gate you skipped. A silent cap
   reads as "covered everything"; never allow that. When something failed to
   run rather than being skipped by choice, **prove it was environmental
   before saying so**: boot the identical thing on base and on head and show
   both fail the same way (an A/A control). "The dev harness renders blank —
   base and head both blank, so this is my sandbox, not a regression" is a
   claim a reader can check; "seems environmental" is not, and the two look
   identical in a report.
7. **Methodology** — one paragraph: environment, how each harness drove the
   code, where the raw logs live.
