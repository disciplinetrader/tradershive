import { test, expect } from "@playwright/test";
import { db, demoAccount, seedWorkspace, TEST_SYMBOL } from "./fixtures";

/**
 * #4 — the floating order window: opens near the chart click, drags anywhere,
 * and still submits through the same path as the docked ticket.
 */
test.describe("floating order window", () => {
  let sb: ReturnType<typeof db>;
  let account: any;

  test.beforeAll(async () => {
    sb = db();
    account = await demoAccount(sb);
  });

  async function openAtChartPoint(page: any) {
    await seedWorkspace(page, account.id, TEST_SYMBOL);
    await page.goto("/trading");
    // The chart canvas has to exist before a right-click means anything.
    await page.waitForSelector("canvas", { timeout: 45_000 });
    const canvas = await page.locator("canvas").first().boundingBox();
    if (!canvas) throw new Error("no chart canvas");
    const click = {
      x: Math.round(canvas.x + canvas.width * 0.45),
      y: Math.round(canvas.y + canvas.height * 0.45),
    };
    await page.mouse.click(click.x, click.y, { button: "right" });
    await page.getByText("Buy Market", { exact: true }).click();
    return click;
  }

  test("opens near the click point and can be dragged anywhere", async ({ page }) => {
    const click = await openAtChartPoint(page);

    const win = page.getByTestId("floating-order-window");
    // --- ASSERTION 1: it opened ------------------------------------------
    await expect(win, "right-click -> Buy Market must open the floating ticket").toBeVisible();

    // --- ASSERTION 2: it opened NEAR the click ----------------------------
    const before = await win.boundingBox();
    if (!before) throw new Error("no bounding box for floating window");
    const dx0 = Math.abs(before.x - click.x);
    const dy0 = Math.abs(before.y - click.y);
    expect(dx0, `window x (${before.x}) should be near click x (${click.x})`).toBeLessThanOrEqual(60);
    expect(dy0, `window y (${before.y}) should be near click y (${click.y})`).toBeLessThanOrEqual(60);

    // --- ASSERTION 3: dragging the title bar moves it ---------------------
    const handle = await page.getByTestId("floating-order-window-handle").boundingBox();
    if (!handle) throw new Error("no drag handle");
    const grab = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    // Up and to the left, away from the viewport edges. The window is clamped
    // to stay fully on screen, so a downward drag from mid-chart would be
    // testing the clamp rather than the drag.
    const move = { dx: -180, dy: -90 };

    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + move.dx / 2, grab.y + move.dy / 2, { steps: 8 });
    await page.mouse.move(grab.x + move.dx, grab.y + move.dy, { steps: 8 });
    await page.mouse.up();

    const after = await win.boundingBox();
    if (!after) throw new Error("window vanished during drag");
    expect(
      Math.abs((after.x - before.x) - move.dx),
      `window should have moved ${move.dx}px in x (moved ${after.x - before.x})`,
    ).toBeLessThanOrEqual(6);
    expect(
      Math.abs((after.y - before.y) - move.dy),
      `window should have moved ${move.dy}px in y (moved ${after.y - before.y})`,
    ).toBeLessThanOrEqual(6);

    // --- ASSERTION 4: it is still a working ticket, not a screenshot ------
    // Pre-flight (and so the margin bar) only exists once a quantity is set.
    const qty = win.locator("#ticket-qty").first();
    await qty.fill("0.01");
    await qty.blur();
    await expect(
      win.getByTestId("margin-usage-bar"),
      "the dragged window must still render live pre-flight state",
    ).toBeVisible();
  });

  test("submits an order through the floating window", async ({ page }) => {
    const { data: beforeRows } = await sb.from("paper_trades")
      .select("id").eq("account_id", account.id).eq("status", "open").is("deleted_at", null);
    const beforeIds = new Set((beforeRows ?? []).map((r: any) => r.id));

    await openAtChartPoint(page);
    const win = page.getByTestId("floating-order-window");
    await expect(win).toBeVisible();

    // Smallest tradeable size, so this costs the account as little as possible.
    // Without an explicit quantity the ticket has nothing to submit and the
    // click is a silent no-op.
    const qty = win.locator("#ticket-qty").first();
    await expect(qty).toBeVisible();
    await qty.fill("0.01");
    await qty.blur();

    // Must be the SUBMIT button, not the long/short toggle — both are named
    // "Buy". The submit control carries the explicit "Buy market order" label
    // precisely so the two are distinguishable.
    const buy = win.getByRole("button", { name: /buy market order/i }).first();
    await expect(buy, "the submit control must be present and enabled").toBeEnabled();
    // The ticket scrolls inside the window; bring the control into view rather
    // than forcing a click at coordinates that may be off-screen.
    await buy.scrollIntoViewIfNeeded();

    const winBox = await win.boundingBox();
    const buyBox = await buy.boundingBox();
    const vp = page.viewportSize();
    const geom =
      `viewport ${vp?.width}x${vp?.height}; window ` +
      `${JSON.stringify(winBox && { x: Math.round(winBox.x), y: Math.round(winBox.y), w: Math.round(winBox.width), h: Math.round(winBox.height) })}; ` +
      `buy ${JSON.stringify(buyBox && { x: Math.round(buyBox.x), y: Math.round(buyBox.y), h: Math.round(buyBox.height) })}`;
    expect(buyBox, `submit button must have a box — ${geom}`).not.toBeNull();
    expect(
      buyBox!.y + buyBox!.height,
      `submit button must sit inside the viewport — ${geom}`,
    ).toBeLessThanOrEqual((vp?.height ?? 0));

    await buy.click();

    // Any pre-flight warning (no stop loss, high leverage) routes through a
    // confirmation dialog rather than submitting straight away.
    const confirm = page.getByRole("button", { name: /place trade anyway/i });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();

    // --- ASSERTION 5: a new open trade actually appeared ------------------
    let created: string | null = null;
    await expect
      .poll(async () => {
        const { data } = await sb.from("paper_trades")
          .select("id, symbol").eq("account_id", account.id)
          .eq("status", "open").is("deleted_at", null);
        const fresh = (data ?? []).find((r: any) => !beforeIds.has(r.id));
        created = fresh?.id ?? null;
        return created;
      }, { message: "submitting from the floating window must create a trade", timeout: 25_000 })
      .not.toBeNull();

    // Clean up: openTrade only inserts a row (balance moves on close), so
    // removing the row restores the account exactly.
    if (created) await sb.from("paper_trades").delete().eq("id", created);
  });
});
