# Replay Studio — Phase 1 ("the analytics competitors advertise")

State as of 2026-08-18. Phase 1 came out of the same competitor study as
Phase 0, but where Phase 0 was "wire what already exists", Phase 1 is the two
post-session analytics surfaces FX Replay leads with. Both are now done.

| # | Item | State |
| --- | --- | --- |
| — | Rate-metric reliability gate | **Done** — `4bbcb723`, in the shared engine |
| 1 | Performance calendar (per-market-day P/L) | **Done** — `40f7ced3`, confirmed in-app |
| 2 | Monte Carlo projection on `/replay/review` | **Done** — confirmed in a real browser |

**Phase 1 is complete.** Multi-chart replay and the economic calendar overlay
were on the competitor study's list but are not Phase 1; they remain open.

---

## Item 2 — Monte Carlo on the review surface (DONE)

### What was already there

`src/lib/analytics/monte-carlo.ts` — a complete bootstrap engine with a
deterministic PRNG (mulberry32), percentile envelopes, drawdown, losing streaks
and risk of ruin. Reachable from exactly one place: the Portfolio Analytics
workspace, through `MonteCarloSection`, which read the filtered sample out of
`useAnalyticsWorkspace()`. Replay Review had no projection at all.

So, as in Phase 0 item 2, this was not "build Monte Carlo". It was mounting an
engine on a second surface.

### The coupling question, and how it resolved

`MonteCarloSection` was **not** reusable as it stood — it read its sample from
workspace context, which Replay Review has no access to. But the coupling was
one line deep: the whole component was presentational apart from that read.

Resolved by **extraction, not a fork**, which is the rule this codebase keeps
paying to relearn (five session modules, two P&L formulas — see BA-10):

- `components/analytics/MonteCarloPanel.tsx` — presentational, props-driven
  (`pnls`, `startingBalance`, `footnote`). Owns the chart, the simulation and
  horizon controls, and the odds table.
- `portfolio/MonteCarloSection.tsx` — now nothing but the workspace adapter.
- `ReviewView`'s `SessionMonteCarlo` — the review adapter, memoising `pnls` on
  the query's trade array so panning the controls does not re-bootstrap
  thousands of paths on every parent render.

One projection implementation, two adapters. A session read on the review page
and the same trades read through the account filter cannot disagree.

Mounted as a **Risk** tab rather than appended to Summary: the chart is heavy
and Summary is already long, and a tab keeps it off the default render path.

The only product change beyond the mount is a `footnote` prop, because the
account-wide caveat ("the filtered sample") is the wrong sentence for one
session. Review states the sample is small and says what it does and does not
answer.

### Verification — the numbers, not "a number appeared"

A Monte Carlo is the one place where a broken implementation still prints
plausible figures. Nobody can eyeball whether a 5th-percentile outcome of
−$713 is right. So nothing here was checked against the engine's own output.

Three independent methods produced the expected values first:

1. **Exact DP convolution** of the 12-fold bootstrap sum — closed form, no
   sampling. Gives the true final-P/L quantiles and P(profit).
2. **Exact DP over the longest losing run** — gives the streak row exactly.
3. **A separately written 400k-path simulator** on `Math.random`, for the
   drawdown statistics, which have no closed form. Different algorithm,
   different RNG, so agreement is evidence rather than tautology.

Tolerances are three standard errors at 1,000 paths, computed from the sample's
own dispersion — not padding chosen to make it pass.

Sample: 12 seeded BTC/USDT trades, six winners and six losers, net +228.25,
starting balance 10,000.

| Row | Predicted | Rendered | Off by |
| --- | --- | --- | --- |
| Chance of profit | 64.95% ± 4.53 | 63.0% | −1.95pp |
| Median outcome | 223.75 ± 69 | 195.50 | −28.25 |
| Bad case (5th pct) | −713.25 ± 117 | −730.01 | −16.76 |
| Good case (95th pct) | 1186.75 ± 124 | 1137.79 | −48.96 |
| Median max drawdown | 415.50 ± 45 | 436.00 | +20.50 |
| 95th pct drawdown | 945.50 ± 95 | 910.67 | −34.83 |
| Losing streak | 3 / 6 (exact) | 3 / 6 | — |
| Risk of ruin | 0.0% (exact) | 0.0% | — |

Risk of ruin is exact and load-bearing: the worst possible 12-trade path is
12 × −240 = −2,880, which cannot take a 10,000 balance to the 5,000 ruin line.
Anything but 0.0% would mean the ruin test measures against the wrong base.

### The one thing that looked like a bug and was not

All three final-P/L quantiles came in **low together**, and the drawdown median
came in high — consistent with paths being slightly worse than the true
distribution. That is exactly what a sampler with an unreachable array index
would look like.

It is also exactly what one unlucky seed looks like, because every statistic in
a run shares that seed and therefore moves together. A single run cannot tell
the two apart.

Separated by averaging across 200 independent seeds: the mean of the medians
converges on 223.75, the mean of the means on 228.25, and P(profit) on 64.95%.
And a marker sample of distinct powers of two proves the first draw's p5 is
2⁰ and its p95 is 2¹¹ — both ends of the array are reachable. The engine is
unbiased; the seed was unlucky. Both checks are now pinned in
`__tests__/monte-carlo.test.ts` rather than left as a note.

### What the browser check does and does not prove

`e2e/ui/replay-monte-carlo.spec.ts` drives real Chromium against the real app
and a real Supabase project. It seeds a session's closed trades, asserts the
rendered figures against the intervals above, and deletes both the session and
its trades in `afterAll` — the database is left exactly as found.

Because the trades are seeded rather than hand-traded, what this proves is the
**review** path: rows → `buildSessionReview` → summary → the mounted panel.
Studio's write path is covered by its own specs.

It also pins the gate on the surface and not only in the engine: a nine-trade
session — one short of `MIN_MONTE_CARLO_SAMPLE` — renders the reason and em
dashes rather than a confident-looking envelope off nine trades.

---

## Item 1 — performance calendar (DONE)

Shipped in `40f7ced3`. `ReplaySessionSummary.days` is one `groupBy` + `dayKey`
call on the shared engine, rendered as a strip of the session's own market days
rather than a month grid, anchored in UTC.

**The bug it exposed was wider than the calendar.** Every mutator in
`chart/orders/service` takes `now`, defaulting to `Date.now()`. Studio omitted
it at all four manual call sites while the engine path already passed
`tick.time`, so one session's trades landed in two eras — a stop-out dated to
the replayed July bar, a hand-closed trade dated to today.

The calendar is what made it visible, but the calendar was not the damage.
`duration` is exit minus entry, so a trade held five minutes recorded as six
weeks, feeding `averageHoldSeconds` and every hold-time comparison built on it.
Nothing downstream of that looks implausible enough to question, which is why
it could have sat there indefinitely.

Found because the fifth of five stated predictions failed and the failure was
the feature rather than the prediction.

---

## Still open

- **Multi-chart replay** and the **economic calendar overlay** — on the
  competitor study's list, not scoped into Phase 1.
- **E2E-1** — the UI suite fails as a suite while its specs pass individually.
- **MS-1** — the session rule has no concept of weekends.
