-- Register Bybit as a market provider, so the admin health-check UI can probe it.
--
-- Crypto historical data moved from Binance to Bybit because Binance cannot be
-- reached from this deployment. CX-1 is a 403 with an HTML body to the worker's
-- egress on BOTH `api.binance.com` and `data-api.binance.vision`, confirmed
-- 2026-08-28 via `/api/public/hooks/egress-probe`; Bybit answered the identical
-- probe with 61 real 1m klines in 85ms. The block is Binance-specific, not a
-- generic cloud-IP restriction — which is the whole reason a different exchange
-- is a fix rather than a workaround.
--
-- `binance` is deliberately LEFT ENABLED and is not removed. It still serves
-- LIVE crypto quotes, and that path is not blocked because it runs in the
-- user's BROWSER (`providers/binance.ts` disables itself when
-- `typeof window === "undefined"`), on a residential IP that Binance answers
-- normally. Only the server-side historical import is affected. Disabling the
-- row here would break working live quotes to fix nothing.
--
-- This row is catalog only. Routing lives in `historical/routing.ts`, and
-- nothing reads this table to choose a provider.
--
-- Applied by hand in the Lovable SQL editor on 2026-08-28.

INSERT INTO public.market_providers (code, name, is_enabled)
VALUES ('bybit', 'Bybit', true)
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name,
      is_enabled = EXCLUDED.is_enabled;
