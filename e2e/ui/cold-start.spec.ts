import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { db, runAccount } from "./fixtures";
import { findSymbol } from "../../src/lib/paper-trading/symbols";

/**
 * #2 — what a cold workspace shows before the feed has said anything.
 *
 * The failure this covers was not a wrong number, it was a *plausible* one:
 * with no quote yet, the ticket published the catalog's `refPrice` seed, so
 * gold sat at 2432 against a ~4355 market with the BUY button enabled and
 * `PositionsTable`'s close ready to send it as `exit_price`. Nothing on screen
 * said the price was invented.
 *
 * Two separate paths have to be right and are checked separately here, because
 * "the chart is blank" and "the button has no price" look identical to a user
 * and have nothing to do with each other:
 *
 *   quotes  — `useLiveQuotes` → the BUY/SELL price
 *   candles — `ChartEngine` → the chart itself
 *
 * Run across one symbol per asset class: they take different provider routes
 * (Binance for crypto, Twelve Data for forex/metals/equities) and the credit
 * budget only bites on the Twelve Data ones.
 */

const CASES = [
  { symbol: "XAU/USD", market: "metals" },
  { symbol: "GBP/USD", market: "forex" },
  { symbol: "BTC/USDT", market: "crypto" },
  { symbol: "AAPL", market: "stocks" },
] as const;

/** How long a cold workspace may take to show a real price. */
const FIRST_QUOTE_TIMEOUT = 30_000;

async function openWorkspace(page: Page, accountId: string, symbol: string, market: string) {
  await page.addInitScript(
    ([a, s, m]) => {
      localStorage.setItem("th_paper_account", a as string);
      localStorage.setItem("th_paper_symbol", s as string);
      localStorage.setItem("th_paper_market", m as string);
      localStorage.setItem("thv:tour:completed:v1", "1");
    },
    [accountId, symbol, market],
  );
  await page.goto("/trading");
  await page.waitForSelector("canvas", { timeout: 45_000 });
}

/** The BUY button's price, or null while it is still a dash. */
async function buyPrice(page: Page): Promise<number | null> {
  const txt = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button"))
      .find((x) => /^BUY/i.test(x.innerText.trim()));
    return b?.innerText.trim().replace(/\s+/g, " ") ?? null;
  });
  if (!txt || /—/.test(txt)) return null;
  const n = Number(txt.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

test.describe("cold start shows real data or nothing", () => {
  let sb: ReturnType<typeof db>;
  let account: any;

  test.beforeAll(async () => {
    sb = db();
    account = await runAccount(sb);
  });

  for (const { symbol, market } of CASES) {
    test(`${symbol} quotes and draws`, async ({ page }) => {
      const meta = findSymbol(symbol)!;
      await openWorkspace(page, account.id, symbol, market);

      // --- ASSERTION 1: a real price arrives ------------------------------
      const t0 = Date.now();
      await expect
        .poll(() => buyPrice(page), {
          message: `${symbol}: the BUY button never showed a price`,
          timeout: FIRST_QUOTE_TIMEOUT,
        })
        .not.toBeNull();
      const price = (await buyPrice(page))!;
      const quoteMs = Date.now() - t0;

      // --- ASSERTION 2: it is not the catalog seed ------------------------
      // The exact bug: `refPrice` is a static value from when the catalog was
      // authored, and it used to be published as though it were the market.
      expect(
        price,
        `${symbol}: the price on the BUY button is the catalog seed (${meta.refPrice}), `
          + `which means a seed is reaching the live path again`,
      ).not.toBe(meta.refPrice);

      // --- ASSERTION 3: the chart has candles, not a skeleton --------------
      // `ChartEngine` renders the shimmer with aria-busy while candles is
      // empty, so its absence IS "candles arrived". Checked separately from
      // the quote: a blank chart and a dash on the button are different bugs
      // that look the same on screen.
      await expect(
        page.locator('[aria-busy="true"]').filter({ hasText: `Loading ${symbol}` }),
        `${symbol}: the chart never loaded candles`,
      ).toHaveCount(0, { timeout: 45_000 });

      // --- ASSERTION 4: no cold-start error card --------------------------
      await expect(
        page.getByText("Market data paused"),
        `${symbol}: the chart reported it could not load market data`,
      ).toHaveCount(0);

      console.log(`${symbol.padEnd(9)} quote ${String(quoteMs).padStart(5)}ms → ${price} (seed ${meta.refPrice})`);
    });
  }
});
