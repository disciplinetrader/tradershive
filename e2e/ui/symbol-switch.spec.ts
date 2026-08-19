import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { db, ids, runAccount, seedWorkspace } from "./fixtures";

/**
 * Switching instruments through the picker — the path a trader actually uses.
 *
 * Two questions in one run.
 *
 * 1. Is the BTC-under-GBP/USD symptom gone? A switch used to be able to leave
 *    the previous instrument's `market` attached, routing the new symbol's
 *    candles to the old venue. `setSymbol` now refuses rather than half-apply.
 *    The falsifiable form: after switching to GBP/USD the price on the BUY
 *    button must be ~1.3, not ~60,000. A Bitcoin-magnitude number under a
 *    GBP/USD header is the exact bug.
 *
 * 2. Does on-demand backfill work through the normal UI? `twelveDataCandles`
 *    is a cache-through: on under 90% coverage it fetches and writes
 *    `historical_candles`. GBP/USD had ZERO rows when this was written, so if
 *    rows appear after the switch, the backfill works and MSYM-1's "no data"
 *    premise is refuted — through the UI, not through a localStorage edit.
 *
 * BTC/USDT is seeded first ON PURPOSE: the bug needed a previous symbol whose
 * market differed, and BTC is what the original screenshot showed.
 */

const FROM = { symbol: "BTC/USDT", market: "crypto" };
const TO = "GBP/USD";

/** Sanity bounds. GBP/USD trades near 1.3; BTC near 60,000+. */
const GBP_MAX = 10;
const BTC_MIN = 1_000;

/** Price on the BUY button, or null while it is still a dash. */
async function buyPrice(page: Page): Promise<number | null> {
  const txt = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /^BUY/i.test(x.innerText.trim()),
    );
    return b?.innerText.trim().replace(/\s+/g, " ") ?? null;
  });
  if (!txt || /—/.test(txt)) return null;
  const n = Number(txt.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function gbpBars(sb: ReturnType<typeof db>): Promise<number> {
  const { count } = await sb
    .from("historical_candles")
    .select("ts", { count: "exact", head: true })
    .eq("symbol", TO);
  return count ?? 0;
}

test.describe("switching instruments through the picker", () => {
  let sb: ReturnType<typeof db>;
  let account: { id: string };

  test.beforeAll(async () => {
    sb = db();
    account = await runAccount(sb);
  });

  test("switches venue with the symbol, and backfills on demand", async ({ page }) => {
    const before = await gbpBars(sb);
    console.log(`GBP/USD bars before: ${before}`);

    await seedWorkspace(page, account.id, FROM.symbol);
    await page.goto("/trading");
    await page.waitForSelector("canvas", { timeout: 45_000 });

    // Establish the "previous symbol" the bug needed: a real BTC price.
    await expect.poll(() => buyPrice(page), { timeout: 45_000 }).not.toBeNull();
    const btc = (await buyPrice(page))!;
    console.log(`BTC/USDT price: ${btc}`);
    expect(btc, "BTC should quote in the thousands").toBeGreaterThan(BTC_MIN);

    // Switch through the picker — not localStorage. That distinction is the
    // whole point: seeding storage proved the fetch works, never that the UI
    // sets the market correctly on a normal switch.
    await page.getByTitle(/Change symbol/i).click();
    // The list is scoped to the active market tab, which opens on the CURRENT
    // symbol's market — so reaching a forex pair from a crypto chart means
    // clicking the tab first. Note this tab click calls `setMarket` on its own,
    // leaving symbol and market disagreeing until a symbol is picked.
    await page.getByRole("tab", { name: "Forex" }).click();
    await page.getByRole("combobox").fill(TO);
    await page.getByRole("option", { name: new RegExp(TO, "i") }).first().click();

    // ── Q1: is the BTC-under-GBP/USD symptom gone? ──────────────────────
    await expect
      .poll(() => buyPrice(page), {
        message: "GBP/USD never produced a price after the switch",
        timeout: 60_000,
      })
      .not.toBeNull();
    const gbp = (await buyPrice(page))!;
    console.log(`GBP/USD price after switch: ${gbp}`);

    expect(
      gbp,
      `GBP/USD is quoting ${gbp} — a Bitcoin-magnitude number means the ` +
        `previous instrument's market is still attached`,
    ).toBeLessThan(GBP_MAX);

    // The failure the wrong venue produced: Binance has no GBP/USD.
    await expect(page.getByText("No historical data is available for this symbol yet")).toHaveCount(0);

    // ── Q2: did the cache-through actually WRITE rows? ──────────────────
    //
    // Separate question from "did it fetch". `twelveDataCandles` reads and
    // writes `historical_candles` through `supabaseAdmin`, which needs
    // SUPABASE_SERVICE_ROLE_KEY. Without it the fetch still succeeds and the
    // chart still renders — the quote above proves that — while the cache
    // write fails silently. So the persistence half is only assertable where
    // the key exists, and asserting it locally would fail for a reason that
    // has nothing to do with the code under test.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log(
        `GBP/USD bars still ${await gbpBars(sb)} — SUPABASE_SERVICE_ROLE_KEY is unset, ` +
          `so the cache WRITE cannot run here. The fetch and render are proven by the ` +
          `${gbp} quote above; persistence needs an environment with the key.`,
      );
      // "Market data paused" is the visible consequence of the same missing
      // key, so it is only a defect where the key is present.
      return;
    }

    await expect(page.getByText("Market data paused")).toHaveCount(0);
    await expect
      .poll(async () => gbpBars(sb), {
        message: "GBP/USD candles never reached historical_candles",
        timeout: 60_000,
      })
      .toBeGreaterThan(0);

    const after = await gbpBars(sb);
    console.log(`GBP/USD bars after: ${after} (was ${before})`);
    expect(after).toBeGreaterThan(before);
  });
});
