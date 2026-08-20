import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, ids } from "./fixtures";

/**
 * MSYM-1 · secondary-symbol panes.
 *
 * ── Why the secondary here is the SAME instrument ──────────────────────────
 *
 * Only two of the 33 registered symbols have stored bars, and they are in
 * different markets on different base timeframes (BTC/USDT 5m, EUR/USD 15m).
 * A genuine two-instrument session therefore cannot be built OR verified
 * locally — exactly what MSYM-1 was parked on, and still true.
 *
 * So this drives the whole secondary path — fetch, project, fold, render —
 * with the secondary pointed at the session's own symbol. That is not a
 * weaker test of the thing that matters: the invariant under test is an
 * INEQUALITY between panes, and pointing both at one instrument makes any
 * drift maximally visible rather than hiding it behind two different tapes.
 * What it does not cover is grid misalignment between two real instruments.
 *
 * ── Predictions, stated before the run ─────────────────────────────────────
 *
 *   1. Pane 2 reports data-secondary="1"; pane 1 reports "0".
 *   2. Pane 2's newest bar is NEVER later than pane 1's. Equality is not
 *      asserted: pane 2 renders a 15m fold from the ladder, so its newest bar
 *      OPENS up to 10 minutes earlier than pane 1's 5m bar. `<=` is the whole
 *      guarantee; `==` would be asserting the ladder, not the clock.
 *   3. Both panes draw a non-empty tape — otherwise (2) passes vacuously.
 *   4. The secondary ADVANCES as the clock advances. A frozen pane also
 *      satisfies (2).
 *   5. All of the above still hold after a genuine reload, and the assignment
 *      persists. This is the point of the spec: within one session React state
 *      can hold two panes in agreement that a fresh mount would not.
 *   6. A secondary pane offers no way to place an order.
 *
 * BTC/USDT 5m on 2026-07-05 — one of only two symbols with stored candles.
 */

const TITLE = "E2E SECONDARY RUN";
const SYMBOL = "BTC/USDT";

async function seed(sb: SupabaseClient, userId: string, tag: string) {
  const { data, error } = await sb.from("replay_sessions").insert({
    user_id: userId,
    title: `${TITLE} ${tag}`,
    mode: "day",
    market: "crypto",
    symbol: SYMBOL,
    timeframe: "5m",
    replay_date: "2026-07-05",
    status: "active",
    initial_balance: 10_000,
    provider: "historical",
  }).select("id").single();
  if (error) throw new Error(`could not seed session: ${error.message}`);
  return String((data as { id: string }).id);
}

/**
 * Assign pane 2 its instrument through the same localStorage key the picker
 * writes, before the app mounts. The picker filters the session's own symbol
 * out of its options — correctly, since a fold pane already shows it better —
 * so seeding is how this path gets driven with the only data that exists.
 */
async function openStudio(page: Page, sessionId: string, secondary: string | null) {
  await page.addInitScript(
    ([id, sym]) => {
      localStorage.setItem("thv:tour:completed:v1", "1");
      localStorage.setItem(`thive.replay.panes.${id}`, "2");
      if (sym) localStorage.setItem(`thive.replay.panes.symbols.${id}`, JSON.stringify([null, sym, null, null]));
    },
    [sessionId, secondary] as const,
  );
  await page.goto(`/replay/studio?id=${sessionId}`);
  await page.getByTestId("pane-layout-bar").waitFor({ state: "visible", timeout: 120_000 });
  await expect(page.getByTestId("studio-chart").first()).toBeVisible({ timeout: 60_000 });
}

/** [primary, secondary] newest-bar open times, read from the DOM. */
async function lastBars(page: Page): Promise<(number | null)[]> {
  return page.$$eval('[data-testid="studio-chart"]', (els) =>
    els.map((e) => {
      const v = e.getAttribute("data-last-bar");
      return v ? Number(v) : null;
    }),
  );
}

async function waitForBothPanes(page: Page) {
  await expect
    .poll(async () => (await lastBars(page)).filter((v) => v != null).length, { timeout: 120_000 })
    .toBe(2);
}

test.describe("secondary-symbol panes", () => {
  let sb: SupabaseClient;
  let sessionId: string;
  const tag = `sec${Date.now().toString(36)}`;

  test.beforeAll(async () => {
    sb = db();
    sessionId = await seed(sb, ids().userId, tag);
  });

  test.afterAll(async () => {
    if (!sessionId) return;
    await sb.from("chart_closed_trades").delete().eq("replay_session_id", sessionId);
    await sb.from("replay_sessions").delete().eq("id", sessionId);
  });

  test("a secondary pane declares itself and never runs ahead of the clock", async ({ page }) => {
    await openStudio(page, sessionId, SYMBOL);
    await expect(page.getByTestId("studio-chart")).toHaveCount(2);

    const flags = await page.$$eval('[data-testid="studio-chart"]', (els) =>
      els.map((e) => e.getAttribute("data-secondary")),
    );
    expect(flags).toEqual(["0", "1"]);

    await waitForBothPanes(page);
    const [primary, secondary] = await lastBars(page);
    expect(primary).not.toBeNull();
    expect(secondary).not.toBeNull();
    expect(secondary!).toBeLessThanOrEqual(primary!);
  });

  test("the secondary advances with the clock rather than freezing", async ({ page }) => {
    await openStudio(page, sessionId, SYMBOL);
    await waitForBothPanes(page);
    const before = await lastBars(page);

    await page.getByTestId("studio-chart").first().click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");

    await expect
      .poll(async () => (await lastBars(page))[0], { timeout: 60_000 })
      .toBeGreaterThan(before[0]!);

    const after = await lastBars(page);
    expect(after[1]!).toBeGreaterThan(before[1]!);
    expect(after[1]!).toBeLessThanOrEqual(after[0]!);
  });

  test("the assignment and the sync both survive a fresh reload", async ({ page }) => {
    await openStudio(page, sessionId, SYMBOL);
    await waitForBothPanes(page);

    await page.reload();
    await page.getByTestId("pane-layout-bar").waitFor({ state: "visible", timeout: 120_000 });
    await expect(page.getByTestId("studio-chart")).toHaveCount(2);

    // Read from a mount that shares no React state with the one that set it.
    const flags = await page.$$eval('[data-testid="studio-chart"]', (els) =>
      els.map((e) => e.getAttribute("data-secondary")),
    );
    expect(flags).toEqual(["0", "1"]);

    await waitForBothPanes(page);
    const [primary, secondary] = await lastBars(page);
    expect(secondary!).toBeLessThanOrEqual(primary!);
  });

  test("a secondary pane cannot place an order", async ({ page }) => {
    await openStudio(page, sessionId, SYMBOL);
    await expect(page.getByTestId("studio-chart")).toHaveCount(2);

    const panes = page.getByTestId("studio-panes").locator("> div");
    const primary = panes.nth(0);
    const secondary = panes.nth(1);

    // Control first. Without it a count of zero on the secondary could just
    // mean the right-click missed the chart, which would pass for ever while
    // proving nothing. The menu is matched by its own marker attribute rather
    // than by item text: it renders "Buy Market" more than once by design
    // (ChartContextMenu.tsx:127), so a text count cannot say whose menu opened.
    await primary.click({ button: "right", position: { x: 140, y: 140 } });
    await expect(primary.locator("[data-chart-ctx-menu]")).toHaveCount(1);
    await page.mouse.click(4, 4);
    await expect(primary.locator("[data-chart-ctx-menu]")).toHaveCount(0);

    await secondary.click({ button: "right", position: { x: 140, y: 140 } });
    await expect(secondary.locator("[data-chart-ctx-menu]")).toHaveCount(0);
  });
});
