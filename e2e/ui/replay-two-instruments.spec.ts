import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, ids } from "./fixtures";

/**
 * MSYM-1 · two REAL instruments on one clock.
 *
 * This is the spec `replay-secondary-symbol.spec.ts` could not be. That one
 * points the secondary pane at the session's own symbol, because no second
 * symbol had stored bars; it proves the plumbing and structurally cannot prove
 * the feature. This one runs EUR/USD against GBP/USD and is the observation
 * MSYM-1 closes on.
 *
 * ── Data prerequisite, and it is a real one ────────────────────────────────
 *
 * Both symbols need 15m bars in `historical_candles` covering the session
 * date. EUR/USD has held 2026-06-26 to 08-14 since 2026-08-18. GBP/USD depends
 * on an on-demand backfill having actually written — and that write is
 * SWALLOWED when it fails: `historical/service.server.ts:288` catches the
 * error and warns. So an empty GBP/USD tape here means the import never
 * landed, not that the projection is broken. `guardData` separates those two
 * outcomes rather than letting one masquerade as the other.
 *
 * ── Predictions, stated before the run ─────────────────────────────────────
 *
 *   1. The pane-2 picker offers GBP/USD: same market as the session, with the
 *      session's own symbol filtered out.
 *   2. The two panes report DIFFERENT data-symbol values, both with non-empty
 *      tapes. This is the assertion the same-symbol spec cannot make.
 *   3. The secondary's newest bar is never later than the primary's. Both
 *      instruments are 15m, but the panes carry different FOLDS from the
 *      ladder, so the guarantee stays `<=` rather than `==`.
 *   4. Both advance as the clock advances — neither freezes.
 *   5. A trade on the PRIMARY leaves the secondary in step, and the secondary
 *      offers no way to trade at all. That is the design, not a limitation.
 *   6. All of it survives a genuine reload.
 */

const TITLE = "E2E TWO INSTRUMENT RUN";
const PRIMARY = "EUR/USD";
const SECONDARY = "GBP/USD";
/** Mid-window Wednesday inside EUR/USD's stored range. Forex has no weekend. */
const REPLAY_DATE = "2026-07-15";

async function seed(sb: SupabaseClient, userId: string, tag: string) {
  const { data, error } = await sb.from("replay_sessions").insert({
    user_id: userId,
    title: `${TITLE} ${tag}`,
    mode: "day",
    market: "forex",
    symbol: PRIMARY,
    timeframe: "15m",
    replay_date: REPLAY_DATE,
    status: "active",
    initial_balance: 10_000,
    provider: "historical",
  }).select("id").single();
  if (error) throw new Error(`could not seed session: ${error.message}`);
  return String((data as { id: string }).id);
}

async function openStudio(page: Page, sessionId: string) {
  await page.addInitScript(
    (id) => {
      localStorage.setItem("thv:tour:completed:v1", "1");
      localStorage.setItem(`thive.replay.panes.${id}`, "2");
    },
    sessionId,
  );
  await page.goto(`/replay/studio?id=${sessionId}`);
  await page.getByTestId("pane-layout-bar").waitFor({ state: "visible", timeout: 120_000 });
  await expect(page.getByTestId("studio-chart")).toHaveCount(2, { timeout: 60_000 });
}

/** Assign pane 2 through the real picker — the entry point a trader uses. */
async function assignSecondary(page: Page, symbol: string) {
  const picker = page.getByTestId("pane-symbol-1");
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(picker.locator(`option[value="${symbol}"]`)).toHaveCount(1);
  await picker.selectOption(symbol);
}

async function panes(page: Page): Promise<{ symbol: string; lastBar: number | null }[]> {
  return page.$$eval('[data-testid="studio-chart"]', (els) =>
    els.map((e) => {
      const v = e.getAttribute("data-last-bar");
      return { symbol: e.getAttribute("data-symbol") ?? "", lastBar: v ? Number(v) : null };
    }),
  );
}

async function waitForBothTapes(page: Page) {
  await expect
    .poll(async () => (await panes(page)).filter((p) => p.lastBar != null).length, { timeout: 120_000 })
    .toBe(2);
}

/**
 * Fail with the RIGHT diagnosis when GBP/USD has no bars. Without this the
 * suite reports "panes out of sync" for what is actually a missing backfill,
 * and the next person goes looking in the projection.
 */
async function guardData(page: Page) {
  const p = await panes(page);
  const secondary = p[1];
  expect(
    secondary?.lastBar,
    `pane 2 (${secondary?.symbol}) drew no bars. Check historical_candles for ` +
      `${SECONDARY} 15m covering ${REPLAY_DATE} — the on-demand import is caught ` +
      `and warned rather than thrown, so a failed backfill looks like an empty chart.`,
  ).not.toBeNull();
}

test.describe("two instruments on one clock", () => {
  let sb: SupabaseClient;
  let sessionId: string;
  const tag = `two${Date.now().toString(36)}`;

  /**
   * Bars present for the SECONDARY symbol. Read with the authenticated client:
   * `historical_candles` grants SELECT to `authenticated` and its `hc_read`
   * policy is `USING (true)`. (The repo also grants it to `anon`
   * — `20260720091538_*.sql:90` — but the live database denies that, so an
   * anon read is not an option. Drift worth knowing about separately.)
   */
  let secondaryBars = 0;

  test.beforeAll(async () => {
    sb = db();
    sessionId = await seed(sb, ids().userId, tag);

    const { count, error } = await sb
      .from("historical_candles")
      .select("*", { count: "exact", head: true })
      .eq("symbol", SECONDARY)
      .eq("timeframe", "15m");
    if (error) throw new Error(`could not count ${SECONDARY} bars: ${error.message}`);
    secondaryBars = count ?? 0;
    // eslint-disable-next-line no-console
    console.log(`[two-instruments] ${SECONDARY} 15m stored bars: ${secondaryBars}`);
  });

  /**
   * The data prerequisite is checked, not assumed. Without this the whole file
   * fails as "panes out of sync" when the real cause is a backfill that never
   * ran — the on-demand import is caught and warned
   * (`historical/service.server.ts:288`), so a missing symbol looks exactly
   * like an empty chart. Skipping with the count in the message keeps the
   * distinction visible, and the specs start running by themselves the moment
   * the bars land.
   */
  test.beforeEach(() => {
    test.skip(
      secondaryBars === 0,
      `${SECONDARY} 15m has no stored bars. Open a ${SECONDARY} 15m replay ` +
        `session on the deployment over ${REPLAY_DATE} to trigger the on-demand ` +
        `backfill, then re-run. Nothing about the projection is being tested here.`,
    );
  });

  test.afterAll(async () => {
    if (!sessionId) return;
    await sb.from("chart_closed_trades").delete().eq("replay_session_id", sessionId);
    await sb.from("replay_sessions").delete().eq("id", sessionId);
  });

  test("the picker offers the other instrument and the pane renders it", async ({ page }) => {
    await openStudio(page, sessionId);
    await assignSecondary(page, SECONDARY);
    await waitForBothTapes(page);
    await guardData(page);

    const [a, b] = await panes(page);
    expect(a.symbol).toBe(PRIMARY);
    expect(b.symbol).toBe(SECONDARY);
    expect(a.symbol).not.toBe(b.symbol);
  });

  test("the secondary instrument never runs ahead of the clock", async ({ page }) => {
    await openStudio(page, sessionId);
    await assignSecondary(page, SECONDARY);
    await waitForBothTapes(page);
    await guardData(page);

    const [primary, secondary] = await panes(page);
    expect(secondary.lastBar!).toBeLessThanOrEqual(primary.lastBar!);
  });

  test("both instruments advance together rather than one freezing", async ({ page }) => {
    await openStudio(page, sessionId);
    await assignSecondary(page, SECONDARY);
    await waitForBothTapes(page);
    await guardData(page);
    const before = await panes(page);

    await page.getByTestId("studio-chart").first().click({ position: { x: 5, y: 5 } });
    for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");

    await expect
      .poll(async () => (await panes(page))[0].lastBar, { timeout: 60_000 })
      .toBeGreaterThan(before[0].lastBar!);

    const after = await panes(page);
    expect(after[1].lastBar!).toBeGreaterThan(before[1].lastBar!);
    expect(after[1].lastBar!).toBeLessThanOrEqual(after[0].lastBar!);
  });

  test("a trade on the primary leaves the secondary in step", async ({ page }) => {
    await openStudio(page, sessionId);
    await assignSecondary(page, SECONDARY);
    await waitForBothTapes(page);
    await guardData(page);

    const grid = page.getByTestId("studio-panes").locator("> div");
    const primaryPane = grid.nth(0);
    const secondaryPane = grid.nth(1);

    // Placed through the same right-click path a trader uses.
    await primaryPane.click({ button: "right", position: { x: 160, y: 160 } });
    await expect(primaryPane.locator("[data-chart-ctx-menu]")).toHaveCount(1);
    await primaryPane.getByText("Buy Market", { exact: true }).first().click();

    await expect
      .poll(async () => {
        const p = await panes(page);
        return p[1].lastBar! <= p[0].lastBar!;
      }, { timeout: 30_000 })
      .toBe(true);

    // Asserted, not assumed: the secondary has no trading menu at all.
    await secondaryPane.click({ button: "right", position: { x: 160, y: 160 } });
    await expect(secondaryPane.locator("[data-chart-ctx-menu]")).toHaveCount(0);
  });

  test("the pairing and the sync survive a fresh reload", async ({ page }) => {
    await openStudio(page, sessionId);
    await assignSecondary(page, SECONDARY);
    await waitForBothTapes(page);

    await page.reload();
    await page.getByTestId("pane-layout-bar").waitFor({ state: "visible", timeout: 120_000 });
    await expect(page.getByTestId("studio-chart")).toHaveCount(2);
    await waitForBothTapes(page);
    await guardData(page);

    // A mount that shares no React state with the one that made the pairing.
    const [primary, secondary] = await panes(page);
    expect(primary.symbol).toBe(PRIMARY);
    expect(secondary.symbol).toBe(SECONDARY);
    expect(secondary.lastBar!).toBeLessThanOrEqual(primary.lastBar!);
  });
});
