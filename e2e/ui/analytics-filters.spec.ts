import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * Analytics filters — URL persistence, and that filtering narrows the DATA.
 *
 * The predicate itself has 16 unit cases and five mutations behind it
 * (`lib/statistics/__tests__/filters.test.ts`). What unit tests cannot see is
 * the part that only exists in a browser: that a filtered URL reproduces the
 * filtered view on load, that the chips describe it, and that removing a chip
 * writes back to the URL.
 *
 * Where the dataset allows it, the assertion is on the "Total Trades" KPI —
 * the one place a test can watch the DATA narrow rather than watch a control
 * render. An account with no trades cannot show that, so those assertions skip
 * loudly rather than pass vacuously: a green run that proved nothing is worse
 * than a skipped one that says so.
 */

async function openAnalytics(page: Page, search = "") {
  await page.addInitScript(() => localStorage.setItem("thv:tour:completed:v1", "1"));
  await page.goto(`/analytics${search}`);
  await page.getByTestId("kpi-total-trades").waitFor({ state: "visible", timeout: 90_000 });
}

/** The Total Trades KPI as a number, or null when the tile has no figure. */
async function totalTrades(page: Page): Promise<number | null> {
  const txt = (await page.getByTestId("kpi-total-trades").textContent()) ?? "";
  const m = txt.replace(/total trades/i, "").match(/-?[\d,]+/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * The Total Trades KPI once it has stopped moving.
 *
 * The tile renders before the dataset finishes arriving, so a single read races
 * the fetch: an earlier version of this test measured 36, filtered, cleared,
 * and measured 45 — the page had grown underneath it and the "filter" appeared
 * to lose trades it never touched. Two equal consecutive reads is the cheapest
 * honest signal that the data has settled.
 */
async function settledTotal(page: Page): Promise<number | null> {
  let last: number | null = null;
  for (let i = 0; i < 20; i += 1) {
    const now = await totalTrades(page);
    if (now != null && now === last) return now;
    last = now;
    await page.waitForTimeout(500);
  }
  return last;
}

test.describe("analytics filters", () => {
  test("a filtered URL reproduces the filtered view on load", async ({ page }) => {
    await openAnalytics(page, "?outcome=win&days=1&hf=8&ht=12");

    // The chips are built from the PARSED filters, so their presence proves the
    // URL reached the provider — not merely that a control was clicked.
    const chips = page.getByTestId("filter-chips");
    await expect(chips).toBeVisible();
    await expect(chips).toContainText(/Outcome: win/i);
    await expect(chips).toContainText(/Day: Mon/i);
    await expect(chips).toContainText(/Time: 8:00/i);

    // Clear-all appears only when something is actually narrowing.
    await expect(page.getByTestId("filters-clear-all")).toBeVisible();
  });

  test("removing a chip writes back to the URL", async ({ page }) => {
    await openAnalytics(page, "?outcome=win&days=1");

    await page.getByRole("button", { name: /Remove filter Outcome: win/i }).click();

    await expect.poll(() => new URL(page.url()).searchParams.get("outcome")).toBeNull();
    /**
     * The other filter survives — removing one chip must not clear the rest.
     *
     * Asserted as "still in the URL, and still applied", NOT as an exact
     * string. The router JSON-encodes what it writes, so this param is
     * literally `days="1"` with quotes; pinning that byte sequence would be
     * testing the router's serialisation rather than this feature. What matters
     * is that the value round-trips back into a live filter, which the chip
     * below proves — and `statsFiltersFromSearch` unwraps the encoding.
     */
    expect(new URL(page.url()).search).toContain("days=");
    await expect(page.getByTestId("filter-chips")).toContainText(/Day: Mon/i);
  });

  test("Clear all empties both the chips and the URL", async ({ page }) => {
    await openAnalytics(page, "?outcome=loss&days=2&hf=9");

    await page.getByTestId("filters-clear-all").click();

    await expect.poll(() => new URL(page.url()).search).toBe("");
    await expect(page.getByTestId("filter-chips")).toHaveCount(0);
    await expect(page.getByTestId("filters-clear-all")).toHaveCount(0);
  });

  test("the filter narrows the dataset, not just the chips", async ({ page }) => {
    /**
     * Measured WITHIN ONE PAGE LOAD, deliberately.
     *
     * An earlier version compared counts across two navigations and produced
     * nonsense — 22 unfiltered, then 36 "filtered". The dataset is fetched per
     * load and the KPI tile renders before it settles, so the two numbers came
     * from different data, not from different filters. Applying the filter
     * through the UI keeps one dataset in memory and isolates the variable.
     */
    await openAnalytics(page);
    const before = await settledTotal(page);

    test.skip(
      before == null || before === 0,
      "account has no analytics trades — nothing to narrow, so this would pass vacuously",
    );

    // A one-hour window: whatever the data, this can only shrink the set.
    await page.getByRole("button", { name: /Time & BE/i }).click();
    await page.getByLabel("Hour from").fill("3");
    await page.getByLabel("Hour to").fill("3");
    await page.keyboard.press("Escape");

    // The chip proves the filter is live; the KPI proves the DATA moved.
    await expect(page.getByTestId("filter-chips")).toContainText(/Time: 3:00/i);
    await expect.poll(async () => await totalTrades(page), { timeout: 20_000 })
      .toBeLessThan(before!);

    // And clearing it restores the original count — so the change was the
    // filter, not the page drifting underneath the measurement.
    await page.getByTestId("filters-clear-all").click();
    await expect.poll(async () => await settledTotal(page), { timeout: 30_000 }).toBe(before!);
  });
});
