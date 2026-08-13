import fs from "node:fs";
import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { UI_IDS_FILE } from "./global-setup";

export const DEMO_ACCOUNT_NAME = "Demo $10,000";
/** The charted symbol these specs drive. Chosen because the host account holds
 *  an open position on it, which is what the level handles attach to. */
export const TEST_SYMBOL = "BTC/USDT";

type Ids = { supabaseUrl: string; publishableKey: string; userId: string; accessToken: string };

export function ids(): Ids {
  return JSON.parse(fs.readFileSync(UI_IDS_FILE, "utf8"));
}

/** Authenticated client for reading/asserting DB state from the test. */
export function db(): SupabaseClient {
  const i = ids();
  return createClient(i.supabaseUrl, i.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${i.accessToken}` } },
  });
}

export async function demoAccount(sb: SupabaseClient) {
  const { data, error } = await sb.from("paper_accounts")
    .select("id, name, balance, equity, leverage, currency")
    .eq("name", DEMO_ACCOUNT_NAME).is("deleted_at", null).limit(1);
  if (error) throw new Error(`account lookup failed: ${error.message}`);
  if (!data?.length) throw new Error(`no account named "${DEMO_ACCOUNT_NAME}" for the E2E host user`);
  return data[0] as any;
}

/**
 * Create a position for the test to drive, and hand back a disposer.
 *
 * Deliberately does NOT reuse whatever happens to be open. The app's
 * `use-sl-tp-monitor` closes positions the moment price crosses their stop or
 * target, so any pre-existing trade can vanish mid-run — that is exactly what
 * happened to the BTC/USDT position the first version of this suite depended
 * on. Levels are left null so the monitor has nothing to trigger on.
 *
 * Entry is the live price, which also guarantees the line is inside the
 * chart's visible range and therefore hoverable.
 */
export async function createTestPosition(
  sb: SupabaseClient, accountId: string, symbol: string, userId: string,
) {
  const binanceSym = symbol.replace("/", "");
  const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSym}`);
  const price = Number((await res.json())?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`no live price for ${symbol}`);

  const { data, error } = await sb.from("paper_trades").insert({
    user_id: userId,
    account_id: accountId,
    symbol,
    // NOT NULL — the insert fails without it.
    market: "crypto",
    direction: "long",
    entry_price: price,
    lot_size: 0.01,
    status: "open",
    opened_at: new Date().toISOString(),
    stop_loss: null,
    take_profit: null,
  }).select("id, symbol, direction, entry_price, lot_size, stop_loss, take_profit").single();

  if (error) throw new Error(`could not create test position: ${error.message}`);
  return {
    trade: data as any,
    async dispose() {
      // openTrade only inserts (balance moves on close), so removing the row
      // restores the account exactly.
      await sb.from("paper_trades").delete().eq("id", (data as any).id);
    },
  };
}

/**
 * Point the workspace at a known account + symbol before the app boots.
 *
 * `PaperTradingProvider` reads these from localStorage on mount, so seeding
 * them is deterministic and avoids driving the symbol-search UI just to get
 * into position.
 */
export async function seedWorkspace(page: Page, accountId: string, symbol: string) {
  await page.addInitScript(
    ([acc, sym]) => {
      localStorage.setItem("th_paper_account", acc as string);
      localStorage.setItem("th_paper_symbol", sym as string);
      localStorage.setItem("th_paper_market", "crypto");
      // ProductTour renders a full-screen `aria-modal` scrim that intercepts
      // every pointer event on first visit. Without this the suite cannot
      // click anything at all — it is not what we are testing.
      localStorage.setItem("thv:tour:completed:v1", "1");
    },
    [accountId, symbol],
  );
}

/**
 * Wait for the chart overlay to have drawn the given position.
 *
 * Keyed on the entry pill, not the `data-position-line` wrapper: that wrapper
 * only groups absolutely-positioned children, so it has a zero-size box and
 * Playwright rightly reports it as hidden forever.
 */
export async function waitForPositionLine(page: Page, tradeId: string) {
  await page.waitForSelector(`[data-testid="entry-line-${tradeId}"]`, {
    state: "visible",
    timeout: 45_000,
  });
}

/** Centre of a locator's box, in viewport coords. */
export async function centreOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`no bounding box for ${testId}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/**
 * The point to actually grab an order-line handle.
 *
 * `OrderLabel` renders a full-width row (`left: 0; right: AXIS_INSET`) with the
 * visible pill pushed to the right end against the price axis. The row's centre
 * is therefore empty chart, and grabbing there is not what a trader does — take
 * a point just inside the right edge, where the pill is.
 */
export async function grabPointOf(page: Page, testId: string) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`no bounding box for ${testId}`);
  return { x: box.x + box.width - 24, y: box.y + box.height / 2, box };
}

/** Plot area of the chart, so drags can be kept inside it. */
export async function chartBox(page: Page) {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) throw new Error("no chart canvas");
  return box;
}
