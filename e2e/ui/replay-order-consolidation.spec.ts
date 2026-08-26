import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, ids } from "./fixtures";

/**
 * Studio order entry, after consolidation — one Buy, one Sell.
 *
 * Studio used to carry THREE Buy affordances: a toolbar "Buy limit" that armed
 * the draft flow, a toolbar "Buy" that fired a market order, and a sidebar
 * "Buy market" that fired a different-sized market order. They did not agree:
 * only the toolbar pair passed a size, so the sidebar pair and the B/S hotkeys
 * took `placeMarketOrder`'s `?? 1` fallback and opened 1-unit positions
 * regardless of the Risk % field.
 *
 * This file asserts the three things that consolidation had to get right, and
 * it drives the REAL toolbar rather than the context — three buttons rendering
 * is exactly the defect, so the count is part of the assertion.
 *
 * The sizing test checks that quantity RESPONDS TO Risk %, which is the claim
 * being made. "Qty is not 1" is too weak on its own — at a BTC price near
 * 50,000 the correct size is itself ~1, so it would pass for the wrong reason.
 * Doubling Risk % must double the quantity; the old `?? 1` fallback is a
 * constant and cannot.
 *
 * An earlier draft asserted the absolute invariant
 * `size × |entry − stop| === equity × riskPercent` and FAILED against correct
 * code, which is worth recording. Studio sizes at the price under the cursor
 * when the button is clicked, but a market order needs one observation to
 * fill, and it fills at the NEXT bar's price while the stop stays where it was
 * placed. Measured: sized at 63,072.01, filled at 63,144.01 — 72 points of
 * drift, turning an intended $99.65 of risk into $156.53 realized. The blotter
 * reports `averageEntry` (the fill), so any absolute check through the DOM
 * measures the drift rather than the sizing. That drift is a pre-existing
 * property of Studio's market-order model, unchanged by the consolidation and
 * not this file's subject — but it is why the assertion below is a ratio.
 *
 * BTC/USDT 5m on 2026-07-05 — the symbol these specs have stored candles for.
 */

const TITLE = "E2E ORDER CONSOLIDATION RUN";
const BALANCE = 10_000;
/** Studio's default Risk % — the toolbar input's initial state. */
const RISK_PCT = 1;

async function seed(sb: SupabaseClient, userId: string, tag: string) {
  const { data, error } = await sb.from("replay_sessions").insert({
    user_id: userId,
    title: `${TITLE} ${tag}`,
    mode: "day",
    market: "crypto",
    symbol: "BTC/USDT",
    timeframe: "5m",
    replay_date: "2026-07-05",
    status: "active",
    initial_balance: BALANCE,
    provider: "historical",
  }).select("id").single();
  if (error) throw new Error(`could not seed session: ${error.message}`);
  return String((data as { id: string }).id);
}

async function openStudio(page: Page, sessionId: string) {
  await page.addInitScript(() => localStorage.setItem("thv:tour:completed:v1", "1"));
  await page.goto(`/replay/studio?id=${sessionId}`);
  await page.getByTestId("pane-layout-bar").waitFor({ state: "visible", timeout: 120_000 });
  await expect(page.getByTestId("studio-chart").first()).toBeVisible({ timeout: 60_000 });
}

const chartCanvas = (page: Page) =>
  page.locator('[data-testid="studio-chart"] canvas').first();

/**
 * A market order is triggerable on sight (`engine.ts` — `case "market": return
 * true`) but still needs ONE observation to fill, and Studio opens paused. The
 * step-forward hotkey supplies it. Focus sits on the toolbar button after the
 * click, which is not a typing target, so the binding is live.
 */
async function stepOneBar(page: Page) {
  await page.keyboard.press("ArrowRight");
}

/**
 * Open a session, set Risk %, buy, and report the quantity the blotter shows.
 *
 * ⚠ Each call needs its OWN session. Studio snapshots its book and RESUMES it
 * on the next load of the same session id, so calling this twice against one
 * session reads back the FIRST buy's position and reports its quantity again.
 * That failure is quiet and convincing: entry, stop and target all match too,
 * because they were placed at the same cursor. It cost a debugging pass here,
 * and it will bite the RS-4 Stage B spec the same way.
 *
 * The Risk input is filled BEFORE the click so focus lands on the button
 * afterwards: `StudioHotkeys.isTypingTarget` ignores keys while an input has
 * focus, so stepping the bar from inside the field would silently do nothing.
 */
async function buyAtRisk(page: Page, sessionId: string, riskPct: number): Promise<number> {
  await openStudio(page, sessionId);
  await page.getByLabel("Risk per trade in percent of equity").fill(String(riskPct));
  await page.getByTestId("studio-buy").click();
  await stepOneBar(page);

  // The positions blotter is the only table with rows at this point.
  const row = page.locator("table tbody tr").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const cells = row.locator("td");
  const num = async (i: number) => Number((await cells.nth(i).textContent())?.replace(/[^0-9.-]/g, ""));
  // Symbol, Side, Qty, Avg entry, Stop, Target, Price, P/L, R, Manage
  const [qty, entry, stop] = [await num(2), await num(3), await num(4)];
  expect(Number.isFinite(qty) && qty > 0).toBe(true);
  // A long's stop sits below its entry — proves we read the row we think we did.
  expect(stop).toBeLessThan(entry);
  return qty;
}

// The first spec to touch /replay/studio pays Vite's cold-start compile, which
// on a cold dev server exceeds the 90s default on its own.
test.describe.configure({ timeout: 180_000 });

test.describe("studio order entry is one Buy and one Sell", () => {
  let sb: SupabaseClient;
  let sessionId: string;
  /** Sessions seeded mid-test; disposed alongside the shared one. */
  const extraSessions: string[] = [];
  const tag = `oc${Date.now().toString(36)}`;

  test.beforeAll(async () => {
    sb = db();
    sessionId = await seed(sb, ids().userId, tag);
  });

  test.afterAll(async () => {
    for (const id of [sessionId, ...extraSessions].filter(Boolean)) {
      await sb.from("chart_closed_trades").delete().eq("replay_session_id", id);
      await sb.from("replay_sessions").delete().eq("id", id);
    }
  });

  test("the toolbar offers exactly one Buy and one Sell", async ({ page }) => {
    await openStudio(page, sessionId);

    await expect(page.getByTestId("studio-buy")).toHaveCount(1);
    await expect(page.getByTestId("studio-sell")).toHaveCount(1);
    await expect(page.getByTestId("studio-buy")).toBeVisible();
    await expect(page.getByTestId("studio-sell")).toBeVisible();

    // The three removed controls. Named exactly, because a partial match would
    // also catch the survivors.
    for (const gone of ["Buy limit", "Sell limit", "Buy market", "Sell market"]) {
      await expect(page.getByRole("button", { name: gone, exact: true })).toHaveCount(0);
    }
  });

  test("Buy fills a market order sized off Risk %, not a 1-unit fallback", async ({ page }) => {
    // One session per measurement — see the warning on `buyAtRisk`.
    const [one, two] = [await seed(sb, ids().userId, `${tag}a`), await seed(sb, ids().userId, `${tag}b`)];
    extraSessions.push(one, two);

    const atOne = await buyAtRisk(page, one, RISK_PCT);
    const atTwo = await buyAtRisk(page, two, RISK_PCT * 2);

    // The fallback's fingerprint. Weak alone, which is why the ratio follows.
    expect(atOne).not.toBe(1);

    // Twice the risk budget over the same stop distance is twice the size.
    // Both loads start at the same cursor with no trades, so equity is 10,000
    // in each and the only variable is the Risk % field. Tolerance covers the
    // blotter's 2dp rounding of the quantity.
    expect(atTwo / atOne).toBeGreaterThan(1.95);
    expect(atTwo / atOne).toBeLessThan(2.05);
  });

  test("right-click still opens the limit/stop draft flow", async ({ page }) => {
    await openStudio(page, sessionId);

    const box = await chartCanvas(page).boundingBox();
    if (!box) throw new Error("no chart canvas");
    // Below mid-screen is below the market, so the buy intent is a LIMIT.
    // The menu labels it "Buy Stop" on the other side of the price; both route
    // into the same draft, hence the tolerant name match.
    await page.mouse.click(
      Math.round(box.x + box.width * 0.5),
      Math.round(box.y + box.height * 0.7),
      { button: "right" },
    );
    // ChartContextMenu rows are plain <button>s, not menuitems (:170).
    await page.getByRole("button", { name: /Buy (Limit|Stop)/i }).click();

    await expect(page.getByTestId("studio-draft-order")).toBeVisible();
    await expect(page.getByTestId("draft-status-bar")).toBeVisible();
    // Nothing is committed by opening a draft.
    await expect(page.getByTestId("draft-commit")).toBeDisabled();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("studio-draft-order")).toHaveCount(0);
  });
});
