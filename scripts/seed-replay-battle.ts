/**
 * Seed one testable replay battle and print its URL.
 *
 *   bun scripts/seed-replay-battle.ts
 *
 * Exists because there is no other way to create one: `replay_dataset_id` is a
 * content hash of the candles (FNV-1a over every OHLC value), computed at load
 * time, so it cannot be written by hand in SQL, and the create wizard has no
 * dataset step yet. A guessed id produces a battle that is created successfully
 * and then refuses to start — which looks like a bug rather than bad input.
 *
 * This is a verification tool, not the feature. The wizard step comes after the
 * engine is proven.
 *
 * ── Trap 1: the call shape ─────────────────────────────────────────────────
 *
 * The dataset must be byte-identical to the one the browser later loads or
 * `createBattleSession` refuses to start (battle-session.ts:98).
 *
 * `getReplayCandles` cannot be called from here — its `requireSupabaseAuth`
 * middleware calls `getRequest()`, which throws outside an HTTP request. So it
 * is mirrored instead, and the mirror is only safe because with `warmupBars`
 * omitted the server fn reduces to exactly this (replay.functions.ts:640-743):
 *
 *     candles    = [...warmup, ...res.candles]   and warmup === [] without warmupBars
 *     providerId = res.source.providerCode
 *
 * Replay Studio passes `warmupBars` and offsets its start cursor to compensate;
 * `BattleReplayProvider` does not. Requesting warmup here would prepend bars the
 * browser never sees and change the checksum. Nothing else in the server fn
 * touches the candles.
 *
 * ── Trap 2: the window narrows ─────────────────────────────────────────────
 *
 * `replay_from`/`replay_to` store the FIRST and LAST CANDLE TIMES, not the
 * window requested here — and `BattleReplayProvider` requests exactly those
 * stored bounds (battle-replay-context.tsx:143-146). Since `readStored` filters
 * `ts >= from AND ts <= to`, the browser therefore issues a *narrower* query
 * than this script did.
 *
 * That is expected to return the same rows, but "expected to" is not good
 * enough for a value that silently bricks the battle at start time. So the
 * dataset is rebuilt a second time from the stored bounds and the two ids are
 * compared before anything is inserted. A match is proof, not an argument.
 *
 * ── Environment (same file the E2E suite uses — .env.e2e.local, gitignored) ─
 *
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY   (from .env, tracked)
 *   E2E_HOST_EMAIL, E2E_HOST_PASSWORD                  (the battle host)
 *
 * ── Trap 3: 1000 rows is the ceiling, not 10,000 ───────────────────────────
 *
 * `readStored` asks for `.limit(10000)`, but PostgREST caps this project's
 * responses at 1000 rows, so that limit is unreachable. Measured directly:
 *
 *     GET historical_candles?symbol=BTC/USDT&timeframe=5m   (July 2026)
 *     → rows=1000, content-range: 0-999/8644
 *
 * 8,644 bars exist; 1,000 arrive. A month-wide request therefore fails coverage
 * at 11%, and — far worse — a 4-day request returns 1000 of 1087 and *passes*
 * coverage at 92% while being silently truncated.
 *
 * So the window is derived from the bars the battle actually needs and kept
 * under the cap, rather than being a fixed calendar range. A response that
 * comes back at exactly the cap is treated as a hard failure below: it means
 * the tape was cut, and a cut tape is the thing this whole script exists to
 * make impossible.
 *
 * This also bounds replay battles generally: at 1x nothing longer than ~16
 * minutes can be backed by a single-request tape.
 *
 * Optional overrides:
 *   SYMBOL=BTC/USDT  TIMEFRAME=5m  FROM=2026-07-01  TO=<derived>
 *   DURATION_MIN=10  SPEED=1  START_IN_SEC=120  APP_URL=http://localhost:8080
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

import { seedSession, clientFor } from "../e2e/supabase-session";
import { buildDataset, type ReplayDataset } from "../src/lib/replay/session/dataset";
import { candlesConsumedAt, validateBattleReplayRange } from "../src/lib/replay/battle-cursor";
import { enginePricingRefusal } from "../src/lib/replay/battle-pnl";
import { TIMEFRAME_SECONDS } from "../src/lib/replay/constants";
import { resolveHistoricalRange } from "../src/lib/market-data/historical/service.server";
import type { Candle, Timeframe } from "../src/lib/replay/types";

dotenv.config({ path: ".env.e2e.local" });
dotenv.config();

/**
 * BTC/USDT 5m anchored at July 2026 — 8,644 bars stored across the month,
 * verified dense below. A fixed anchor rather than "the most recent N bars"
 * because a battle seeded off a moving window is a different battle every run,
 * and the first thing anyone does with a failure here is ask whether the data
 * changed. `TO` is derived from the anchor, not the calendar — see Trap 3.
 */
const SYMBOL = process.env.SYMBOL ?? "BTC/USDT";
const TIMEFRAME = (process.env.TIMEFRAME ?? "5m") as Timeframe;
const FROM = process.env.FROM ?? "2026-07-01";
const DURATION_MIN = Number(process.env.DURATION_MIN ?? 10);
const SPEED = Number(process.env.SPEED ?? 1);
/**
 * Long enough to open the second browser and join. `ready → countdown` needs
 * `start_at <= now() + 30s` and `countdown → live` waits a further 10s, so
 * anything under ~45s starts the battle before a second player can arrive.
 */
const START_IN_SEC = Number(process.env.START_IN_SEC ?? 120);
const APP_URL = process.env.APP_URL ?? "http://localhost:8080";

/** `battles.market` is an enum; a symbol registered under anything else can't be used. */
const BATTLE_MARKETS = new Set(["crypto", "forex", "indices", "metals", "mixed"]);

/**
 * PostgREST's per-response row cap on this project. Measured, not configured
 * here — `readStored`'s `.limit(10000)` cannot be reached. See Trap 3.
 */
const ROW_CAP = 1000;

function die(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function env(name: string): string {
  return process.env[name] ?? die(`Missing ${name}. See the header of this file.`);
}

type Db = SupabaseClient<any, any, any>;

/**
 * Load candles exactly as `BattleReplayProvider` will. See "Trap 1" above for
 * why mirroring the server fn is sound and what would break it.
 *
 * `market` is passed rather than left to default because it feeds session-aware
 * coverage (`checkCoverage`), and the browser passes `battles.market`. The two
 * must agree or the two sides can disagree about whether the range is covered —
 * and a coverage failure triggers an on-demand backfill that writes new rows.
 */
async function loadAsBattleClientWill(db: Db, market: string, from: number, to: number) {
  const res = await resolveHistoricalRange(db, {
    symbol: SYMBOL,
    // 3m has no stored equivalent; the service normalises the rest.
    timeframe: (TIMEFRAME === "3m" ? "5m" : TIMEFRAME) as never,
    from,
    to,
    market,
    allowBackfill: true,
    allowSynthetic: false,
  }).catch((e: unknown) =>
    die(`Could not load candles: ${e instanceof Error ? e.message : String(e)}`),
  );

  // buildDataset gets the BATTLE's timeframe, not the normalised one, because
  // that is what createBattleSession passes — the id must match on both sides.
  const dataset = buildDataset({
    provider: res.source.providerCode,
    symbol: SYMBOL,
    timeframe: TIMEFRAME,
    timezone: "UTC",
    candles: res.candles as Candle[],
  });
  return { dataset, res };
}

/** Bars vs. what the timeframe says should be there, plus the worst hole. */
function describeDensity(dataset: ReplayDataset, expected: number): string {
  const { barCount, gaps } = dataset.identity;
  const worst = gaps.reduce((m, g) => Math.max(m, g.missingBars), 0);
  const pct = expected > 0 ? Math.round((barCount / expected) * 1000) / 10 : 100;
  return (
    `${barCount} bars, ${pct}% of the ~${expected} the timeframe implies · ` +
    `${gaps.length} gap(s)${worst ? `, largest ${worst} bars` : ""}`
  );
}

async function main() {
  const url = env("VITE_SUPABASE_URL");
  const key = env("VITE_SUPABASE_PUBLISHABLE_KEY");

  // Refuse early on a symbol whose P&L would be recorded in the wrong currency,
  // with the same message createBattle would give. See BA-10.
  const refusal = enginePricingRefusal(SYMBOL);
  if (refusal) die(refusal);

  const stepSec = TIMEFRAME_SECONDS[TIMEFRAME];
  if (!stepSec) die(`Unknown timeframe "${TIMEFRAME}".`);

  // ── size the window to the battle, under the row cap ────────────────────
  const durationMs = DURATION_MIN * 60_000;
  const required = candlesConsumedAt(durationMs, SPEED);
  if (required <= 0) die("DURATION_MIN must be greater than zero.");
  if (required >= ROW_CAP) {
    die(
      `This battle needs ${required} candles but one request can return at most ` +
        `${ROW_CAP} (Trap 3 in the header). Shorten it to under ` +
        `${Math.floor(ROW_CAP / (60 * SPEED))} minutes at ${SPEED}x, or lower SPEED.`,
    );
  }

  // 1.3x headroom absorbs the gaps a real tape has, while staying clear of the
  // cap — a response that arrives at exactly the cap has been truncated, and is
  // rejected below rather than replayed short.
  const targetBars = Math.min(ROW_CAP - 50, Math.ceil(required * 1.3));
  const from = new Date(`${FROM}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(from)) die(`FROM (${FROM}) is not a date.`);
  const to = process.env.TO
    ? new Date(`${process.env.TO}T23:59:59.999Z`).getTime()
    : from + targetBars * stepSec * 1000 - 1;
  if (!(from < to)) die(`FROM (${FROM}) must be before TO.`);

  // ── auth ────────────────────────────────────────────────────────────────
  // Same helper the E2E suite signs in with, so a credential problem here fails
  // the same way and in the same place as it would there.
  const session = await seedSession(
    url,
    key,
    env("E2E_HOST_EMAIL"),
    env("E2E_HOST_PASSWORD"),
  ).catch((e: unknown) =>
    die(
      `${e instanceof Error ? e.message : String(e)}\n` +
        `  If the password is right, check it is QUOTED in .env.e2e.local — ` +
        `dotenv reads an unquoted '#' as a comment and silently truncates the ` +
        `value, which Supabase reports as ordinary invalid credentials.`,
    ),
  );

  const db = clientFor(url, key, session.accessToken) as Db;
  console.log(`· signed in as host ${session.userId}`);

  // ── market, as the registry has it ──────────────────────────────────────
  // Read rather than inferred from the symbol name: this is the value
  // `resolveHistoricalRange` falls back to, and storing anything else in
  // `battles.market` would have the browser resolve coverage differently.
  const { data: symbolRow } = await db
    .from("historical_symbols")
    .select("market, is_enabled")
    .eq("symbol", SYMBOL)
    .maybeSingle();

  if (!symbolRow) {
    die(
      `${SYMBOL} is not registered in historical_symbols. Add it in ` +
        `Admin → Market Data, or pick a registered symbol.`,
    );
  }
  if (symbolRow.is_enabled === false) die(`${SYMBOL} is registered but disabled.`);
  const market = String(symbolRow.market);
  if (!BATTLE_MARKETS.has(market)) {
    die(`${SYMBOL} is registered under market "${market}", which battles.market does not allow.`);
  }

  // ── load, and check the tape is dense ───────────────────────────────────
  const { dataset, res } = await loadAsBattleClientWill(db, market, from, to);
  console.log(
    `· loaded ${dataset.identity.barCount} candles from "${res.source.providerCode}" ` +
      `(${res.source.kind})\n  ${describeDensity(dataset, res.coverage.expected)}`,
  );

  // A response at exactly the cap was cut short by PostgREST, not by the data.
  // Fatal rather than a warning: truncation is deterministic, so the checksum
  // still matches and the battle still starts — on a tape that ends early, with
  // nothing anywhere saying so. See Trap 3.
  if (res.candles.length >= ROW_CAP) {
    die(
      `Got exactly ${ROW_CAP} candles — PostgREST's row cap, so the tape is ` +
        `truncated rather than complete. Narrow the window (FROM/TO) or shorten ` +
        `the battle.`,
    );
  }

  // ── prove the browser will rebuild the same id ──────────────────────────
  // The battle stores the dataset's own bounds, and that is what the browser
  // requests back. See "Trap 2" in the header.
  const replayFrom = dataset.identity.startTime;
  const replayTo = dataset.identity.endTime;
  const { dataset: rebuilt } = await loadAsBattleClientWill(db, market, replayFrom, replayTo);

  if (rebuilt.identity.datasetId !== dataset.identity.datasetId) {
    die(
      `The dataset does not survive a round-trip through its own stored bounds, ` +
        `so the browser would compute a different checksum and the battle would ` +
        `refuse to start.\n` +
        `  seeded from [${FROM}, ${TO}]  → ${dataset.identity.barCount} bars, ` +
        `${dataset.identity.datasetId.slice(-16)}\n` +
        `  reloaded from stored bounds → ${rebuilt.identity.barCount} bars, ` +
        `${rebuilt.identity.datasetId.slice(-16)}\n` +
        `  Most likely an on-demand backfill wrote rows between the two reads. ` +
        `Re-run; if it persists, the range is still importing.`,
    );
  }
  console.log(`· dataset id reproduces from its stored bounds`);

  // ── will the tape outlast the battle? ───────────────────────────────────
  const range = validateBattleReplayRange({
    barCount: dataset.identity.barCount,
    durationMs,
    speed: SPEED,
  });
  if (!range.ok) die(range.reason ?? "Replay range cannot cover this battle");
  console.log(`· ${range.available} candles available, ${range.required} needed at ${SPEED}x`);

  // ── create the battle ───────────────────────────────────────────────────
  const startAt = new Date(Date.now() + START_IN_SEC * 1000);
  const endAt = new Date(startAt.getTime() + durationMs);

  const { data: battle, error: insertErr } = await db
    .from("battles")
    .insert({
      host_id: session.userId,
      name: `Replay test ${new Date().toISOString().slice(11, 19)}`,
      description: "Seeded by scripts/seed-replay-battle.ts",
      visibility: "public",
      // Enforced by battles_replay_must_be_unranked; stated here so the intent
      // is visible at the call site rather than only in the constraint.
      ranked: false,
      battle_type: "1v1",
      market,
      allowed_symbols: [SYMBOL],
      starting_balance: 10000,
      min_participants: 2,
      max_participants: 2,
      max_risk_pct: 2,
      max_daily_loss_pct: 5,
      max_drawdown_pct: 10,
      max_open_positions: 5,
      win_condition: "highest_pnl",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      timezone: "UTC",
      // Same derivation as createBattle, so the state machine sees the status it
      // would have seen from the wizard.
      status: startAt.getTime() <= Date.now() ? "open" : "upcoming",
      allow_late_join: true,
      replay_dataset_id: dataset.identity.datasetId,
      replay_symbol: SYMBOL,
      replay_timeframe: TIMEFRAME,
      replay_from: new Date(replayFrom).toISOString(),
      replay_to: new Date(replayTo).toISOString(),
      replay_speed: SPEED,
      replay_start_cursor: 0,
    })
    .select("id")
    .single();

  if (insertErr) die(`Could not create battle: ${insertErr.message}`);

  // Unlike createBattle, which discards this error and can leave a committed
  // battle with zero participants (see docs/battle-arena-fixes.md § A).
  const { error: joinErr } = await db.rpc("join_battle", { _battle_id: battle.id });
  if (joinErr) die(`Battle ${battle.id} was created but the host could not join: ${joinErr.message}`);

  console.log(`
✓ Replay battle created

  ${APP_URL}/battle-arena/${battle.id}

  symbol     ${SYMBOL} ${TIMEFRAME} at ${SPEED}x  (${market})
  tape       ${dataset.identity.barCount} bars, ${new Date(replayFrom).toISOString().slice(0, 16)} → ${new Date(replayTo).toISOString().slice(0, 16)}
  starts     ${startAt.toISOString()}  (in ${START_IN_SEC}s)
  ends       ${endAt.toISOString()}
  host       joined

Open that URL as a SECOND account and click Join Arena — the battle needs 2
participants to leave 'filling', and the route's own tick poll is what drives
it to 'live', so keep a tab open. Trades are rejected until it is live.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
