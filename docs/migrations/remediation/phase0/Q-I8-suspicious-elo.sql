-- Q-I8 — Suspicious ELO / battle stats vs history
-- Source: _bmad-output/planning-artifacts/phase-0-readonly-queries.sql (query 51 of 61, commit 01c242f2)
-- READ-ONLY: single SELECT/WITH statement. No writes, no DDL, no secret values.
-- Run alone in the Lovable SQL editor. Save result per docs/migrations/remediation/phase0/README.md.

-- Q-I8  Suspicious ELO / battle stats vs history
WITH last_elo AS (
  SELECT DISTINCT ON (user_id) user_id, elo_after FROM public.elo_history ORDER BY user_id, created_at DESC),
res AS (
  SELECT r.user_id,
         count(*) FILTER (WHERE b.ranked) AS ranked_results,
         count(*) FILTER (WHERE b.ranked AND r.final_rank = 1) AS ranked_wins
    FROM public.battle_results r JOIN public.battles b ON b.id = r.battle_id GROUP BY r.user_id)
SELECT p.id AS user_id, p.username, p.elo, p.peak_elo, le.elo_after AS last_history_elo,
       p.battles_played, res.ranked_results, p.battle_wins, res.ranked_wins,
       p.current_battle_streak, p.best_battle_streak,
       CASE WHEN le.user_id IS NULL AND coalesce(p.elo,1000) <> 1000 THEN 'elo_changed_without_history'
            WHEN le.user_id IS NOT NULL AND p.elo <> le.elo_after      THEN 'elo_differs_from_history'
            WHEN coalesce(p.battle_wins,0) > coalesce(res.ranked_wins,0) THEN 'wins_exceed_results'
            WHEN coalesce(p.battles_played,0) > coalesce(res.ranked_results,0) THEN 'played_exceeds_results'
            WHEN p.peak_elo < p.elo THEN 'peak_below_current'
            WHEN coalesce(p.best_battle_streak,0) > coalesce(res.ranked_wins,0) THEN 'streak_exceeds_wins'
       END AS anomaly
  FROM public.profiles p
  LEFT JOIN last_elo le ON le.user_id = p.id
  LEFT JOIN res ON res.user_id = p.id
 WHERE (le.user_id IS NULL AND coalesce(p.elo,1000) <> 1000)
    OR (le.user_id IS NOT NULL AND p.elo <> le.elo_after)
    OR coalesce(p.battle_wins,0) > coalesce(res.ranked_wins,0)
    OR coalesce(p.battles_played,0) > coalesce(res.ranked_results,0)
    OR p.peak_elo < p.elo
    OR coalesce(p.best_battle_streak,0) > coalesce(res.ranked_wins,0)
 ORDER BY p.elo DESC NULLS LAST
 LIMIT 200;
