-- RS-4 Stage A follow-up: a closed trade may have NO risk measurement.
--
-- Stage A made a market order's stop and target optional, so a position can be
-- opened, held and closed without either. Two DERIVED columns then have nothing
-- to report:
--
--   initial_risk_distance  |fill - initial stop|  -- no stop, no distance
--   realized_r             net / risk amount      -- no basis, no R
--
-- Both were NOT NULL DEFAULT 0. Writing 0 was never an option: 0 is a real
-- measurement (a zero-distance stop, a flat result), and this table is the
-- durable record the journal and every analytic read. A fabricated 0 here is
-- uncorrectable once booked.
--
-- So the application began writing NULL, and every stopless close 400'd. The
-- write result was discarded (`await supabase...` with no `{ error }` read), so
-- it failed silently through a full unit suite, a full Playwright suite and a
-- publish. One real trade was lost that way before it was caught. The silence
-- is fixed in `replay-trade-sync.ts`; this is the schema half.
--
-- `risk_amount` deliberately stays NOT NULL: it is an AMOUNT, and 0 has always
-- been this file's honest value for "no basis" there. Only the two measurements
-- become nullable.
--
-- Applied by hand in the Lovable SQL editor on 2026-08-26 and verified by
-- writing a row with both columns NULL (scripts/verify-nullable.ts) — the
-- editor has been observed reporting success on a truncated paste, so
-- "reported applied" is not the same claim as "applied".

ALTER TABLE public.chart_closed_trades
  ALTER COLUMN initial_risk_distance DROP NOT NULL,
  ALTER COLUMN realized_r            DROP NOT NULL;
