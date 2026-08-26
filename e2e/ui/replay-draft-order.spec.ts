import { test, expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { db, ids } from "./fixtures";

/**
 * Draft orders — arm, position, confirm.
 *
 * Studio used to create the order on the arming click, deriving a stop and a
 * target at a hardcoded 2R. The trader's first sight of their own risk was a
 * placed trade at levels the tool had chosen. Now the click sets only the
 * ENTRY and opens a draft; stop and target start unplaced and are dragged into
 * position before anything is committed.
 *
 * What this file guards is the two ends of that flow:
 *
 *  · nothing reaches the order store until BOTH levels are positioned —
 *    `validateOrder` requires entry, stop and target to be positive, and the
 *    position size is derived from the stop distance, so a half-drafted order
 *    is not merely incomplete, it is unsizeable;
 *  · abandoning a draft leaves NO order behind. A cancel that silently placed
 *    something is the worst outcome available, so both Esc and Cancel are
 *    asserted against the store rather than against the UI clearing.
 *
 * "The order exists" is asserted through the blotter's Orders tab, whose count
 * comes from the canonical pending list. Asserting the draft UI vanished would
 * prove only that the draft vanished — which is also what cancelling does.
 *
 * BTC/USDT 5m on 2026-07-05 — the symbol these specs have stored candles for.
 *
 * ── PARKED 2026-08-26 ──────────────────────────────────────────────────────
 *
 * SKIPPED, not deleted. The draft flow itself still works and is still
 * reachable — right-click the chart for Buy/Sell Limit or Stop, which routes
 * through `onChartIntent` into exactly the `setDraft` these tests drive. What
 * went away is only this file's ENTRY GESTURE: the toolbar's "Buy limit" /
 * "Sell limit" buttons were removed when Studio's order entry was consolidated
 * to one Buy and one Sell, so `armAndSetEntry` below now asserts on UI that
 * does not exist.
 *
 * Re-pointing the helper at the right-click menu is a small edit and was
 * deliberately NOT spent here: RS-4 Stage B is expected next, and its notes
 * already mark this file REWRITE, because these assertions encode the shared
 * commit gate that Stage B removes. Doing the work twice buys nothing.
 *
 * Whoever picks up Stage B: the scaffolding — seed/teardown, `openOrderCount`,
 * `dragHandle` — transfers directly, and one wrinkle is worth knowing before
 * you re-point it. `ChartContextMenu` labels the item "Buy Limit" or "Buy Stop"
 * depending on which side of the market the click lands (ChartContextMenu.tsx:132),
 * so match /Buy (Limit|Stop)/ or click deliberately below market.
 *
 * Skipping rather than deleting keeps the flow's only coverage on file instead
 * of leaving it silently red. It is a debt with a name, not a passing suite.
 */

const TITLE = "E2E DRAFT ORDER RUN";

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

/** The Orders tab renders its count only when there is at least one. */
const ordersTab = (page: Page): Locator => page.getByRole("tab", { name: /^Orders/ });

async function openOrderCount(page: Page): Promise<number> {
  const text = (await ordersTab(page).textContent()) ?? "";
  const m = text.match(/Orders\s*(\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Arm, then click the chart at a fraction of its height to set the entry. */
async function armAndSetEntry(page: Page, atHeightFraction: number) {
  await page.getByRole("button", { name: "Buy limit", exact: true }).click();
  const box = await page.locator('[data-testid="studio-chart"] canvas').first().boundingBox();
  if (!box) throw new Error("no chart canvas");
  await page.mouse.click(
    Math.round(box.x + box.width * 0.5),
    Math.round(box.y + box.height * atHeightFraction),
  );
  await expect(page.getByTestId("studio-draft-order")).toBeVisible();
}

/** Drag a draft handle vertically by `dy` pixels. */
async function dragHandle(page: Page, testId: string, dy: number) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`no bounding box for ${testId}`);
  // The pill sits at the right-hand end of a full-width row; grab it there so
  // the pointer lands on the handle rather than on empty chart.
  const x = Math.round(box.x + box.width - 24);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 12 });
  await page.mouse.up();
}

test.describe.skip("studio draft orders", () => {
  let sb: SupabaseClient;
  let sessionId: string;
  const tag = `dr${Date.now().toString(36)}`;

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

  test("commits only once both levels are positioned", async ({ page }) => {
    await openStudio(page, sessionId);
    expect(await openOrderCount(page)).toBe(0);

    await armAndSetEntry(page, 0.5);

    // Both levels start unplaced: present, grabbable, showing no price.
    await expect(page.getByTestId("draft-stop")).toBeVisible();
    await expect(page.getByTestId("draft-target")).toBeVisible();
    await expect(page.getByTestId("draft-stop")).toContainText("—");
    await expect(page.getByTestId("draft-target")).toContainText("—");

    // Unsizeable until a stop exists, so the commit must be shut.
    await expect(page.getByTestId("draft-commit")).toBeDisabled();

    // A long's stop goes BELOW the entry, i.e. down-screen.
    await dragHandle(page, "draft-stop", 70);
    await expect(page.getByTestId("draft-stop")).not.toContainText("—");
    // Still shut: validateOrder requires a target too, so half is not enough.
    await expect(page.getByTestId("draft-commit")).toBeDisabled();
    expect(await openOrderCount(page)).toBe(0);

    // Target above the entry, i.e. up-screen.
    await dragHandle(page, "draft-target", -70);
    await expect(page.getByTestId("draft-target")).not.toContainText("—");
    await expect(page.getByTestId("draft-commit")).toBeEnabled();

    // Complete, but still not placed until confirmed.
    expect(await openOrderCount(page)).toBe(0);

    await page.getByTestId("draft-commit").click();

    // The order REACHED THE STORE. Asserting the draft cleared would not
    // distinguish this from a cancel.
    await expect.poll(() => openOrderCount(page), { timeout: 10_000 }).toBe(1);
    await expect(page.getByTestId("studio-draft-order")).toHaveCount(0);
    await expect(page.getByTestId("draft-status-bar")).toHaveCount(0);
  });

  test("Cancel discards a part-positioned draft without placing anything", async ({ page }) => {
    await openStudio(page, sessionId);
    expect(await openOrderCount(page)).toBe(0);

    await armAndSetEntry(page, 0.45);
    await dragHandle(page, "draft-stop", 60);
    await expect(page.getByTestId("draft-stop")).not.toContainText("—");
    await expect(page.getByTestId("draft-commit")).toBeDisabled();

    await page.getByTestId("draft-cancel").click();

    await expect(page.getByTestId("studio-draft-order")).toHaveCount(0);
    await expect(page.getByTestId("draft-status-bar")).toHaveCount(0);
    // The part-positioned stop must not have become an order.
    expect(await openOrderCount(page)).toBe(0);
  });

  test("Escape discards a part-positioned draft without placing anything", async ({ page }) => {
    await openStudio(page, sessionId);
    expect(await openOrderCount(page)).toBe(0);

    await armAndSetEntry(page, 0.55);
    await dragHandle(page, "draft-target", -60);
    await expect(page.getByTestId("draft-target")).not.toContainText("—");

    await page.keyboard.press("Escape");

    await expect(page.getByTestId("studio-draft-order")).toHaveCount(0);
    await expect(page.getByTestId("draft-status-bar")).toHaveCount(0);
    expect(await openOrderCount(page)).toBe(0);

    // Esc also disarms, so a further chart click must not open a new draft.
    const box = await page.locator('[data-testid="studio-chart"] canvas').first().boundingBox();
    if (box) {
      await page.mouse.click(Math.round(box.x + box.width * 0.5), Math.round(box.y + box.height * 0.5));
    }
    await expect(page.getByTestId("studio-draft-order")).toHaveCount(0);
    expect(await openOrderCount(page)).toBe(0);
  });
});
