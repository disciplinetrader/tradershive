# Journal

Trade journaling with auto-drafts from closed trades, screenshots, tags
and shareable public entries.

## Files

- `api.ts` — Client helpers wrapping journal server functions.
- `constants.ts` — Journal kinds, tag catalog, share visibility levels.
- `format.ts` — Field formatters (duration, RR, P/L display).
- `storage.ts` — Screenshot storage (Supabase Storage bucket) with
  signed-URL helpers.

## Auto-drafts

A Postgres trigger (`create_journal_draft_from_trade`) fires when a
paper trade closes and inserts a draft `journal_entries` row prefilled
with trade metadata. The user just adds narrative and publishes.

## Sharing

Public journal entries expose a token via the Sharing module and render
at `src/routes/journal.share.$token.tsx`. Sensitive fields are stripped
by `sharing/snapshot.server.ts` before publication.
