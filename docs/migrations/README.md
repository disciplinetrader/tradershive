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
