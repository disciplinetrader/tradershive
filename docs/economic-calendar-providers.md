# EC-1 — economic calendar provider options

> ## STATUS 2026-08-24 · XOOMAR SHIPPED AS A SECOND SOURCE · FF UNCHANGED
>
> Supersedes the 2026-08-20 status below, which stands as the record of the
> paid-provider evaluation and is still the right answer if a paid feed is ever
> bought.
>
> **What shipped:** `xoomar.server.ts`, additive. ForexFactory remains the
> primary breadth source, unchanged, for every currency. Xoomar adds `actual`
> values for US high-signal releases — the field FF structurally never
> publishes. No cross-source dedup: both write independently tagged by
> `source`, so CPI/NFP/FOMC can produce two rows, one per source. Accepted
> until real usage shows it needs a precedence rule.
>
> **Two caveats this source ships with. Both are live; neither is a bug in our
> code.**
>
> **(a) The look-ahead filter depends on a cosmetic field.** Xoomar's response
> mixes a genuine release calendar (22 records over 2026-01→08) with a macro
> time series (36 records) whose `actual` is stamped to the START of the period
> it describes — 31 to 41 days before that value was published. Measured pairs:
> a value stamped `2026-01-01` was published `2026-02-11` (41 days); one
> stamped `2026-07-01` was published `2026-08-07` (37 days). Ingesting those
> would put numbers into `economic_events` dated before they were knowable, in
> the table that feeds the replay overlay.
>
> `classify()` in `xoomar.server.ts` separates them on `periodLabel` shape
> (`"June 2026"` / `"July 2026 meeting"` / `"Q2 2026 Advance"` are releases;
> `"2026-07"` is a period stamp), backed by a second measured signal — the
> period-start family is day-1 of a month in 36/36 cases and the release family
> in 0/22.
>
> It is a **whitelist, so it fails closed**: an unrecognised label shape is
> refused with a named warning rather than admitted as a release. The failure
> mode is therefore *missing events*, never wrong ones. **But `periodLabel` is
> a cosmetic field Xoomar can change without notice, and the day they do, this
> source goes quiet rather than loud.** So unlike ForexFactory, this one needs
> its sync log watched.
>
> ### What to watch — CORRECTED 2026-08-24, the first version was wrong
>
> The original guidance here said to watch for `filtered` **rising** toward the
> fetched total. That was wrong in a way worth recording, because it read
> healthy while proving nothing.
>
> The first live run returned `filtered: 0`, which under that rule looked
> perfect. It meant the opposite: `DAYS_BACK` was 7, and **the look-ahead
> family only exists at month-starts, the most recent of which was 54 days
> back**, so no refusable record was ever inside the window. The filter had not
> passed — it had never run. A signal that cannot fire is not a green light.
>
> `DAYS_BACK` is now 90, which always spans two or three month-starts, so
> `filtered` is a live signal rather than a structural zero.
>
> **Baseline, measured 2026-08-24 against `from=2026-05-26&to=2026-10-08`:**
>
> | field | value | meaning |
> |---|---|---|
> | records returned by the API | 23 | |
> | `filtered` | **9** | look-ahead records refused |
> | `fetched` | **14** | releases kept |
> | `withActual` | **9** | of those, already published |
>
> **CONFIRMED LIVE end-to-end — the sync at 2026-08-24 12:37 UTC reported
> `filtered: 9`, `fetched: 14`, `withActual: 9`, matching the pre-deploy API
> measurement above exactly.** `ec-1-xoomar-rows.sql` then found 14 rows in
> `economic_events` with 9 carrying an `actual`, and `ec-3-lookahead.sql`
> returned empty — empty against a run that had actively refused 9 look-ahead
> records, not against an empty table.
>
> Both facts are kept deliberately: predicted from the API, then observed in
> production. That pairing is what makes the `filtered: 0` alarm below
> trustworthy rather than theoretical — the signal is known to fire on real
> data, so a zero means something changed rather than meaning the check was
> never exercised. An expectation that has only ever been derived, never seen,
> is the same shape of non-evidence as the vacuous first `ec-3` run.
>
> The absolute numbers slide as the window moves, so compare the *structure*,
> not the integers. Roughly 4–6 refusals accrue per month-start spanned, giving
> **~9–18 expected at a 90-day window**.
>
> - **`filtered: 0`** — now an alarm, not a pass. A 90-day window always
>   contains month-starts, so zero refusals means the period-start family
>   stopped matching `^\d{4}-\d{2}$`, i.e. the label format moved.
> - **`filtered` climbing toward the API's total, with `fetched` collapsing** —
>   the release-shaped labels stopped matching. Same root cause, other side.
> - **`fetched` healthy but `withActual` at 0** — the window drifted forward off
>   the released events. Check `requestedFrom` before suspecting the provider.
> - **`requestedFrom` / `requestedTo`** report the window ASKED for;
>   `earliestEvent` / `latestEvent` report what came BACK. Read the first pair
>   to diagnose a bad query and the second for real coverage. They were one
>   conflated pair until 2026-08-24, which is what made a correct request look
>   broken.
>
> **(b) `scheduledAt` is an hour early at one DST boundary.** Timestamps are
> genuine UTC and DST-aware — 21 of 22 release records land exactly on 08:30 ET
> (BLS/BEA) or 14:00 ET (FOMC), correctly shifting between EST and EDT. The
> exception is `2026-03-06T12:30Z`, which is 07:30 ET; 2026 DST did not begin
> until March 8, so it should be `13:30Z`. The provider switched to EDT two
> days early.
>
> **Deliberately not corrected.** `event_time` is part of
> `economic_events`'s unique key `(event_time, currency, title)`, so shifting
> it in our code would fork one event into two rows the moment upstream fixes
> theirs — trading a one-hour display error for permanent duplicates. Expect
> this to recur each March and November.
>
> ## moomoo — evaluated, scored best, dropped on ToS. DO NOT RE-EVALUATE.
>
> moomoo's `/api/v1.0/quote/economic-calendar/hot` was measured on 2026-08-24
> and is **the best-quality source found in this whole investigation** — the
> only one carrying `previous` AND forecast (`predictive`) AND actual
> (`announce`) on the same record, addressed by date, with no look-ahead at
> all. Its `announce` was populated 5/5 on past dates and 0/3 on future ones,
> and its timestamps verified exactly against the 2026-08-07 non-farm payrolls
> release under every timezone value tested.
>
> **It was dropped solely on an unresolved question about whether the API
> agreement permits displaying the data to end users.** That is a licensing
> question. Nothing measured counts against the source, and on data quality it
> beats what shipped in its place.
>
> The working implementation — Ed25519 request signing, `hot` polling, the
> Chinese→English mapping tables, 14 tests — is preserved on branch
> **`wip/moomoo-economic-calendar`** (commit `cb999be`). It is not merged and
> not deployed. If redistribution turns out to be permitted, recover that
> branch rather than starting again.
>
> Its two costs, for the record: ~0.4 US events/day (~4% of FF's volume, so a
> supplement and never a replacement), and Chinese-only text with no locale
> control — `lang`, `locale`, `language`, `market` and `Accept-Language` all
> return identical Chinese, hence the mapping tables on that branch.
>
> Also settled on the same day and worth not repeating: moomoo's
> `/economic-calendar/search` **cannot** be used for this. It is keyword-only —
> `date`, `from`/`to`, `begin_time`, `start_time`, `order`, `sort`, `sort_by`
> are all silently ignored, and `time_order_type` applies only to
> `search_type=2/3`, never to `1`, the only type carrying values. Its results
> are relevance-ranked, so `keyword=CPI` returned a window four weeks stale
> containing nothing from the current week. No keyword list fixes that. A sweep
> of 22 candidate paths found no indicator/series/detail endpoint; `hot` and
> `search` are the only two that exist.

> ## STATUS 2026-08-20 · WAITING ON FMP'S ANSWER · EODHD IS THE FALLBACK
>
> **Decision deferred, deliberately. Nothing is urgent** — EODHD backfills to
> 2020, so a subscription bought later recovers the same data as one bought
> today. The only cost of waiting is that the overlay stays forecast-only, and
> the product owner has accepted that trade-off.
>
> **Open action:** a pre-sales email to `info@financialmodelingprep.com` asking
> (1) whether `/stable/economic-calendar` is included in Starter ($29/mo) or
> requires Premium, and (2) whether past events on that plan return populated
> `actual` values. Question 2 is the deciding one — the current free feed also
> returns events and is useless precisely because past ones carry no outcome.
>
> **If confirmed:** buy FMP Starter ($348/yr) and verify immediately with the
> 2024 curl recorded below, before relying on it.
>
> **If ambiguous or no reply within a few days:** take **EODHD Fundamentals at
> $599.90/yr**. It is fully verified — actuals, history from 2020, 30+
> countries — and needs no further investigation.
>
> Do NOT buy FMP Starter as a test. No refunds under any circumstances, no
> self-serve cancellation, and reported charges continuing after cancellation
> requests: the downside is not bounded at $29, and the prize is ~$252/yr.


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

### FMP — field shape fits, one decisive question left unanswered

**Updated 2026-08-20 after a second pass.** Everything below the first line is
from documentation and third-party plan listings, NOT from a live call — the
docs and pricing pages both return HTTP 403 to any client I have, and the
`demo` key is rejected outright:

```
{"Error Message":"Invalid API KEY. Feel free to create a Free API Key..."}
```

**Documented response shape** — a direct match for `economic_events`:

```json
{"date":"2025-01-15 14:30:00","country":"US",
 "event":"Consumer Price Index (CPI) YoY","currency":"USD",
 "previous":2.6,"estimate":2.7,"actual":null,
 "change":null,"impact":"High","changePercentage":null}
```

`actual`, `estimate`, `previous`, `impact` and `currency` all present. Column
for column this maps onto our table more cleanly than any other option, and
the calendar is documented as refreshing every 15 minutes.

**Pricing** (third-party listing, not FMP's own page):

| Plan | Price | Limit | Stated historical range |
|---|---|---|---|
| Basic (free) | $0 | 250 calls/**day** | 5 years |
| Starter | $29/mo | 300 calls/min | 5 years |
| Premium | $69/mo | 750 calls/min | 30+ years |
| Ultimate | $139/mo | 3,000 calls/min | 30+ years |

**The question that decides it, and it is NOT answered.** Those "5 years" and
"30+ years" figures describe the plans generally; nothing found states whether
the *economic calendar* is served on the free or Starter tier, or whether its
history is one of the ranges gated behind Premium. FMP's own material says
"premium dataset endpoints offer more historical data and some endpoints are
only accessible via paid subscriptions" without naming which.

So FMP is either:

- **the answer** — $29/yr-equivalent $348, or even $0, for a schema-shaped feed
  with actuals and five years of history, less than half EODHD; or
- **Premium-gated at $69/mo ($828/yr)**, which is more than EODHD's $599.90
  and settles the question the other way.

**This cannot be closed without an API key**, and creating an account is not
something I should do on your behalf. It is a 30-second signup at
`site.financialmodelingprep.com` → free key, then one command:

```bash
curl -s "https://financialmodelingprep.com/stable/economic-calendar?from=2024-03-01&to=2024-03-08&apikey=YOUR_KEY" | head -c 600
```

**A 2024 date range is deliberate** — it tests history and actuals in one call,
which is the whole question. Read it as:

- **Events returned WITH non-null `actual`** → free tier serves historical
  outcomes. FMP wins on price and the decision is basically made.
- **Events returned, `actual` all null** → schedule-only for past dates, which
  is the current feed's exact failing. Eliminated for replay.
- **An error or empty array** → the endpoint is gated above free. Re-test on
  Starter if $29 is worth a month's trial, otherwise EODHD.

### FMP — free tier MEASURED as gated, 2026-08-20

A live call on a real free key returned:

```
Restricted Endpoint: This endpoint is not available under your current
subscription please visit our subscription page to upgrade your plan
```

**Free tier is eliminated for certain.** Note the wording: this is an
ENDPOINT-level gate, not a history-depth one. So the "5 years / 30+ years"
column in the plan table describes historical RANGE and says nothing about
which plans unlock this endpoint. Two different axes; only the second decides
this.

**Whether Starter ($29/mo) unlocks it is still unknown**, and could not be
established from any public source.

### Why NOT to buy Starter as a test

- **No refunds, at all.** FMP's Terms of Service: *"All sales are final, and
  the Company does not offer any money-back guarantees. You are not entitled
  to a refund for any purchase under any circumstances."* A $29 probe is spent
  either way.
- **Cancellation is not self-serve** — it requires emailing
  `info@financialmodelingprep.com`, and Trustpilot reviews report charges
  continuing after cancellation requests. Treat as a signal, not a verdict, but
  it means the downside is not bounded at $29.
- The prize is ~$252/yr (FMP Starter $348 vs EODHD $599.90). Taking an
  unbounded billing risk to chase that, on a feature the product owner has
  said can wait, is the wrong shape of bet.

**The free measurement that has not been used: ask FMP pre-sales.** "Does the
Starter plan include `/stable/economic-calendar`?" — one email, definitive,
answerable only by them. Today's lesson is not "measure at any cost", it is
"do not act on a proxy when a direct answer is available", and a vendor's
written confirmation is a direct answer rather than a plan-table inference.

**Recommendation:** email first. If Starter is confirmed, buy it and run the
2024 curl immediately to verify what was promised. If the answer is ambiguous
or does not arrive within a few days, take EODHD and stop spending time on a
$252/yr question.

### Business Quant — ELIMINATED 2026-08-20, on three independent grounds

Checked because it advertises `actual` and `previous` on a free tier. It does,
and that is not the same thing as what we need.

`GET https://data.businessquant.com/calendar/economic` (key required; a keyless
call returns `{"detail":"API key is missing."}`, so the check below is from
documented response shape rather than a live call — but the disqualifiers are
STRUCTURAL, and a key would only confirm them).

**1 · It is a per-indicator snapshot, not an event log.** Each row is one
INDICATOR carrying `latest_value`, `prior_value`, `change_abs`, `change_pct`,
`last_release`, `next_release`, `days_until_next`, `release_state`. So it
answers "what is CPI now, and when does it next print". It does not answer
"what did CPI print on 2024-03-12", which is the only question the replay
overlay asks.

**2 · The date range cannot reach the past.** `from_date` / `till_date` filter
on `next_release` — upcoming releases only. There is no parameter that
retrieves historical releases.

**3 · United States only.** The product is explicitly "US macro indicators".
Our overlay is currency-driven via `currenciesForSymbol`, so a EUR/USD session
needs EUR events and a GBP/USD session needs GBP. A US-only feed covers one leg
of every pair we trade. This alone is fatal regardless of the other two.

**And it is missing a field the current free feed already has.** The response
carries no forecast or consensus at all — `latest_value` and `prior_value`
only. faireconomy at least publishes `forecast`. So adopting this would trade
one gap for a different one and lose ground.

The "historical data lives in a separate economic-data API" caveat is the
tell, and it is accurate: that separate API is macro TIME-SERIES (GDP, CPI,
unemployment as series), which is a different product from a calendar of
releases with scheduled times, consensus and outcomes.

**Verdict: not a candidate.** Cheap and well documented, and aimed at a
different problem.

### HorizonFX "Economic Calendar API" (RapidAPI) — promising, one gate unverified

`GET https://economic-calendar-api.p.rapidapi.com/calendar`, headers
`X-RapidAPI-Key` + `X-RapidAPI-Host`. RapidAPI-only; no direct endpoint.

**Measured 2026-08-20 without an account:**

| Request | Result |
|---|---|
| no key | `401 {"message":"Invalid API key..."}` |
| syntactically valid bogus key | `403 {"message":"You are not subscribed to this API."}` |

So even the FREE tier requires a RapidAPI account and an explicit subscribe
step. Cannot be tested without signing up.

**Documented response** — the best shape of any candidate:
`id, eventId, name, countryCode, currencyCode, dateUtc, volatility, actual,
consensus, previous, unit, isBetterThanExpected`. That is actual AND consensus
AND previous, plus a volatility/impact field and currency, mapping onto
`economic_events` as cleanly as FMP and with international coverage rather than
Business Quant's US-only.

**The fine print, found before spending anything.** The vendor's own page lists
**"historical data access" as a Pro ($5/mo) feature**, alongside "enhanced rate
limits". That is precisely the axis that decides this: if the free tier serves
only current and upcoming events, it reproduces faireconomy's exact failing and
is worth nothing to us. The marketing sample showing NFP on 2024-01-15 with
`actual: "216K"` is a marketing sample — the same category of evidence as FMP's
documented response, which turned out not to describe what the free tier
actually serves.

**Provenance risk, worth weighing separately from price.** The page describes
"auto-scraping every 5 minutes" and lists compatibility with TradingView,
FXStreet, Forex Factory and Investing. That is a scraper over other people's
calendars, operated by a party with no track record found, not a licensed feed.
For a dependency the replay overlay reads on every session, that is a real
durability question — scrapers break when their sources change, and there is no
contractual anyone to call.

**If a paid test is ever wanted, this is a far safer one than FMP.** $5/mo,
billed and cancelled self-serve through RapidAPI's dashboard, versus FMP's $29
with no refunds under any circumstances and email-only cancellation. Different
risk class entirely. Not pursued now: the standing constraint is free-only.

**The test to run once a free RapidAPI key exists** — a past window, which is
the whole question:

```bash
curl -s "https://economic-calendar-api.p.rapidapi.com/calendar?from=2024-01-15&to=2024-01-16"   -H "X-RapidAPI-Key: YOUR_KEY"   -H "X-RapidAPI-Host: economic-calendar-api.p.rapidapi.com" | head -c 800
```

- **Events with populated `actual`** → free tier serves historical outcomes,
  and this becomes the leading option on price. Verify coverage for EUR and GBP
  before committing, not just USD.
- **Events with `actual: null`, or empty, or a 403 mentioning the plan** →
  historical access is Pro-gated. Then it is a $5/mo question, not a free one.

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
| FMP | yes | documented, unverified | unverified | unknown — gated above free |
| Business Quant | upcoming only | latest reading only | **no** | **no** — US only, snapshot not log |
| HorizonFX (RapidAPI) | yes | documented | **Pro-gated?** | unknown — needs a free key to settle |

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

1. **One command on an FMP free key** — the exact curl is in the FMP section
   above, against a 2024 window so it tests history and actuals together.
   Documentation says the field shape is right; what is unverified is whether
   the calendar's history is free, Starter, or Premium-gated. That single
   answer separates "$0-348/yr and better-shaped than EODHD" from
   "$828/yr and worse".
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
