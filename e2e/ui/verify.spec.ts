/** TEMPORARY — READ-ONLY. First-quote latency after the warm start. */
import { test } from "@playwright/test";
import { db, runAccount } from "./fixtures";
import type { Page } from "@playwright/test";

async function firstQuoteMs(page: Page, accountId: string, symbol: string, market: string) {
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
  const t0 = Date.now();
  for (let i = 0; i < 60; i++) {
    const v = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => /^BUY/i.test(x.innerText.trim()));
      return { txt: b?.innerText.trim().replace(/\s+/g, " ") ?? null, disabled: b?.hasAttribute("disabled") ?? null };
    });
    if (v.txt && !/—/.test(v.txt)) return { ms: Date.now() - t0, ...v };
    await page.waitForTimeout(500);
  }
  return { ms: -1, txt: null, disabled: null };
}

for (const [sym, mkt] of [["XAU/USD", "metals"], ["GBP/USD", "forex"], ["BTC/USDT", "crypto"], ["AAPL", "stocks"]] as const) {
  test(`first quote: ${sym}`, async ({ page }) => {
    const sb = db();
    const acc = await runAccount(sb);
    const r = await firstQuoteMs(page, acc.id, sym, mkt);
    console.log(`${sym.padEnd(9)} first live BUY price after ${r.ms}ms → ${r.txt} (disabled=${r.disabled})`);
  });
}
