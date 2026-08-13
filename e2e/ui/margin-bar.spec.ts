import { test, expect } from "@playwright/test";
import { db, demoAccount, seedWorkspace, TEST_SYMBOL } from "./fixtures";
import { findSymbol } from "../../src/lib/paper-trading/symbols";

/**
 * #3 (margin bar) — the bar must render, and its numbers and colour must match
 * the margin arithmetic the acceptance gate uses. The gate is invisible until
 * you hit it, so a bar that disagrees with it is worse than no bar.
 */
test.describe("margin usage bar", () => {
  let sb: ReturnType<typeof db>;
  let account: any;

  test.beforeAll(async () => {
    sb = db();
    account = await demoAccount(sb);
  });

  async function openTicket(page: any) {
    await seedWorkspace(page, account.id, TEST_SYMBOL);
    await page.goto("/trading");
    await page.waitForSelector("canvas", { timeout: 45_000 });
    // The Order tab is the workspace default; only click it if something else
    // is selected, so a persisted pref cannot leave us on the wrong panel.
    const orderTab = page.getByRole("tab", { name: /order/i }).first();
    if (await orderTab.getAttribute("aria-selected") !== "true") await orderTab.click();
    await page.waitForSelector("#ticket-qty", { timeout: 30_000 });
  }

  test("renders, and width and tone follow the underlying numbers", async ({ page }) => {
    await openTicket(page);

    const meta = findSymbol(TEST_SYMBOL)!;

    // The ticket's pre-flight — and therefore the bar — only exists once there
    // is a usable quantity. An empty field means there is no order to measure.
    await page.locator("#ticket-qty").first().fill(String(meta.minLot));
    await page.locator("#ticket-qty").first().blur();

    const bar = page.getByTestId("margin-usage-bar").first();
    // --- ASSERTION 1: it exists at all ------------------------------------
    await expect(bar, "the margin usage bar must render in the order ticket").toBeVisible();

    // Three lot sizes chosen to land in the three tone bands.
    const cases: { lot: number; expectTone: "ok" | "warning" | "danger" }[] = [
      { lot: meta.minLot, expectTone: "ok" },
      { lot: Number((meta.minLot * 800).toFixed(4)), expectTone: "warning" },
      { lot: Number((meta.minLot * 1600).toFixed(4)), expectTone: "danger" },
    ];

    // Stable existing id on the ticket's quantity field.
    const lotInput = page.locator("#ticket-qty").first();

    for (const c of cases) {
      await lotInput.fill(String(c.lot));
      await lotInput.blur();

      // Read what the component says about itself.
      await expect
        .poll(async () => bar.getAttribute("data-order-pct"), { timeout: 10_000 })
        .not.toBeNull();

      const totalPct = Number(await bar.getAttribute("data-total-pct"));
      const orderPct = Number(await bar.getAttribute("data-order-pct"));
      const usedPct = Number(await bar.getAttribute("data-used-pct"));
      const tone = await bar.getAttribute("data-tone");

      // --- ASSERTION 2: the parts add up -----------------------------------
      expect(
        Math.abs(totalPct - (usedPct + orderPct)),
        `total (${totalPct}) must equal used (${usedPct}) + order (${orderPct})`,
      ).toBeLessThan(0.02);

      // --- ASSERTION 3: tone matches the documented thresholds -------------
      const expectedTone = totalPct >= 80 ? "danger" : totalPct >= 50 ? "warning" : "ok";
      expect(tone, `tone for total ${totalPct}% should be ${expectedTone}`).toBe(expectedTone);

      // --- ASSERTION 4: rendered width tracks the percentage ---------------
      const track = bar.locator('[role="progressbar"]');
      const trackBox = await track.boundingBox();
      const orderSeg = await bar.getByTestId("margin-usage-order").boundingBox();
      if (trackBox && orderSeg && trackBox.width > 0) {
        const renderedPct = (orderSeg.width / trackBox.width) * 100;
        const clampedExpected = Math.min(Math.max(0, 100 - Math.min(100, usedPct)), orderPct);
        expect(
          Math.abs(renderedPct - clampedExpected),
          `order segment width ${renderedPct.toFixed(1)}% should match ${clampedExpected.toFixed(1)}%`,
        ).toBeLessThan(2);
      }

      // --- ASSERTION 5: aria value stays in sync ---------------------------
      expect(Number(await track.getAttribute("aria-valuenow")))
        .toBe(Math.round(totalPct));
    }
  });

  test("warns explicitly at the point the order would be refused", async ({ page }) => {
    await openTicket(page);

    const meta = findSymbol(TEST_SYMBOL)!;
    // Stable existing id on the ticket's quantity field.
    const lotInput = page.locator("#ticket-qty").first();
    await lotInput.fill(String(meta.minLot));
    await lotInput.blur();

    const bar = page.getByTestId("margin-usage-bar").first();
    await expect(bar).toBeVisible();
    // Deliberately far past available funds.
    await lotInput.fill(String(meta.minLot * 100000));
    await lotInput.blur();

    await expect
      .poll(async () => Number(await bar.getAttribute("data-total-pct")), { timeout: 10_000 })
      .toBeGreaterThan(100);

    // --- ASSERTION 6: the bar says so, in words --------------------------
    await expect(
      bar.getByText(/Exceeds available funds/i),
      "past 100% the bar must state the order will be rejected",
    ).toBeVisible();
    expect(await bar.getAttribute("data-tone")).toBe("danger");
  });
});
