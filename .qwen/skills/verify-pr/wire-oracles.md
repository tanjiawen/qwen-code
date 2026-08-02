# Wire-oracle harnesses

- Mock-free with respect to the unit under test: real child processes, real
  loopback HTTP/stdio servers, the compiled `dist/` output — never a stub of
  the code being verified.
- When the code under test implements a **known specification or emulates
  another implementation**, the strongest oracle is that implementation
  itself, not hand-written expectations: feed identical input to both and
  compare output cell by cell / field by field, and report the disagreement
  counts for head and base (`PR disagrees on 0 cells, base on 3764`). Lift
  reference tables **verbatim out of the shipped dependency** rather than
  transcribing them. Build the corpus from **bytes captured off a real
  producer** (`git diff --color=always`, a real API response, a real file)
  alongside the synthesized sweeps — real producers emit combinations nobody
  thinks to synthesize.
- Prefer **configuration seams** (a `baseUrl`, an env var, an injectable
  endpoint) over module interception, so a real client talks over real
  sockets. Make the fake peer encode the upstream's actual semantics — the
  rate-limit header format, an unread-only listing, an account-wide or
  asynchronous side effect — because a generous mock that accepts anything
  proves nothing. Add a decoy target wherever "the wrong endpoint was never
  contacted" is part of the claim.
- Assert **both sides of the wire** where a protocol is involved: what the
  peer actually received (method, path, headers, exact body, request count)
  and what the caller observed — plus that stderr stayed clean.
- **When the oracle is an instrument, corroborate it with a mechanism that
  does not use that instrument.** A tool's _report_ about the system is not
  the system: a cursor query, a profiler number, a coverage percentage can
  each be wrong in ways your assertion cannot see. Find a second effect of
  the same physical fact whose failure mode is independent. Worked example:
  the hardware cursor row was read with
  `tmux display-message -p '#{cursor_y}'`, then confirmed by letting the TUI
  exit and printing a marker — anything printed after exit lands wherever the
  cursor actually was, so the marker's row corroborates the query without
  trusting it. Two agreeing instruments turn a measurement into evidence.
- **To exercise real production data safely, interpose a refusing proxy on
  the write path.** Read-only claims about a live system are best tested
  against that system, and the objection is always side effects. Remove it
  mechanically: wrap the client so every mutating call hard-fails, then run
  the shipped script verbatim. A workflow verified this way returned real
  counts (1085 unminimized comments, `rateLimit.cost = 2`) with a guarantee
  no write could occur — stronger evidence than a fixture and safer than a
  careful hand. Say in the report which wrapper enforced it.
- Every assertion is a scripted comparison that can fail. Keep harnesses as
  `.mjs` files inside the artifact dir so a maintainer can rerun them.
