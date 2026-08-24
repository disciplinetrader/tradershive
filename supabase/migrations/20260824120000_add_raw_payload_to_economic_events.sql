-- Keep the provider's original record alongside the normalised row.
--
-- Both calendar sources publish a rolling forward window and neither offers a
-- backfill request, so a week that rolls off cannot be re-fetched. Without the
-- payload, a mapping fixed later (a new Chinese title, a corrected currency)
-- can only be applied to rows fetched after the fix. With it, the whole table
-- can be re-derived in place.
ALTER TABLE public.economic_events ADD COLUMN IF NOT EXISTS raw_payload jsonb;
