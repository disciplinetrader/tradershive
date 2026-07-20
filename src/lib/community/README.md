# Community

Posts, comments and reputation.

## Server surface

`src/lib/community.functions.ts` — post/comment CRUD, reputation
updates, reporting.

## Files

- `constants.ts` — Post kinds, reputation weights, moderation states.

## Data model

- `community_posts` — root posts (can embed a `shared_content` snapshot
  from the Sharing module).
- `community_comments` — threaded replies.
- `community_reactions` — likes / other reactions; drives reputation.
- `user_reputation` — projected score per user, updated by triggers on
  reactions and comment activity.

## Rules

- Anonymous read is allowed via a narrow `TO anon SELECT` policy on
  public posts. Writes require `authenticated`.
- Reports go to the admin queue (see `src/lib/admin/`).
