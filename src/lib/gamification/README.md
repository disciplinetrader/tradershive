# Gamification

XP, achievements, streaks and level progression.

## Files

- `constants.ts` — XP formulas, level thresholds, achievement catalog.
- `period.ts` — Period math (daily / weekly / monthly buckets) used by
  streaks and challenges.

## Server surface

`src/lib/gamification.functions.ts` — award XP, evaluate achievements,
maintain streaks.

## Rules

- XP awards are idempotent per (user, event_id) — replaying an event
  never double-awards.
- Achievements evaluate against live platform data. No manual grants
  outside the Admin Panel.
