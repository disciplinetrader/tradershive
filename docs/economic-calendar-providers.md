# EC-1 — economic calendar provider options

Research report, 2026-08-20. **No code was written and nothing was changed.**
Same format as the earlier Twelve Data vs Finnhub evaluation: measured where
measurement was possible, sourced where it was not, and marked clearly which
is which.

---

## 1 · What the current feed actually costs us

Source: `https://nfs.faireconomy.media/ff_calendar_thisweek.json`.
All of the following was measured directly on 2026-08-20, not read from docs.

### The payload has no `actual` field at all

A live fetch returns 98 events whose every object is exactly:

```json
{"title":"BusinessNZ Services Index","country":"NZD",
 "date":"2026-08-16T18:30:00-04:00","impact":"Low",
 "forecast":"","previous":"50.6"}
```

`title`, `country`, `date`, `impact`, `forecast`, `previous`. **There is no
`actual` key.** This is worth stating precisely because EC-1 recorded it as
"measured 0 of 96", which reads like a field that happens to be empty and might
fill in later. It will not. The provider does not publish outcomes in this
feed, so `economic_events.actual` can never be populated from this source no
matter how often the cron runs.

**What that costs:** the overlay can show a trader that Non-Farm Payrolls was
scheduled at 12:30 with a forecast of 180k. It can never show that it printed
205k. The surprise — forecast versus actual — is the entire reason a calendar
moves price, and it is exactly the part a replay session needs in order to
explain what the tape did.

### Only one window exists

| File | Result |
|---|---|
| `ff_calendar_thisweek.json` | **HTTP 200**, 98 events |
| `ff_calendar_lastweek.json` | HTTP 404 |
| `ff_calendar_nextweek.json` | HTTP 404 |
| `ff_calendar_thismonth.json` | HTTP 404 |

One rolling week, forward only. There is no backfill request that can be made.

### But history DOES accumulate forward — this corrects EC-1

`ingest.server.ts:143` upserts on `(event_time, currency, title)` and **never
deletes**. So each daily run adds that week's rows and leaves prior weeks in
place. The table has been accumulating since the cron's first successful
unattended run.

So the deficit is **backwards only**, and it shrinks by one week per week. EC-1
states "no history" flatly; the accurate version is "no history *before*
2026-08-19, accumulating normally after it".

**The part that does not self-heal:** every row accumulated this way is
permanently `actual = null`. Waiting does not just delay actuals, it
manufactures a growing band of rows that have forecasts and no outcomes —
unless the eventual provider can backfill over the same range and overwrite
them. That single question is what decides whether waiting is free (see §4).

### Rate limiting

A 429 was observed during 2026-08-18 testing. Not a constraint in normal
operation — the job runs once a day — but it does mean the feed cannot be
hammered for a bulk backfill even if more windows existed.

### What is NOT missing

Worth being fair to the free feed: `impact` (High/Medium/Low) is present and
usable for high-impact-only filtering, `currency` maps cleanly onto the
overlay's `currenciesForSymbol`, and coverage spans the major currencies. The
schema in `economic_events` already has an `actual` column waiting. **The only
structural gaps are outcomes and backwards history.**

---

## 2 · Options, with what was verified

### Ruled out by direct measurement

| Provider | Test | Result |
|---|---|---|
| **Finnhub** | `/calendar/economic` with our live key | `{"error":"You don't have access to this resource."}` — not on our plan |
| **Twelve Data** | `/economic_calendar` with our live key | `404 page not found` — the endpoint does not exist |

Finnhub is the same shape as the earlier indices finding: the endpoint is
documented, we are not entitled to it. Twelve Data simply does not offer an
economic calendar, so the existing relationship cannot be extended to cover
this.

### EODHD — the strongest fit found

- **Fields:** `actual`, `estimate`, `previous`, plus `change` and
  `change_percentage`. Outcomes AND consensus.
- **History:** from **2020** — roughly five years, and critically it covers
  every date a replay session is likely to target.
- **Coverage:** ISO 3166 country filtering; 30+ countries, 50+ event types.
- **Access:** included in **Fundamentals Data Feed** and **All-In-One**.
- **Price:** Fundamentals **$59.99/mo**, or **$599.90/yr (= $49.99/mo)**.
  All-In-One $99.99/mo, $999.90/yr.
- **Limits:** 100,000 API calls/day, 1,000/min, 1 call per request.

Caution: the €19.99 "Corporate Events Calendar & News" package that appears in
search results is **corporate** events — earnings, splits, IPOs. It is not the
Economic Events API. The economic calendar requires the $59.99 tier.

### Trading Economics — the premium option

- **Coverage:** 196 countries, ~300,000 indicators, actual values from official
  sources, survey consensus, plus their own ARIMA forecasts.
- **History:** included at every paid tier.
- **Price:** Standard **$149/mo billed yearly**; Professional **$299/mo billed
  yearly** (adds streaming). Enterprise is custom.
- **Trial:** free, capped at 100 requests / 100,000 data points — enough to
  evaluate field shape and coverage before committing.

Confidence note: their pricing page would not render its tiers without a
session, so these figures come from third-party plan listings dated June 2026,
not from Trading Economics directly. Treat as indicative and confirm before
purchase.

### FMP — cheapest candidate, least verified

Has a documented economic calendar endpoint. I could not verify field shape or
pricing: the docs and pricing pages both returned HTTP 403, and the `demo` key
is rejected. Reported free tier is 250 requests/day; paid tiers are described
in third-party reviews in the **$29–$79/mo** range with 300 / 750 / 3,000
calls-per-minute for Starter / Premium / Ultimate.

**Everything in this paragraph is unverified.** If cost is the deciding factor,
FMP is worth ten minutes with a free API key to check whether its calendar
carries `actual` and how far back it goes — that is a measurement, and it would
either make FMP the answer or eliminate it.

### Alpha Vantage — probably not applicable

Offers economic *indicator time series* (GDP, CPI, unemployment as historical
series) rather than a release calendar with scheduled times, forecasts and
actuals. Not verified against a live key. Different shape of product; unlikely
to serve the overlay without substantial adaptation.

---

## 3 · The distinction that actually matters

EC-1 exists to serve the **replay overlay**, not a live calendar widget. So the
only question that separates the options is whether they can answer *"what was
scheduled, forecast and released on a date in the past"*.

| Provider | Forward schedule | Actual values | Backwards history | Serves replay? |
|---|---|---|---|---|
| faireconomy (current) | yes | **no** | **no** (accumulates forward only) | **no** |
| Finnhub | n/a — no access | n/a | n/a | n/a |
| Twelve Data | no endpoint | — | — | no |
| **EODHD** | yes | **yes** | **yes, from 2020** | **yes** |
| **Trading Economics** | yes | **yes** | **yes, deep** | **yes** |
| FMP | yes | unverified | unverified | unknown |

Only EODHD and Trading Economics are confirmed to do the job.

---

## 4 · Cost at our usage, and the timing question

**Volume is irrelevant to this decision.** The cron makes **one request per
day**. A full historical backfill of 2020→now would be a one-time batch —
a few hundred requests at most against EODHD's 100,000/day. No option's rate
limits come anywhere near binding. This is purely a subscription-cost question,
so the correct choice is the **cheapest plan that includes the endpoint**, not
the plan sized to our throughput.

Annualised:

| Option | Monthly | Annual |
|---|---|---|
| Stay free | $0 | $0 |
| EODHD Fundamentals (annual) | $49.99 | **$599.90** |
| EODHD Fundamentals (monthly) | $59.99 | $719.88 |
| Trading Economics Standard | $149 | ~$1,788 |
| FMP (if suitable) | ~$29–79 | ~$348–948 |

### The timing argument, which is the real finding

**Waiting is close to free, and that is a measured conclusion rather than a
preference.** EODHD serves history from 2020. Whatever the calendar table
accumulates — or fails to accumulate — between now and a subscription can be
backfilled and overwritten later, actuals included. Nothing is being lost
permanently that money cannot recover afterwards.

The one thing waiting does cost is that **the overlay stays forecast-only in
the meantime**, so any replay session run before a switch shows scheduled
events without outcomes, and any user-facing claim about calendar context has
to be hedged accordingly.

That flips the usual urgency: the question is not "how much data are we losing
each day we wait" but "how much is the overlay worth to users right now". Which
is a product judgement, and the reason this was always the product owner's
call.

---

## 5 · If a decision is wanted, the cheapest next step

Not a recommendation to buy — a recommendation to measure one more thing, for
free:

1. **Ten minutes on an FMP free key.** Confirm whether its economic calendar
   carries `actual` and how far back it goes. It is the cheapest candidate by a
   wide margin and the only one whose suitability is unknown. This either makes
   it the answer or removes it from the table.
2. **Trading Economics' free trial** (100 requests) if a comparison against
   EODHD's field quality is wanted before committing to a year.

If both are skipped, **EODHD Fundamentals at $599.90/year is the option to
beat**: it is the only verified provider that meets every requirement, and its
2020 history means a subscription bought in six months is worth the same as one
bought today.

---

## Sources

Measured directly against live APIs on 2026-08-20: faireconomy feed shape and
window availability, Finnhub `/calendar/economic` entitlement, Twelve Data
`/economic_calendar` existence.

Pricing and capability, from the web:

- [EODHD — Economic Events Data API](https://eodhd.com/financial-apis/economic-events-data-api)
- [EODHD — pricing](https://eodhd.com/pricing)
- [Trading Economics — API calendar](https://tradingeconomics.com/calendar/api)
- [Trading Economics — plan pricing (third-party listing)](https://apis.io/plans/tradingeconomics/tradingeconomics-plans-pricing/)
- [FMP — economic calendar endpoint](https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar)
- [FMP — pricing plans](https://site.financialmodelingprep.com/pricing-plans)
- [Finnhub — economic calendar endpoint](https://finnhub.io/docs/api/economic-calendar)
