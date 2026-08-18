import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, ids } from "./fixtures";

/**
 * Monte Carlo on /replay/review — the numbers on screen against numbers
 * derived without the engine.
 *
 * The projection is the one place in Replay Review where a wrong figure looks
 * exactly like a right one: nobody can eyeball whether a 5th-percentile
 * outcome of −$713 is plausible. So this spec does not assert "a number
 * appeared". It asserts the numbers land inside intervals computed from the
 * seeded sample by two independent methods:
 *
 *   · an exact DP convolution of the bootstrap distribution (final P/L
 *     quantiles, chance of profit) — closed form, no sampling at all;
 *   · an exact DP over the longest losing run;
 *   · a separately written 400k-path reference simulator for the drawdown
 *     stats, which have no closed form.
 *
 * Tolerances are the sampling error of a 1,000-path estimate (3 SE), not
 * padding chosen to make it pass. Working shown in the commit message.
 *
 * The trades are seeded rather than hand-traded, so what this proves is the
 * REVIEW path: rows → `buildSessionReview` → summary → the mounted panel.
 * Studio's write path is covered by its own specs.
 */

const SESSION_TITLE = "E2E MC RUN";
const START_BALANCE = 10_000;

/** Six winners, six losers; net +228.25 over 12 trades. */
const PNLS = [
  142.5, -85.0, 218.75, -120.0, 64.25, -85.0,
  310.0, -175.5, 96.0, -85.0, 187.25, -240.0,
];

/**
 * Predicted from PNLS without running `runMonteCarlo`.
 *
 * `centre` is the exact/reference value, `tol` is three standard errors at
 * 1,000 paths. A failure here means the engine disagrees with the distribution
 * it claims to be sampling — not that the seed moved.
 */
const EXPECTED = {
  chanceOfProfit: { centre: 64.95, tol: 4.53, unit: "%" },   // exact P(sum>0)
  median: { centre: 223.75, tol: 69 },                        // exact p50
  p5: { centre: -713.25, tol: 117 },                          // exact p5
  p95: { centre: 1186.75, tol: 124 },                         // exact p95
  ddMedian: { centre: 415.5, tol: 45 },                       // reference sim
  ddP95: { centre: 945.5, tol: 95 },                          // reference sim
} as const;

/** Exact, from the DP over longest losing run at p_loss = 0.5, n = 12. */
const EXPECTED_STREAK = "3 / 6";

/**
 * Ruin is UNREACHABLE here, and that is an assertion worth making: the worst
 * possible 12-trade path is 12 × −240 = −2,880, which cannot take a 10,000
 * balance to the 5,000 ruin line. Anything but 0.0% means the ruin test is
 * measuring against the wrong base.
 */
const EXPECTED_RUIN = "0.0%";

function tradeRows(sessionId: string, userId: string, pnls: readonly number[], tag: string) {
  // Three market days in July 2026, so the summary's per-day strip has
  // something real to group on. Prices are cosmetic — the projection reads
  // net_pnl — but they are kept self-consistent so the trade tape is readable.
  const day0 = Date.UTC(2026, 6, 5, 8, 0, 0);
  return pnls.map((pnl, i) => {
    const entryTime = day0 + i * 3 * 3_600_000;
    const exitTime = entryTime + 45 * 60_000;
    const fill = 63_000 + i * 25;
    const qty = 0.5;
    const trade = {
      id: `t_${tag}_${i}`,
      orderId: `o_${tag}_${i}`,
      positionId: `p_${tag}_${i}`,
      symbol: "BTC/USDT",
      market: "crypto",
      direction: i % 2 === 0 ? "buy" : "sell",
      orderType: "market",
      fillPrice: fill,
      entryTime,
      exitPrice: fill + pnl / qty,
      exitTime,
      closeReason: pnl >= 0 ? "take_profit" : "stop_loss",
      quantity: qty,
      grossPnl: pnl,
      fees: 0,
      netPnl: pnl,
      riskAmount: 150,
      initialRiskDistance: 300,
      realizedR: pnl / 150,
      slippage: 0,
      executionSource: "replay",
      closedAt: exitTime,
      createdAt: entryTime,
      journalStatus: "unlinked",
    };
    return {
      id: trade.id,
      user_id: userId,
      order_id: trade.orderId,
      position_id: trade.positionId,
      symbol: trade.symbol,
      market: trade.market,
      direction: trade.direction,
      order_type: trade.orderType,
      fill_price: trade.fillPrice,
      entry_time: entryTime,
      initial_stop: fill - 300,
      initial_target: fill + 600,
      final_stop: fill - 300,
      final_target: fill + 600,
      exit_price: trade.exitPrice,
      exit_time: exitTime,
      close_reason: trade.closeReason,
      quantity: qty,
      position_size: fill * qty,
      gross_pnl: pnl,
      fees: 0,
      net_pnl: pnl,
      risk_amount: 150,
      initial_risk_distance: 300,
      realized_r: trade.realizedR,
      return_percent: (pnl / START_BALANCE) * 100,
      slippage: 0,
      execution_source: "replay",
      closed_at: exitTime,
      journal_status: "unlinked",
      replay_session_id: sessionId,
      payload: trade,
    };
  });
}

async function seedSession(
  sb: SupabaseClient, userId: string, tag: string, pnls: readonly number[],
) {
  const { data: session, error } = await sb.from("replay_sessions").insert({
    user_id: userId,
    title: `${SESSION_TITLE} ${tag}`,
    mode: "day",
    market: "crypto",
    symbol: "BTC/USDT",
    timeframe: "5m",
    replay_date: "2026-07-05",
    status: "completed",
    initial_balance: START_BALANCE,
    provider: "historical",
  }).select("id").single();
  if (error) throw new Error(`could not seed replay session: ${error.message}`);

  const sessionId = String((session as { id: string }).id);
  const { error: tErr } = await sb
    .from("chart_closed_trades")
    .insert(tradeRows(sessionId, userId, pnls, tag));
  if (tErr) throw new Error(`could not seed closed trades: ${tErr.message}`);
  return sessionId;
}

/** Numeric value of a `formatMetric(_, "currency")` cell: "−$713.25" → −713.25. */
async function currencyCell(page: Page, testId: string): Promise<number> {
  const raw = (await page.getByTestId(testId).innerText()).trim();
  const n = Number(raw.replace(/−/g, "-").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${testId} did not render a number: "${raw}"`);
  return n;
}

async function openRiskTab(page: Page, sessionId: string) {
  await page.addInitScript(() => localStorage.setItem("thv:tour:completed:v1", "1"));
  await page.goto(`/replay/review?id=${sessionId}`);
  // The review query and, on a cold dev server, the route's first compile both
  // land here — wait for the tab to exist before clicking it rather than
  // spending the click's own timeout on the page load.
  const risk = page.getByRole("tab", { name: "Risk" });
  await risk.waitFor({ state: "visible", timeout: 90_000 });
  await risk.click();
  await page.getByTestId("monte-carlo").waitFor({ state: "visible", timeout: 30_000 });
}

test.describe("Monte Carlo on the replay review surface", () => {
  let sb: SupabaseClient;
  let userId: string;
  let full: string;
  let short: string;
  const tag = `mc${Date.now().toString(36)}`;

  test.beforeAll(async () => {
    sb = db();
    userId = ids().userId;
    full = await seedSession(sb, userId, tag, PNLS);
    // Nine trades: one short of the floor, to prove the gate is on the surface
    // and not only in the engine's unit tests.
    short = await seedSession(sb, userId, `${tag}s`, PNLS.slice(0, 9));
  });

  test.afterAll(async () => {
    for (const id of [full, short].filter(Boolean)) {
      await sb.from("chart_closed_trades").delete().eq("replay_session_id", id);
      await sb.from("replay_sessions").delete().eq("id", id);
    }
  });

  test("projects the seeded sample onto the distribution it claims to sample", async ({ page }) => {
    await openRiskTab(page, full);

    // The header states the sample it used. A projection off the wrong sample
    // is the failure mode that would otherwise pass every numeric check below
    // by a hair, so it is asserted first and exactly.
    await expect(
      page.getByText("1,000 bootstrapped paths × 12 trades, resampled from 12 closed trades"),
    ).toBeVisible();

    const chance = Number((await page.getByTestId("mc-chance-of-profit").innerText()).replace("%", ""));
    expect(
      Math.abs(chance - EXPECTED.chanceOfProfit.centre),
      `chance of profit ${chance}% is outside 3 SE of the exact 64.95%`,
    ).toBeLessThan(EXPECTED.chanceOfProfit.tol);

    console.log(
      `chance of profit  rendered ${chance.toFixed(1)}%  expected ` +
        `${EXPECTED.chanceOfProfit.centre}% ± ${EXPECTED.chanceOfProfit.tol}`,
    );

    for (const [testId, key] of [
      ["mc-median", "median"], ["mc-p5", "p5"], ["mc-p95", "p95"],
      ["mc-dd-median", "ddMedian"], ["mc-dd-p95", "ddP95"],
    ] as const) {
      const got = await currencyCell(page, testId);
      const { centre, tol } = EXPECTED[key];
      console.log(
        `${testId.padEnd(14)} rendered ${String(got).padStart(9)}  expected ` +
          `${centre} ± ${tol}  (off by ${(got - centre).toFixed(2)})`,
      );
      expect(
        Math.abs(got - centre),
        `${testId} rendered ${got}, expected ${centre} ± ${tol}`,
      ).toBeLessThan(tol);
    }

    // Exact, not a band: the longest-losing-run distribution is closed form.
    await expect(page.getByTestId("mc-streak")).toHaveText(EXPECTED_STREAK);

    // Exact, and load-bearing: a 12-trade path cannot lose more than 2,880 of
    // a 10,000 balance, so no path can reach the 5,000 ruin line.
    await expect(page.getByTestId("mc-risk-of-ruin")).toHaveText(EXPECTED_RUIN);

    // The worst single path must exceed the 95th percentile and stay inside
    // the arithmetic maximum, 12 × the largest loss.
    const worst = await currencyCell(page, "mc-dd-worst");
    console.log(`mc-dd-worst    rendered ${worst}  (ceiling ${12 * 240})`);
    console.log(`mc-streak      rendered ${await page.getByTestId("mc-streak").innerText()}  expected ${EXPECTED_STREAK}`);
    expect(worst).toBeGreaterThan(await currencyCell(page, "mc-dd-p95"));
    expect(worst).toBeLessThanOrEqual(12 * 240);
  });

  test("reads the same trades the summary does", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("thv:tour:completed:v1", "1"));
    await page.goto(`/replay/review?id=${full}`);
    // If these two disagree, the projection is running on a different sample
    // than the session reports — the exact divergence the shared engine exists
    // to prevent.
    await expect(page.getByText("228.25", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Session summary").getByText("12", { exact: true }).first()).toBeVisible();
  });

  test("withholds the projection one trade below the floor", async ({ page }) => {
    await openRiskTab(page, short);
    await expect(
      page.getByText("Monte Carlo needs at least 10 closed trades in the current selection."),
    ).toBeVisible();
    await expect(page.getByTestId("mc-chance-of-profit")).toHaveText("—");
    await expect(page.getByTestId("mc-median")).toHaveText("—");
  });
});
