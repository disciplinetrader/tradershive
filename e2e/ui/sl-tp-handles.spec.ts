import { test, expect } from "@playwright/test";
import {
  db, ids, runAccount, createTestPosition, seedWorkspace, waitForPositionLine,
  centreOf, grabPointOf, chartBox, TEST_SYMBOL,
} from "./fixtures";

/**
 * #1 — SL/TP handles must follow TradingView's model:
 *   hover the position -> handles appear (NO click) -> drag -> price is set.
 *
 * The assertions below are deliberately about real pixels and the real
 * database row, because the previous two attempts at this feature both passed
 * a plausible-looking review and were wrong in the app.
 */
test.describe("SL/TP hover-and-drag", () => {
  let sb: ReturnType<typeof db>;
  let account: any;
  let trade: any;
  let dispose: () => Promise<void>;

  test.beforeAll(async () => {
    sb = db();
    account = await runAccount(sb);
    const made = await createTestPosition(sb, account.id, TEST_SYMBOL, ids().userId);
    trade = made.trade;
    dispose = made.dispose;
  });

  test.afterAll(async () => { await dispose?.(); });

  // Each test starts from "no protective levels" so the add-handles are what
  // is on screen, regardless of what the previous test left behind.
  test.beforeEach(async () => {
    await sb.from("paper_trades")
      .update({ stop_loss: null, take_profit: null }).eq("id", trade.id);
  });

  test("handles appear on hover with no prior click, and drag sets the price", async ({ page }) => {
    await seedWorkspace(page, account.id, TEST_SYMBOL);
    await page.goto("/trading");
    await waitForPositionLine(page, trade.id);

    const slAdd = page.getByTestId(`sl-add-${trade.id}`);
    const entry = await centreOf(page, `entry-line-${trade.id}`);

    // --- ASSERTION 1: nothing is revealed before hovering -------------------
    // Park the pointer far from the position first.
    await page.mouse.move(entry.x, entry.y + 260);
    await expect(slAdd, "SL handle must be hidden until the position is hovered").toBeHidden();

    // --- ASSERTION 2: hover alone reveals it, with no click -----------------
    await page.mouse.move(entry.x - 120, entry.y);
    await expect(slAdd, "hovering the position must reveal the SL handle").toBeVisible();

    // --- ASSERTION 3: it is draggable immediately ---------------------------
    const handle = await grabPointOf(page, `sl-add-${trade.id}`);
    const plot = await chartBox(page);
    // Stay well inside the plot: a drop outside it has no price to map to.
    const targetY = Math.round(
      Math.min(entry.y + 90, plot.y + plot.height - 40),
    );

    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x, (handle.y + targetY) / 2, { steps: 8 });
    await page.mouse.move(handle.x, targetY, { steps: 8 });
    await page.mouse.up();

    // Database first: it is the contract. If this passes but the line below
    // does not appear, the bug is rendering; if it fails, the drag never
    // committed at all.
    await expect
      .poll(async () => {
        const { data } = await sb.from("paper_trades").select("stop_loss").eq("id", trade.id).single();
        return data?.stop_loss == null ? null : Number(data.stop_loss);
      }, {
        message:
          `drag must persist a stop. grabbed at (${Math.round(handle.x)},${Math.round(handle.y)}), `
          + `dropped at (${Math.round(handle.x)},${targetY}), entry pill at `
          + `(${Math.round(entry.x)},${Math.round(entry.y)}), plot ${Math.round(plot.y)}..${Math.round(plot.y + plot.height)}`,
        timeout: 15_000,
      })
      .not.toBeNull();

    // The real line replaces the add-handle once a level exists.
    const slLine = page.getByTestId(`sl-line-${trade.id}`);
    await expect(slLine, "a real stop line must exist after the drag").toBeVisible();

    // --- ASSERTION 4: the line sits where it was dropped --------------------
    const dropped = await centreOf(page, `sl-line-${trade.id}`);
    expect(
      Math.abs(dropped.y - targetY),
      `stop line should render at the drop point (dropped y=${dropped.y}, target y=${targetY})`,
    ).toBeLessThanOrEqual(4);

    // --- ASSERTION 5: the persisted price matches the label at that point ---
    const labelText = (await slLine.innerText()).replace(/[^\d.]/g, " ").trim();
    const shownPrice = Number(labelText.split(/\s+/).filter(Boolean).pop());
    expect(Number.isFinite(shownPrice), `could not parse price from "${labelText}"`).toBe(true);

    await expect
      .poll(async () => {
        const { data } = await sb.from("paper_trades").select("stop_loss").eq("id", trade.id).single();
        return data?.stop_loss == null ? null : Number(data.stop_loss);
      }, { message: "stop_loss must persist to the database", timeout: 15_000 })
      .not.toBeNull();

    const { data: row } = await sb.from("paper_trades").select("stop_loss").eq("id", trade.id).single();
    const saved = Number(row!.stop_loss);
    expect(
      Math.abs(saved - shownPrice) / shownPrice,
      `saved stop ${saved} must match the on-chart label ${shownPrice}`,
    ).toBeLessThan(0.001);

    // --- ASSERTION 6: dragging DOWN from entry produced a LOWER price -------
    // (y grows downward, so a lower point on screen is a lower price.)
    expect(saved, "a stop dropped below entry must be below the entry price")
      .toBeLessThan(Number(trade.entry_price));
  });

  test("the target handle works the same way", async ({ page }) => {
    await seedWorkspace(page, account.id, TEST_SYMBOL);
    await page.goto("/trading");
    await waitForPositionLine(page, trade.id);

    const tpAdd = page.getByTestId(`tp-add-${trade.id}`);
    const entry = await centreOf(page, `entry-line-${trade.id}`);

    await page.mouse.move(entry.x, entry.y + 260);
    await expect(tpAdd, "TP handle must be hidden until hover").toBeHidden();

    await page.mouse.move(entry.x - 120, entry.y);
    await expect(tpAdd, "hover must reveal the TP handle").toBeVisible();

    const handle = await grabPointOf(page, `tp-add-${trade.id}`);
    const plot = await chartBox(page);
    const targetY = Math.round(Math.max(entry.y - 90, plot.y + 40));
    await page.mouse.move(handle.x, handle.y);
    await page.mouse.down();
    await page.mouse.move(handle.x, (handle.y + targetY) / 2, { steps: 6 });
    await page.mouse.move(handle.x, targetY, { steps: 6 });
    await page.mouse.up();

    const tpLine = page.getByTestId(`tp-line-${trade.id}`);
    await expect(tpLine, "a real target line must exist after the drag").toBeVisible();

    const dropped = await centreOf(page, `tp-line-${trade.id}`);
    expect(
      Math.abs(dropped.y - targetY),
      `target line should render at the drop point (dropped y=${dropped.y}, target y=${targetY})`,
    ).toBeLessThanOrEqual(4);

    await expect
      .poll(async () => {
        const { data } = await sb.from("paper_trades").select("take_profit").eq("id", trade.id).single();
        return data?.take_profit == null ? null : Number(data.take_profit);
      }, { message: "take_profit must persist", timeout: 15_000 })
      .not.toBeNull();

    const { data: row } = await sb.from("paper_trades").select("take_profit").eq("id", trade.id).single();
    expect(Number(row!.take_profit), "a target dropped above entry must be above the entry price")
      .toBeGreaterThan(Number(trade.entry_price));
  });
});
