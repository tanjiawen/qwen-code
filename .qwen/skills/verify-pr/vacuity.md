# Vacuity check on new/changed tests

If the PR adds or modifies tests, prove at least the central one is not
vacuous: revert the key source hunk (scratch copy), run that test, confirm it
fails, restore. A test that stays green against the un-fixed source is a
finding, not a pass.

Report the mutation matrix **including the mutations that changed nothing**:
one row per guard the PR introduces, the suite that should catch it, and
pinned / not-pinned. Survivors are not noise — classify each as an ordinary
**coverage gap** (the behaviour is right, nothing asserts it) or as **dead
code** (the clause cannot decide any outcome), and say which. A guard whose
deletion leaves every test green is one of those two things, and the
difference matters to the author. Where a survivor mirrors a pre-existing gap
rather than something the PR introduced, say so — and label the whole set as
completeness reporting, not merge conditions, unless one of them is load-bearing.

Watch for the subtler failure: **a test that passes for the wrong reason.**
If deleting the new guard leaves its own new test green, that test is pinned
by something else (an earlier early-return, a different branch) and asserts
nothing about the change. Name what actually pins it.

**And the failure one level earlier: the scenario never reached the code
under test.** A vacuity check asks whether the assertion can fail; this asks
whether the code ever ran. Instrument the seam and count — requests the fake
peer actually received, invocations of the function under test, frames
rendered — then assert that count is non-zero. Worked example: four abort
cases in an E2E suite fired their aborts during **CLI process startup**, so
`modelRequestsSeenByFakeServer` was `0` and `messages` empty; a suite named
for aborting mid-stream never streamed. Every assertion passed. Fixing the
race also restored the coverage the tests were named for
(`modelRequestsInFlightAtAbort=1`), which is the tell that the original
green meant nothing.

The mirror of it: **count at the destination, not at the component
boundary.** What a component emits and what survives to the end of the
pipeline are different numbers, and the gates live in between — "envelopes
the adapter emitted" versus "prompts that actually reached the agent" differ
by every filter on the path. Assert the number a user would experience; a
count taken at the seam can be right while the feature is silently dropped
downstream.

**Timing-triggered assertions have a threshold — measure it, do not sample
it.** When an assertion's outcome depends on a wall-clock timer racing an
operation whose duration you do not control (`setTimeout(() => abort(), 1000)`
against a query bounded by process startup, not by the server), the test
encodes a margin nobody has measured. Measure the operation's natural
duration directly — run the scenario with the trigger disabled — and compare
it to the timer. If the distribution crosses the threshold, the test fails on
every machine on the fast side of it. A green run proves only that _this_ box
was slow enough.

This matters most because **a speed-correlated failure is not flake, and a
retry budget does not absorb it.** Ordinary flake is random, so `retry: 2`
converts it to a pass; a failure driven by machine speed is fully correlated
across attempts — measured on a real PR as 5/5 runs failing all three
attempts. Before writing off an intermittent failure as flake, establish
which kind it is: in local mode, repeat under load and idle, and report the
natural durations alongside the outcomes. The two get opposite verdicts —
flake is a note, a speed-correlated failure is blocking. Make that blocking
verdict expressible in the contract by encoding the margin as a scripted
assertion: measure the natural duration N times and assert it stays on the
side the test needs (here `min(duration) > timer`, because the test fails on
the fast side). A distribution that crosses the threshold then lands in
`fail`, and the existing rule (nonzero `fail` ⇒ not `merge-ready`) carries
the verdict without a special case.

Note the CI verify job runs on a **shared, loaded** runner, which is the
regime where such a test passes. You cannot reproduce a fast-machine failure
here by repetition; you can only compute the margin and say what it implies.

**Before calling a survivor vacuous, escalate to a finer mutation.** A
whole-file revert is a blunt instrument: it can remove the _precondition_ a
test depends on, so a perfectly good test goes green because its scenario no
longer occurs — indistinguishable, from the outside, from a test that asserts
nothing. Worked example: a `finally`-cleanup test survived reverting all four
production files, which read as vacuity; deleting the single line
(`inFlightSessionIds.delete(...)`) killed it cleanly. It was doing exactly the
job it was added for. Coarse mutation survived, fine mutation killed ⇒ the
test is fine and the mutation was wrong. Report the finer result, not the
coarse one — a false "your test is vacuous" costs the author more than a
missed survivor.

And do not generalize from one dead guard to its siblings. A clause that is
unreachable in one call path may be the only thing protecting another —
check each on its own evidence and report the contrast, so "this guard is
dead" is not read as "remove them all".

**The reverted run must FAIL THE INTENDED ASSERTION** with the behavioural
mismatch the test exists to catch. A revert that breaks the import, the
compile, or the fixture setup produces a red test that proves nothing — an
always-true assertion would look equally "non-vacuous". Quote the failure
message and check it names the expected-versus-actual values; if the revert
cannot reach the assertion, use an interface-preserving mutation (change the
returned value, not the export's existence) or record the vacuity check as
inconclusive.
