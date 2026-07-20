# Universal Sharing

A single share pipeline used by Journal, Trades, Battles, Strategies and
Achievements.

## Files

- `snapshot.server.ts` — Builds a normalized `shared_content` snapshot
  for any supported module. Snapshot includes the module kind, headline
  metrics (P/L, RR, win rate), and any redacted metadata safe to
  publish.

## Server surface

`src/lib/sharing.functions.ts` — create/revoke share links, resolve
tokens to snapshots. Public snapshot reads are proxied through server
functions so RLS never has to allow anon on the source tables.

## Route

`src/routes/journal.share.$token.tsx` — public renderer for shared
journal entries. Other module share views live under the appropriate
route trees.

## Rules

- Never share sensitive fields (broker keys, private notes). The
  snapshot builder is the enforcement point.
- Tokens are opaque, single-use-optional, and revocable.
