import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, ids } from "./fixtures";

/**
 * Prop-firm challenge mode in Replay Studio — the breach moment.
 *
 * Driven through the session's own trade tape rather than by trading by hand:
 * Studio hydrates `chart_closed_trades` for its session id, so seeded rows
 * reach the monitor by exactly the path a real session's trades do. What this
 * proves is the WATCHER — tape → market-time evaluation → session ended →
 * moment on screen. Order placement has its own specs.
 *
 * Every figure asserted below is arithmetic stated before the run:
 *
 *   starting balance   100,000     (session.initial_balance)
 *   daily limit        5%          → 5,000 against a day opening at 100,000
 *   drawdown limit     10%         → 10,000 against a 100,000 peak
 *
 *   breach case   trades −6,000 on the cursor's own market day
 *                 → daily used 6,000 > 5,000, over by 1,000
 *                 → equity 94,000, peak 100,000 (equity only ever fell)
 *                 → drawdown used 6,000, so 4,000 of THAT envelope remains:
 *                   the daily rule must fire first, not the total one
 *
 *   safe case     trades −4,000 on the same day
 *                 → 1,000 of the daily envelope left, no breach, no overlay
 *
 * BTC/USDT 5m on 2026-07-05 because it is one of only two symbols with stored
 * candles, and Studio will not reach `ready` without them.
 */

const TITLE = "E2E PROP RUN";
const START_BALANCE = 100_000;
const REPLAY_DATE = "2026-07-05";

/** Mirrors `ReplayPropRules`; written into `replay_sessions.settings`. */
const RULES = {
  presetId: "custom",
  accountSize: START_BALANCE,
  profitTargetPct: 8,
  maxDailyLossPct: 5,
  maxTotalDrawdownPct: 10,
  minTradingDays: 3,
};

function tradeRows(sessionId: string, userId: string, pnls: number[], tag: string) {
  // Exit times sit on the cursor's own market day, so the day the rule resets
  // on and the day the cursor is in are the same one.
  const base = Date.UTC(2026, 6, 5, 6, 0, 0);
  return pnls.map((pnl, i) => {
    const entryTime = base + i * 20 * 60_000;
    const exitTime = entryTime + 10 * 60_000;
    const fill = 63_000 + i * 20;
    const trade = {
      id: `t_${tag}_${i}`, orderId: `o_${tag}_${i}`, positionId: `p_${tag}_${i}`,
      symbol: "BTC/USDT", market: "crypto", direction: "buy", orderType: "market",
      fillPrice: fill, entryTime, exitPrice: fill + pnl, exitTime,
      closeReason: pnl >= 0 ? "take_profit" : "stop_loss", quantity: 1,
      grossPnl: pnl, fees: 0, netPnl: pnl, riskAmount: 1_000, initialRiskDistance: 1_000,
      realizedR: pnl / 1_000, slippage: 0, executionSource: "replay",
      closedAt: exitTime, createdAt: entryTime, journalStatus: "unlinked",
    };
    return {
      id: trade.id, user_id: userId, order_id: trade.orderId, position_id: trade.positionId,
      symbol: trade.symbol, market: trade.market, direction: trade.direction,
      order_type: trade.orderType, fill_price: fill, entry_time: entryTime,
      initial_stop: fill - 1_000, initial_target: fill + 2_000,
      final_stop: fill - 1_000, final_target: fill + 2_000,
      exit_price: trade.exitPrice, exit_time: exitTime, close_reason: trade.closeReason,
      quantity: 1, position_size: fill, gross_pnl: pnl, fees: 0, net_pnl: pnl,
      risk_amount: 1_000, initial_risk_distance: 1_000, realized_r: trade.realizedR,
      return_percent: (pnl / START_BALANCE) * 100, slippage: 0, execution_source: "replay",
      closed_at: exitTime, journal_status: "unlinked",
      replay_session_id: sessionId, payload: trade,
    };
  });
}

async function seed(sb: SupabaseClient, userId: string, tag: string, pnls: number[]) {
  const { data, error } = await sb.from("replay_sessions").insert({
    user_id: userId,
    title: `${TITLE} ${tag}`,
    mode: "day",
    market: "crypto",
    symbol: "BTC/USDT",
    timeframe: "5m",
    replay_date: REPLAY_DATE,
    status: "active",
    initial_balance: START_BALANCE,
    provider: "historical",
    settings: { prop_challenge_v1: RULES },
  }).select("id").single();
  if (error) throw new Error(`could not seed session: ${error.message}`);

  const sessionId = String((data as { id: string }).id);
  const { error: tErr } = await sb
    .from("chart_closed_trades")
    .insert(tradeRows(sessionId, userId, pnls, tag));
  if (tErr) throw new Error(`could not seed trades: ${tErr.message}`);
  return sessionId;
}

async function openStudio(page: Page, sessionId: string) {
  await page.addInitScript(() => localStorage.setItem("thv:tour:completed:v1", "1"));
  await page.goto(`/replay/studio?id=${sessionId}`);
  // Cold dev server compiles the route on first hit; the envelope only renders
  // once the session has booted with candles.
  await page.getByTestId("challenge-envelope").waitFor({ state: "visible", timeout: 120_000 });
}

test.describe("prop-firm challenge in Replay Studio", () => {
  let sb: SupabaseClient;
  let userId: string;
  let breachId: string;
  let safeId: string;
  const tag = `pf${Date.now().toString(36)}`;

  test.beforeAll(async () => {
    sb = db();
    userId = ids().userId;
    breachId = await seed(sb, userId, tag, [-2_500, -2_000, -1_500]); // −6,000
    safeId = await seed(sb, userId, `${tag}s`, [-2_500, -1_500]); // −4,000
  });

  test.afterAll(async () => {
    for (const id of [breachId, safeId].filter(Boolean)) {
      await sb.from("chart_closed_trades").delete().eq("replay_session_id", id);
      await sb.from("replay_sessions").delete().eq("id", id);
    }
  });

  test("ends the session on a daily-loss breach and says by how much", async ({ page }) => {
    await openStudio(page, breachId);

    const overlay = page.getByTestId("challenge-breach");
    await expect(overlay).toBeVisible({ timeout: 30_000 });

    // WHICH rule broke. The total-drawdown envelope still had 4,000 left, so
    // naming the wrong one here would be a real defect, not a label nit.
    await expect(page.getByTestId("breach-field")).toHaveText("Daily loss limit");

    // BY HOW MUCH.
    await expect(page.getByTestId("breach-limit")).toHaveText("$5,000");
    await expect(page.getByTestId("breach-observed")).toHaveText("$6,000");
    await expect(page.getByTestId("breach-over")).toHaveText("$1,000");

    await expect(overlay).toContainText("CHALLENGE FAILED");
    // A prelude may dismiss itself; a failed evaluation may not.
    await expect(page.getByRole("link", { name: "Review the session" })).toBeVisible();

    // The daily envelope is spent and the drawdown one is not — the same fact
    // the breach names, shown where the trader was already looking.
    await expect(page.getByTestId("challenge-daily-left")).toHaveText("$0");
    await expect(page.getByTestId("challenge-dd-left")).toHaveText("$4,000");

    // "Ends the session" has to mean the session actually ended, not just that
    // a modal appeared over it. The write is async behind save → complete.
    await expect
      .poll(async () => (await sb.from("replay_sessions").select("status").eq("id", breachId).single()).data?.status, {
        message: "the breach did not complete the session",
        timeout: 30_000,
      })
      .toBe("completed");
  });

  test("reopening a failed challenge keeps its rules and does not replay the moment", async ({ page }) => {
    // Regression for a bug this feature exposed: `persistSnapshot` wrote
    // `settings` as a whole new object, so the first autosave deleted every
    // other key under it — the ruleset included. The challenge worked, saved
    // once, and had no rules on the next load.
    await openStudio(page, breachId);

    await expect(page.getByTestId("challenge-daily-left")).toHaveText("$0");
    await expect(page.getByTestId("challenge-dd-left")).toHaveText("$4,000");

    const settings = await sb.from("replay_sessions").select("settings").eq("id", breachId).single();
    expect(Object.keys((settings.data?.settings ?? {}) as object).sort()).toEqual([
      "engine_v1", "prop_challenge_v1",
    ]);

    // The breach is history by now; the trader came back to read the tape.
    await expect(page.getByTestId("challenge-breach")).toHaveCount(0);
  });

  test("leaves a session inside its envelope running", async ({ page }) => {
    await openStudio(page, safeId);

    await expect(page.getByTestId("challenge-daily-left")).toHaveText("$1,000");
    await expect(page.getByTestId("challenge-dd-left")).toHaveText("$6,000");
    // The moment must not fire early — that would be worse than firing late.
    await expect(page.getByTestId("challenge-breach")).toHaveCount(0);
  });
});
