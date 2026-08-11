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
| `journal-observation-cursor.sql` | ✅ applied 2026-08-11 (J-1 … J-4) |
| `journal-batch-2-5.sql` | ❌ **not applied** — pasted once, reported success, did not run |

Each file carries its own apply order and a VERIFY query per statement. Run the
statement alone, then its verify alone. A block success means nothing.

After applying, run `bun run check:schema` — it validates `types.ts` against the
live database and is the only thing that caught the silent failure above.

See `docs/journal-progress.md` for the current state.
