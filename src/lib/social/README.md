# Social

Leaderboards, leagues, follows and public profiles — all computed from
real platform activity, never hardcoded.

## Files

- `constants.ts` — League tiers (Bronze → Legend), promotion/demotion
  thresholds, leaderboard scopes.
- `calculations.ts` — Ranking math. Combines P/L, win rate, discipline
  score, streaks and XP into a composite ranking used by all
  leaderboards (Global, Country, Friends, League).

## Server surface

`src/lib/social.functions.ts` — rank queries, profile lookups, follow
graph mutations.

## Data sources

Every ranking derives from live tables:
- Paper Trading closed trades
- Journal completion
- Challenge outcomes
- XP / Achievements
- AI-generated discipline score

No mock ranking logic anywhere.
