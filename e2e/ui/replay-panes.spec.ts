import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, ids } from "./fixtures";

/**
 * Multi-pane replay — one symbol, N folds of one dataset.
 *
 * Predictions, stated before the run and derived from `aggregatableFrom`
 * rather than from the app:
 *
 *   base 5m  →  ladder ["5m","15m","30m","1H","2H","4H","1D","1W"]
 *   1 pane   →  ["5m"]
 *   2 panes  →  ["5m","15m"]
 *   4 panes  →  ["5m","15m","30m","1H"]
 *
 * And the two invariants that make the layout safe rather than merely pretty:
 * exactly ONE set of focused-chart controls no matter how many panes (there is
 * one account behind all of them), and a layout that survives a reload.
 *
 * BTC/USDT 5m on 2026-07-05 — one of only two symbols with stored candles.
 */

const TITLE = "E2E PANES RUN";

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
    initial_balance: 10_000,
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

/** The fold each pane is rendering, left to right. */
async function paneTimeframes(page: Page): Promise<string[]> {
  return page.$$eval('[data-testid="studio-chart"]', (els) =>
    els.map((e) => e.getAttribute("data-timeframe") ?? ""),
  );
}

test.describe("multi-pane replay", () => {
  let sb: SupabaseClient;
  let sessionId: string;
  const tag = `pn${Date.now().toString(36)}`;

  test.beforeAll(async () => {
    sb = db();
    sessionId = await seed(sb, ids().userId, tag);
  });

  test.afterAll(async () => {
    if (sessionId) {
      await sb.from("chart_closed_trades").delete().eq("replay_session_id", sessionId);
      await sb.from("replay_sessions").delete().eq("id", sessionId);
    }
  });

  test("opens on one pane at the dataset's own base timeframe", async ({ page }) => {
    await openStudio(page, sessionId);

    await expect(page.getByTestId("studio-panes")).toHaveAttribute("data-pane-count", "1");
    await expect(page.getByTestId("studio-chart")).toHaveCount(1);
    expect(await paneTimeframes(page)).toEqual(["5m"]);
  });

  test("splits into two and then four, climbing the fold ladder", async ({ page }) => {
    await openStudio(page, sessionId);

    await page.getByTestId("pane-layout-2").click();
    await expect(page.getByTestId("studio-chart")).toHaveCount(2);
    expect(await paneTimeframes(page)).toEqual(["5m", "15m"]);

    await page.getByTestId("pane-layout-4").click();
    await expect(page.getByTestId("studio-chart")).toHaveCount(4);
    // 5m cannot fold to 1m or 3m — those bars were never loaded — so the
    // ladder climbs rather than spanning the timeframe list.
    expect(await paneTimeframes(page)).toEqual(["5m", "15m", "30m", "1H"]);

    // Every pane draws: four folds, four canvases, none of them blank.
    await expect(page.locator('[data-testid="studio-chart"] canvas').first()).toBeVisible();
    const canvases = await page.locator('[data-testid="studio-chart"] canvas').count();
    expect(canvases).toBeGreaterThanOrEqual(4);
  });

  test("keeps exactly one set of focused-chart controls", async ({ page }) => {
    await openStudio(page, sessionId);
    await page.getByTestId("pane-layout-4").click();
    await expect(page.getByTestId("studio-chart")).toHaveCount(4);

    // One account, one position, one risk budget behind all four panes. Four
    // Buy buttons would be four ways to ask the same question — and four
    // drawing rails would be four writers of one annotation store.
    await expect(page.getByRole("button", { name: "Indicators" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Buy", exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Sell", exact: true })).toHaveCount(1);
  });

  test("a pane's own timeframe survives a change of layout", async ({ page }) => {
    await openStudio(page, sessionId);
    await page.getByTestId("pane-layout-2").click();
    await expect(page.getByTestId("studio-chart")).toHaveCount(2);

    // Move pane 1 up to 4H through its own toolbar.
    await page.getByTestId("studio-panes").locator("> div > div").first()
      .getByRole("button", { name: "4H", exact: true }).click();
    await expect
      .poll(async () => (await paneTimeframes(page))[0], { timeout: 15_000 })
      .toBe("4H");

    // Widening the layout must not reset a fold the trader chose by hand.
    await page.getByTestId("pane-layout-4").click();
    await expect(page.getByTestId("studio-chart")).toHaveCount(4);
    expect((await paneTimeframes(page))[0]).toBe("4H");
  });

  test("remembers the layout across a reload", async ({ page }) => {
    await openStudio(page, sessionId);
    await page.getByTestId("pane-layout-4").click();
    await expect(page.getByTestId("studio-chart")).toHaveCount(4);

    await page.reload();
    await page.getByTestId("pane-layout-bar").waitFor({ state: "visible", timeout: 120_000 });
    await expect(page.getByTestId("studio-panes")).toHaveAttribute("data-pane-count", "4", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("studio-chart")).toHaveCount(4);
  });
});
