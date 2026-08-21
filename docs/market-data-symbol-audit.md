# Market-data symbol audit

Every `is_enabled` row in `historical_symbols`, measured against the live
provider rather than inferred from its market class. **Measured 2026-08-21
06:20–06:33 UTC**, one `time_series?interval=1min` request per symbol.

Written because the exclusion list had already drifted once without anyone
noticing: `UNREACHABLE_SOURCES = ["binance"]` excludes a *source*, and the
seven broken Twelve Data symbols are not a source — they are individual rows
that no source-level filter can catch. GER40 in particular does not error at
all, so no amount of watching for 404s would have surfaced it.

## Why class membership is not evidence

Three pairs in the same market resolve differently:

| Same market | Works | Does not |
|---|---|---|
| metals | XAU/USD — Gold Spot, $4,554.69 | XAG/USD — plan-gated |
| indices | *(none in catalog)* | SPX500, NAS100, US30, GER40 |
| commodities | *(none)* | WTI/USD (plan), BRENT/USD (invalid) |

The entitlements note of 2026-08-14 recorded Twelve Data free as serving
"forex, metals, US equities, and the index ETFs". Measurement narrows that:
**one** of the two metals in this catalog serves.

## Twelve Data — 25 enabled, 18 working

| Symbol | Native sent | Result |
|---|---|---|
| AUD/JPY AUD/USD CHF/JPY EUR/GBP EUR/JPY EUR/USD | as-is | OK · Physical Currency |
| GBP/JPY GBP/USD NZD/USD USD/CAD USD/CHF USD/JPY | as-is | OK · Physical Currency |
| AAPL AMZN MSFT NVDA TSLA | as-is | OK · Common Stock · NASDAQ |
| XAU/USD | `XAU/USD` | OK · Precious Metal · $4,554.69 |
| WTI/USD | `WTI/USD` | **404 plan-gated** — Grow or Venture |
| XAG/USD | `XAG/USD` | **404 plan-gated** — Grow or Venture |
| SPX500 | `SPX` | **404 plan-gated** — Grow or Venture |
| BRENT/USD | `BRENT/USD` | **404 invalid ticker** |
| NAS100 | `IXIC` | **404 invalid ticker** |
| US30 | `DJI` | **404 invalid ticker** |
| GER40 | `DAX` | **200 — WRONG INSTRUMENT**, type=ETF, NASDAQ, $46.98 |

The three failure modes are not interchangeable. An account upgrade fixes the
plan-gated three and nothing else; the invalid-ticker three need a different
symbol or a different provider at any price; and GER40 needs neither, because
it is not failing.

## Binance — 8 enabled, 0 usable from the deployment

Excluded wholesale by `UNREACHABLE_SOURCES` (CX-1: permanent 403 to this
deployment's egress).

**Not re-measured here, deliberately.** A probe from a developer machine
returned HTTP 200 with live BTCUSDT klines — which is exactly what CX-1
predicts and is *not* evidence the deployment can reach it. The block is on
the origin IP, so this is the one reachability question that cannot be settled
from anywhere except the deployment itself. Re-test by way of the deployed
endpoint, never locally.

## The ETF proxies were never added

The 2026-08-14 decision was that indices are traded as the ETFs themselves —
SPY / QQQ / DIA / IWM, whose engine symbol already *is* the Twelve Data
ticker. **None of the four exist in `historical_symbols`.** Confirmed
2026-08-21: the table holds exactly 33 rows in all states, and a query for
`IWM,SPY,QQQ,DIA` returns `[]` — not disabled rows, no rows.

All four serve correctly, measured 2026-08-21 06:39 UTC:

| Proxy | Result |
|---|---|
| IWM | OK · ETF · NYSE · USD · $297.68 |
| SPY | OK · ETF · NYSE · USD · $762.64 |
| QQQ | OK · ETF · NASDAQ · USD · $710.95 |
| DIA | OK · ETF · NYSE · USD · $527.50 |

So none of them is failing, and none can be: nothing has ever requested them.
An absent row produces no import job, no error and no candles — which is
indistinguishable from "working" in every dashboard that counts failures.

So that decision was half-applied: the index mappings came out of `routing.ts`
and neither the broken index rows were disabled nor the replacement ETF rows
added. Disabling the four index rows (MD-7) completes the removal half. Adding
SPY/QQQ/DIA/IWM is a separate, unmade decision — they are not in the catalog to
be disabled or enabled, and adding them means deciding whether a proxy priced
at $46.98 should carry an index's name, which is precisely the confusion DAX
demonstrates.

## Credit accounting observed while measuring

Errors are not free. Twelve Data's per-minute counter reported 10–11 credits
used during a sweep paced at 4/min, because `historical-sync` was firing
concurrently — and its runs were producing nothing but 404s. So a gated symbol
still spends a credit.

That compounds through the retry loop: `runImport` retries 3 times with
exponential backoff before writing `phase: 'failed'`, so each failing symbol
costs **4 credits**, and a 2-symbol slice costs **8** — the entire per-minute
budget, spent near-instantly, every 15 minutes, for zero rows. Disabling the
seven is what stops that, and it takes effect on the next fire with no deploy.

## How to re-run this

`scripts/` has no runner for it; it was a paced curl loop over
`historical_symbols` where `is_enabled`. Pace at **20 s or slower** if the cron
job is live — the 8/min cap is account-wide, so a sweep and a scheduled run
collide. Read `type`, `exchange` and `close` on every success, not just the
status: GER40 is the case that proves a 200 is not a pass.
