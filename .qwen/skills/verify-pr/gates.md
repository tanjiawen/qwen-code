# Targeted gates

Run the affected workspace's tests (`npm run test -w …` or the workspace's
vitest) and cite exact counts. Never claim a repo-wide gate you did not run;
never re-run what the PR's own CI already covers unless your A/B needs the
number from a known-clean state.

**Prove the gate is live before citing it as evidence.** A linter that exits
0 because it matched no files looks exactly like a linter that passed: plant
a violation it must catch (an unused variable, a formatting break), confirm
it is reported, remove it. Quote that check alongside the clean result — an
unproven green gate is an assumption, not a measurement.

**Attribute pre-existing failures precisely.** "These failures also exist on
main" is only credible when the failing test _files and names_ are
byte-identical on both sides; show that comparison and the deltas
(`+9 passing, +0 failing`), not just the totals.

**When the PR's base is far behind, verify the merge, not only the PR.** A
clean A/B on a stale base says nothing about what lands. Do a trial merge
into current `main`, confirm it is conflict-free, and re-run the affected
suite on the merged tree; if `main` has touched any file this PR touches
since the merge-base, say so and re-measure there.
