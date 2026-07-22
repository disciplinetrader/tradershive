
# Phase 6 — Community Evolution & Social Trading

Additive expansion on top of the existing Community (`/community`), Sharing, Social (follow/leaderboard), Gamification (achievements), and Analytics modules. No changes to Trading Engine, Yahoo Finance, or the current visual system — all new UI reuses existing primitives (`GlassCard`, `PageContainer`, `SegmentedTabs`, `EmptyState`, `PostCard`).

## Scope split

Some listed sub-features already exist in earlier phases and will be **reused, not rebuilt**:
- Follow system → `src/lib/social.functions.ts` + `FollowButton`
- Profile 2.0 → `ProfileHero`, `ActivityTimeline`, `CustomizeProfileDialog`
- Achievements → gamification module
- Notifications → `community_notifications` + `notification_preferences`
- Moderation → `community_reports`, `user_moderation`, admin queue
- Reputation → `community_reputation` (triggers already scoring reactions/comments)
- Post/Comment feeds, reactions, bookmarks, hashtags, trending → existing

New work below fills the actual gaps.

## 1. Data model (single migration)

New tables (all with `GRANT` + RLS + `service_role` grant, indexed on lookup cols):

- `trade_ideas` — instrument, direction, timeframe, entry, sl, tp, rr, chart_url, tv_url, replay_session_id, journal_entry_id, strategy_id, tags[], notes, status (`open|closed|win|loss|cancelled`), pnl_pct, author_id, visibility, post_id (link into `community_posts` for feed), timestamps.
- `trade_reviews` — reviewer_id, target_type (`trade|journal|replay|idea`), target_id, scores jsonb (entry, exit, risk, patience, discipline, chart), suggestions, created_at. Reactions/comments reuse existing `community_reactions` + `community_comments` polymorphically (already `entity_type`).
- `mentor_profiles` — user_id PK, headline, bio, specialties[], markets[], languages[], hourly_rate, availability jsonb, verified bool, rating numeric, reviews_count, active bool.
- `mentor_assignments` — mentor_id, mentee_id, status (`pending|active|paused|ended`), plan jsonb, started_at, ended_at.
- `mentor_homework` — assignment_id, title, description, due_at, status, submission jsonb, feedback.
- `study_groups` — id, slug, name, description, avatar_url, banner_url, visibility (`public|private|invite`), owner_id, member_count, tags[], created_at.
- `study_group_members` — group_id, user_id, role (`owner|admin|mentor|member`), joined_at.
- `study_group_messages` — group_id, user_id, body, attachments jsonb, reply_to, created_at (realtime enabled).
- `study_group_resources` — group_id, kind (`replay|journal|idea|challenge|note`), ref_id, added_by, note, created_at.
- `live_sessions` — host_id, title, description, instrument, session_type (`analysis|review|q_and_a|workshop`), start_at, end_at, stream_url, replay_url, group_id nullable, status (`scheduled|live|ended|cancelled`), attendee_count.
- `live_session_attendees` — session_id, user_id, rsvp (`going|maybe|declined`), attended bool.
- `community_challenges` — slug, title, description, kind (`risk|profit_factor|replay_hours|journal|consistency|session|replay`), start_at, end_at, metric jsonb (definition of score), rewards jsonb, visibility, status.
- `community_challenge_entries` — challenge_id, user_id, score, rank, computed_at, breakdown jsonb.
- `search_index` — materialized denormal view or table with (kind, ref_id, title, subtitle, tags[], author_id, ts tsvector); refreshed by triggers on inserts to posts/ideas/replays/journals/strategies/challenges/users.

Reputation weights extended (new `reputation_events` insert-only ledger already implied by existing `community_reputation`; add event kinds: `review_authored`, `mentor_feedback`, `study_group_help`, `challenge_participation`, `daily_activity` with dedupe + anti-spam caps per day).

## 2. Server functions

New files under `src/lib/`:
- `trade-ideas.functions.ts` — create/update/list/close, auto-mirror into `community_posts` (kind=`trade_idea`) so ideas surface in feed. Close-with-outcome updates status + pnl_pct.
- `trade-reviews.functions.ts` — submit review, list for target, aggregate rating; awards reputation via ledger.
- `mentors.functions.ts` — CRUD mentor profile, request/accept/end assignment, homework CRUD, list mentor directory.
- `study-groups.functions.ts` — CRUD groups, join/leave, invite, list; messages send/list (paginated), resources add/list, presence via realtime channel `study-group-{id}`.
- `live-sessions.functions.ts` — CRUD, RSVP, mark attended, list upcoming/live/past.
- `community-challenges.functions.ts` — list, join, compute leaderboards by calling existing analytics/replay/journal aggregators; scheduled via `pg_cron` calling a server route `/api/public/hooks/community-challenges-tick`.
- `search.functions.ts` — unified typed search across kinds using `search_index` FTS + trigram fallback.

All authenticated fns use `requireSupabaseAuth`; public read-only lists (mentor directory, public groups, upcoming sessions, active challenges) use publishable-key client with narrow `TO anon` SELECT policies.

## 3. Routes (all under `_authenticated/community/`)

Existing top-level community tabs stay; add:
- `community.index.tsx` → replace with **Community Home dashboard** (see below); move current tabbed feed to `community.feed.tsx` (with sub-tabs `latest|trending|following`, preserving current query-param compatibility).
- `community.ideas.tsx` — Trade Ideas board (filter by instrument, direction, status, tag).
- `community.ideas.$id.tsx` — single idea (chart preview, RR box, linked replay/journal, review thread).
- `community.ideas.new.tsx` — publish idea wizard (reuses `PostComposer` primitives + fields).
- `community.reviews.tsx` — review inbox/outbox (given, received, pending).
- `community.mentors.tsx` — mentor directory.
- `community.mentors.$username.tsx` — mentor profile + request-mentorship CTA.
- `community.mentorship.tsx` — my mentors/mentees dashboard (assignments, homework, notes).
- `community.groups.tsx` — study groups directory (create/join).
- `community.groups.$slug.tsx` — group workspace (chat, resources, members, group challenges/leaderboard, upcoming sessions).
- `community.live.tsx` — Live Session Hub (Upcoming / Live / Past).
- `community.live.$id.tsx` — session detail (RSVP, notes, replay after end).
- `community.challenges.tsx` — Community Challenges list.
- `community.challenges.$slug.tsx` — challenge detail + leaderboard + entry status.
- `community.search.tsx` — unified search results.

Sidebar (`app-shell.tsx`) unchanged; a new `CommunitySubnav` component lives inside `community.tsx` layout and is scrollable on mobile.

## 4. Community Home dashboard

Single page composed of existing cards + new ones, using `ResponsiveGrid`:
- Pinned Announcements (from existing `announcements` table)
- Recent Discussions (latest posts, reuses `PostCard`)
- Popular Trade Ideas (top ideas last 7d)
- Top Contributors (reputation leaderboard, from `community_reputation`)
- Active Challenges (community + championship)
- Upcoming Live Sessions
- Recent Achievements (from `user_achievements`)
- Trending Topics (existing `listTrending`)
- Community Statistics (member count, posts today, ideas open, replay hours shared) — computed via a single `community-stats` server fn with 60s cache.

## 5. Notifications

Extend `community_notifications.kind` enum with: `review_received`, `mentor_feedback`, `homework_assigned`, `group_message`, `group_invite`, `live_session_reminder`, `challenge_result`, `idea_closed`. Piggyback on existing notification preferences UI.

## 6. Moderation

Add `report_target_type` support for ideas/reviews/groups/live_sessions/messages in existing report flow. Admin queue picks them up automatically (audit already logs).

## 7. Realtime

Enable `supabase_realtime` for `study_group_messages`, `live_sessions`, `community_challenge_entries`. Client subscribes with `useEffect` cleanup pattern.

## 8. Performance

- All feeds keyset-paginated (cursor by `created_at,id`) — infinite scroll via `useInfiniteQuery` (already used by `FeedList`).
- Search hits `search_index` FTS with limit 30 and cursor.
- Community stats memoized server-side (5-minute cache table).
- No new SDKs; reuse existing bundle.

## 9. Design

Reuse `GlassCard`, `PageHeader`, `SegmentedTabs`, `EmptyState`, `Avatar`, `Skeleton`, `FollowButton`, `PostCard`. Idea cards get a compact "R:R" pill + status chip; mentor cards get verified badge + rating stars; group cards get member avatars stack; live-session cards get countdown pill (reuses `CountdownPill`). All colors from existing tokens (`--primary`, `--success`, `--danger`).

## 10. Technical notes

- Every new public-schema table ships with `GRANT` + RLS in the same migration.
- Ownership columns are `NOT NULL DEFAULT auth.uid()` where applicable; RLS `USING (author_id = auth.uid())` for writes; reads scoped to visibility.
- Zod validators on every server fn `.inputValidator`.
- No admin client usage outside verified webhooks.
- Route heads: each new route gets a unique `title`+`description` (SEO).
- All new client components strictly consume server-fn output; no direct browser Supabase writes.

Delivered in a single pass across schema → server fns → routes → home dashboard → sidebar/subnav.
