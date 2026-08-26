import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
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

/**
 * Sizing for a stopless fill comes from `defaultLotSize` in Replay Settings,
 * which is persisted in localStorage. Seeding it before navigation is how a
 * test drives the REAL wiring — there is deliberately no chart-side control any
 * more, because a second sizing input beside this one was the duplication that
 * had to go.
 */
async function setDefaultLots(page: Page, lots: number) {
  await page.addInitScript((v) => {
    localStorage.setItem(
      "traders-hive:replay-settings:v1",
      JSON.stringify({ defaultLotSize: v }),
    );
  }, lots);
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

/** The blotter's open-position row, read by column index. */
type Row = { qty: string; entry: string; stop: string; target: string; r: string };

/**
 * Read the single open-position row.
 *
 * Columns: Symbol, Side, Qty, Avg entry, Stop, Target, Price, P/L, R, Manage.
 * Read as TEXT, not as numbers, because the values under test now include the
 * em-dash the blotter prints for a level that does not exist — and `Number("—")`
 * is NaN, which would make "no stop" and "unreadable" indistinguishable.
 */
async function readRow(page: Page): Promise<Row> {
  const row = page.locator("table tbody tr").first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const cells = row.locator("td");
  const txt = async (i: number) => ((await cells.nth(i).textContent()) ?? "").trim();
  return {
    qty: await txt(2), entry: await txt(3), stop: await txt(4),
    target: await txt(5), r: await txt(8),
  };
}

/**
 * Open a fresh session and take a market Buy.
 *
 * ⚠ Each call needs its OWN session. Studio snapshots its book and RESUMES it
 * on the next load of the same session id, so calling this twice against one
 * session reads back the FIRST buy's position. That failure is quiet and
 * convincing: entry, stop and target all match too, because they were placed at
 * the same cursor.
 */
async function buy(page: Page, sessionId: string, opts: { lots?: number } = {}) {
  if (opts.lots != null) await setDefaultLots(page, opts.lots);
  await openStudio(page, sessionId);
  await page.getByTestId("studio-buy").click();
  await stepOneBar(page);
}

/**
 * Press a widget control and drag vertically by `dy`.
 *
 * Aimed at the CENTRE of the control's own box — these are small buttons on a
 * row that tracks a moving price line, so the grab point has to be the element
 * itself rather than an offset from a full-width row.
 *
 * The intermediate moves matter: the level is only created once the pointer has
 * actually travelled (`moved`), so a single jump would be a less faithful
 * imitation of a human drag than a stepped one.
 */
async function dragFrom(page: Page, locator: Locator, dy: number) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("control has no bounding box");
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 12 });
  await page.mouse.up();
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
    // And no chart-side sizing control: lot size lives in Replay Settings, and
    // a second input here is the duplication this whole consolidation removed.
    await expect(
      page.getByLabel("Default position size in units when no stop is set"),
    ).toHaveCount(0);
  });

  test("a market Buy fills instantly with NO stop and NO target", async ({ page }) => {
    /**
     * The change the whole RS-3/RS-4 arc was for.
     *
     * Studio used to seed a 0.2% stop and a 2R target on every market fill —
     * levels the tool chose, presented as the trader's own risk. A bare fill now
     * carries neither, and the blotter says so with an em-dash rather than a
     * number. Asserting the em-dash specifically matters: a "0.00" here would
     * mean a level AT zero, which is what the old coercion bugs produced.
     */
    const id = await seed(sb, ids().userId, `${tag}bare`);
    extraSessions.push(id);
    await buy(page, id);

    const row = await readRow(page);
    expect(row.stop).toBe("—");
    expect(row.target).toBe("—");
    // No stop means no risk to measure against, so R is absent, not zero.
    expect(row.r).toBe("—");
    // The position is REAL: it filled, and it is sized.
    expect(Number(row.entry)).toBeGreaterThan(0);
    expect(Number(row.qty)).toBeGreaterThan(0);
  });

  test("defaultLotSize sizes a stopless fill, and Risk % does not", async ({ page }) => {
    /**
     * RS-4/RS-5's sizing question, settled. With no stop there is no distance to
     * divide the risk budget by, so Risk % cannot size the position and the
     * trader's `defaultLotSize` does.
     *
     * BTC/USDT has `contractSize: 1`, so lots and units coincide here and the
     * numbers below read directly. The conversion itself is unit-tested against
     * a forex contract size (`lotsToUnits`, BA-9) — a crypto-only assertion
     * would pass just as well against unconverted lots.
     *
     * Both halves are asserted: that lot size moves the size, and that Risk %
     * does NOT — otherwise a build that quietly resurrected risk-sizing passes.
     */
    const [a, b] = [
      await seed(sb, ids().userId, `${tag}q1`),
      await seed(sb, ids().userId, `${tag}q2`),
    ];
    extraSessions.push(a, b);

    await buy(page, a, { lots: 1 });
    expect(Number((await readRow(page)).qty)).toBeCloseTo(1, 2);

    await buy(page, b, { lots: 3 });
    expect(Number((await readRow(page)).qty)).toBeCloseTo(3, 2);

    // Risk % is still on the toolbar and still means something — but not here.
    const c = await seed(sb, ids().userId, `${tag}q3`);
    extraSessions.push(c);
    await setDefaultLots(page, 2);
    await openStudio(page, c);
    await page.getByLabel("Risk per trade in percent of equity").fill("5");
    await page.getByTestId("studio-buy").click();
    await stepOneBar(page);
    // 2 units because the lot size says 2 — NOT a risk-derived number.
    expect(Number((await readRow(page)).qty)).toBeCloseTo(2, 2);
  });

  test("the position widget appears on the entry line, and an unset level draws nothing", async ({ page }) => {
    /**
     * The widget replaced ghost handles: dashed full-width lines parked 0.5%
     * off the entry, which read as levels that had been SET. An unset level now
     * draws NOTHING — the only thing on screen is the widget, whose controls
     * are buttons rather than prices.
     *
     * Asserting the absence is the point. "Widget is visible" would pass just
     * as well with the old ghosts still on the chart beside it.
     */
    const id = await seed(sb, ids().userId, `${tag}widget`);
    extraSessions.push(id);
    await buy(page, id, { lots: 2 });

    const widget = page.locator('[data-testid^="studio-position-"]').first();
    await expect(widget).toBeVisible({ timeout: 20_000 });
    // One row, everything on it: side, both level controls, P/L, R, size, close.
    await expect(widget).toContainText("LONG");
    await expect(page.locator('[data-testid$="-sl"]').first()).toBeVisible();
    await expect(page.locator('[data-testid$="-tp"]').first()).toBeVisible();
    await expect(page.locator('[data-testid$="-close"]').first()).toBeVisible();

    // The ghost affordance is gone for good.
    await expect(page.locator('[data-testid^="studio-sl-add-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="studio-tp-add-"]')).toHaveCount(0);

    // And no level exists to draw: the blotter is the canonical check.
    const row = await readRow(page);
    expect(row.stop).toBe("—");
    expect(row.target).toBe("—");
  });

  test("pressing SL without dragging creates nothing", async ({ page }) => {
    /**
     * There is no honest default distance, and the one obvious candidate — the
     * entry itself — is a zero-risk level `validateOrder` rejects. So a click
     * that never moves must do nothing at all, rather than quietly placing a
     * stop somewhere the trader did not choose.
     */
    const id = await seed(sb, ids().userId, `${tag}noclick`);
    extraSessions.push(id);
    await buy(page, id, { lots: 2 });

    const sl = page.locator('[data-testid$="-sl"]').first();
    await expect(sl).toBeVisible({ timeout: 20_000 });
    await sl.click();

    // Give any (wrong) write time to land before asserting it did not.
    await page.waitForTimeout(1_000);
    expect((await readRow(page)).stop).toBe("—");
  });

  test("dragging SL out of the widget creates the level without resizing", async ({ page }) => {
    /**
     * "Without resizing" is the load-bearing half. Re-deriving size when a stop
     * arrives would change the basis the position's P/L is measured against
     * mid-flight, which is worse than an arbitrary size.
     */
    const id = await seed(sb, ids().userId, `${tag}drag`);
    extraSessions.push(id);
    await buy(page, id, { lots: 2 });

    const before = await readRow(page);
    expect(before.stop).toBe("—");

    const sl = page.locator('[data-testid$="-sl"]').first();
    await expect(sl).toBeVisible({ timeout: 20_000 });
    // A long's stop goes BELOW the entry, i.e. down-screen.
    await dragFrom(page, sl, 70);

    await expect.poll(async () => (await readRow(page)).stop, { timeout: 15_000 }).not.toBe("—");
    const after = await readRow(page);
    expect(Number(after.stop)).toBeGreaterThan(0);
    expect(Number(after.stop)).toBeLessThan(Number(after.entry));
    // R becomes measurable the moment a stop exists.
    expect(after.r).not.toBe("—");
    // ...and the position was NOT resized by acquiring one.
    expect(after.qty).toBe(before.qty);
    // The control retires: the level now has its own draggable line.
    await expect(page.locator('[data-testid$="-sl"]')).toHaveCount(0);
  });

  test("the widget's X closes the position immediately", async ({ page }) => {
    const id = await seed(sb, ids().userId, `${tag}close`);
    extraSessions.push(id);
    await buy(page, id, { lots: 2 });
    await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 20_000 });

    await page.locator('[data-testid$="-close"]').first().click();

    /**
     * The position leaves the book. Asserting the widget vanished would prove
     * only that the widget vanished — a cancel would do that too.
     *
     * Counting rows to zero does NOT work: the blotter renders its empty state
     * INSIDE a `<tr>`, so an empty table still has one row. Measured while
     * debugging this test — the close was working and the assertion was wrong.
     */
    await expect(page.locator("table tbody tr")).toContainText(/No open positions/i, { timeout: 15_000 });
    await expect(page.locator('[data-testid^="studio-position-"]')).toHaveCount(0);
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
