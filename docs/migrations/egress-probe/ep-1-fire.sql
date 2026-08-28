-- Fire the egress probe from the DEPLOYMENT. GET, not POST.
--
-- The endpoint measures what this deployment's egress can reach
-- (data-api.binance.vision, api.bybit.com, api.binance.com). The whole point is
-- that it runs there and not from a laptop — CX-1 is a block on the origin IP,
-- so a local curl answers a different question.
--
-- 45s: the handler probes three targets serially at up to 10s each.
select net.http_get(
  url := 'https://tradershive.lovable.app/api/public/hooks/egress-probe',
  headers := format('{"x-cron-secret":"%s"}', s.secret)::jsonb,
  timeout_milliseconds := 45000
) as request_id
from (
  select substring(command from '"x-cron-secret"\s*:\s*"([^"]+)"') as secret
    from cron.job
   where command like '%x-cron-secret%'
   limit 1
) s
where s.secret is not null;
