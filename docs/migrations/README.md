# Hand-applied migrations

These are **not** `supabase/migrations/` files and are deliberately not
timestamped: nothing applies them automatically. They are pasted by hand into
the Lovable SQL editor, one statement at a time, because that editor truncates
long pastes mid-statement and still reports success.

Kept here rather than in a scratch directory so the applied/unapplied state
survives the session that wrote them.

| File | Status |
|---|---|
| `tag-consolidation-chunks.sql` | ✅ applied 2026-08-11 (chunks 1, 1B, 2–12) |
| `journal-observation-cursor.sql` | ✅ applied — J-1/J-2 on 2026-08-12, J-3 via `j3-statement.sql` |
| `journal-batch-2-5.sql` | ✅ applied 2026-08-12 (B-1 … B-6, statement by statement) |
| `j3-statement.sql` | ✅ applied 2026-08-12 — J-3 alone, isolated after three truncated chat pastes |
| `j3-verify.sql` | its two verifies |
| `order-ticket-exits.sql` | annotated reference — **do not paste from it** |
| `order-ticket-exits/ot-{1..6}.sql` | ✅ applied 2026-08-12 — one bare statement each, verified individually |
| `order-ticket-exits/ot-{7..9}.sql` | ✅ applied 2026-08-12 — leg cap + allocation trigger, behaviourally verified |
| `order-ticket-exits/ot-{1..9}-verify.sql` | their verifies, one per statement |
| `historical-sync-cron.sql` | annotated reference — **do not paste from it** |
| `historical-sync/hs-0-precondition.sql` | ✅ run 2026-08-21 — 6 jobs, secret_len 64, clean start |
| `historical-sync/hs-1-schedule.sql` | ✅ applied 2026-08-21 — jobid 23 |
| `historical-sync/hs-2-verify.sql` | ✅ verified 2026-08-21 — 7 jobs, active, secret_matches |
| `historical-sync/hs-3-jobs.sql` | ⏳ evidence from `historical_import_jobs`, not from the fire response |
| `historical-sync/hs-4-depth.sql` | ⏳ depth growing; run at apply time and again the next day |
| `historical-sync/hs-census.sql` | rows per timeframe — separates "no 1m data yet" from "hs-4's filter is wrong" |
| `historical-sync/hs-fix-disable-gated.sql` | ✅ applied 2026-08-21 — MD-7, 7 rows disabled |
| `historical-sync/hs-fix-dax.sql` | ✅ applied 2026-08-21 — GER40 repointed off `DAX` |
| `historical-sync/hs-fix-verify.sql` | ✅ verified 2026-08-21 — twelvedata 18/25, binance 8/8 |
| `historical-sync/hs-fix-add-etfs.sql` | ⏳ adds SPY/QQQ/DIA/IWM; expect 4 rows back |
| `historical-sync/hs-hd3-check.sql` | ⏳ HD-3 — any `front_edge_stale = true` is pre-deploy damage |
| `historical-sync/hs-hd3-repair.sql` | ⏳ HD-3 — one-time front-edge repair, no-op once clean |
| `historical-sync/hs-rollback.sql` | unschedule |
| `economic-calendar-raw-payload.sql` | ✅ applied 2026-08-24 — `economic_events.raw_payload`; column verified live |
| `economic-calendar/ec-1-xoomar-rows.sql` | ✅ run 2026-08-24 post-fix — 14 rows, 9 with actual, 5 without, 14 with payload, 2026-06-05..2026-10-02. (First run, pre-fix, returned 0: the 90-day window had not yet synced — superseded) |
| `economic-calendar/ec-2-filtered.sql` | ◐ run 2026-08-24 — empty, pre-trigger. `net._http_response` is TTL-pruned, so run it soon after a sync |
| `economic-calendar/ec-3-lookahead.sql` | ✅ run 2026-08-24 post-fix — empty, and NOT vacuous: the same sync reported `filtered: 9`, so 9 look-ahead records were actively refused and none reached the table. **This is the pass condition.** (First run was empty over 0 rows and proved nothing — superseded, kept because "empty because nothing was checked" and "empty because the filter held" look identical and are not) |
| `economic-calendar/ec-4-trigger-fire.sql` | ✅ run 2026-08-24 — fired, request_id 86212; secret read from `cron.job`, no substitution |
| `economic-calendar/ec-5-trigger-read.sql` | ✅ run 2026-08-24 — returned row 86212; confirmed the `xoomar` key, i.e. the deploy is live |
| `historical-sync/hs-hd4-errors.sql` | ⏳ HD-4 — failure classes for cron/cron:backfill, last 24h |
| `historical-sync/hs-hd4-verify-jobs.sql` | ⏳ HD-4 — job health, last 24h |
| `historical-sync/hs-hd4-verify-logs.sql` | ⏳ HD-4 — sync logs, last 2h; joins `historical_import_jobs` for `triggered_by` |

**Tracking an unapplied migration.** A new table goes in
`scripts/pending-tables.json` between writing the migration and applying it.
`check:schema` separates "this table does not exist" from "this table is
unreadable" and **fails on the first** unless it is listed there — the two used
to share one quiet bucket, which meant the checker written to catch silent
migration failures could not see the most obvious one. Remove the entry once
applied; `check:schema` fails if a listed table already exists, so the list
cannot become a permanent exemption. The file is currently empty, which is the
correct steady state.

**Constraints and triggers are not covered by any checker.** `check:schema`
compares columns only, so a CHECK constraint or trigger that was never pasted
is invisible to it — there is no equivalent of the pending-tables gate for
them. The only defence is a behavioural test: attempt the write the constraint
is supposed to reject and confirm the rejection, and confirm it comes from the
right constraint. OT-7 initially appeared to pass while the *allocation
trigger* was doing the rejecting; it took an isolated test with allocation
headroom to actually exercise the idx cap (error `23514`, constraint
`paper_trade_exits_idx_max`, rather than the trigger's `P0001`).

`j3-statement.sql` contains **one statement and nothing else** — no comments, no
verify, no trailing prose. Open it, select all, copy, paste. Chat mangled this
one three times; a bare file removes the transport.

Each file carries its own apply order and a VERIFY query per statement. Run the
statement alone, then its verify alone. A block success means nothing.

After applying, run `bun run check:schema` — it validates `types.ts` against the
live database and is the only thing that caught the silent failure above.

See `docs/journal-progress.md` for the current state.
