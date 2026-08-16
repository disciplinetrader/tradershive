import fs from "node:fs";
import type { Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RUN_ACCOUNT_PREFIX, UI_IDS_FILE } from "./global-setup";

/** The charted symbol these specs drive. Crypto, so it quotes around the clock
 *  and a run at any hour has a live price to open the test position at. */
export const TEST_SYMBOL = "BTC/USDT";

type Ids = {
  supabaseUrl: string;
  publishableKey: string;
  userId: string;
  accessToken: string;
  accountId: string;
};

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

/**
 * The disposable account `global-setup` created for this run.
 *
 * Looked up by the id the setup wrote down — never by name-match-and-take-the-
 * first-row. The suite drives the real app, and the real app closes positions
 * on its own (`useSlTpMonitor`); an account picked by description rather than
 * by identity is an account whose contents the suite does not know, and every
 * one of those positions is inside the blast radius.
 *
 * The name prefix is re-checked here so a stale or hand-edited ids file cannot
 * aim the suite at a real book.
 */
export async function runAccount(sb: SupabaseClient) {
  const { accountId } = ids();
  if (!accountId) {
    throw new Error(
      "no accountId in .auth/ui-ids.json — delete .auth/ and let global-setup run again",
    );
  }

  const { data, error } = await sb.from("paper_accounts")
    .select("id, name, balance, equity, leverage, currency, created_at")
    .eq("id", accountId).is("deleted_at", null).single();
  if (error) throw new Error(`run account lookup failed: ${error.message}`);
  if (!String(data.name).startsWith(RUN_ACCOUNT_PREFIX)) {
    throw new Error(
      `refusing to run: account ${accountId} is named "${data.name}", which is not a ` +
        `"${RUN_ACCOUNT_PREFIX}" account. The suite only drives accounts it created.`,
    );
  }

  await assertNoInheritedPositions(sb, data as any);
  return data as any;
}

/**
 * Fail loudly if the account holds a position that predates the run.
 *
 * The last line of defence, and the reason it is keyed on `opened_at` versus
 * the account's `created_at` rather than on a list of ids: it must not trip on
 * a trade an earlier spec in the same run left behind, but it must trip
 * instantly if the ids file has been aimed at a long-lived account with
 * history on it.
 *
 * Checked before the app is ever pointed at the account, because once the
 * monitor has closed a stranger's position the money is booked — and
 * re-opening it at a later price would put a second wrong trade in the journal
 * rather than undo the first.
 */
export async function assertNoInheritedPositions(
  sb: SupabaseClient, account: { id: string; created_at: string },
) {
  const { data, error } = await sb.from("paper_trades")
    .select("id, symbol, opened_at")
    .eq("account_id", account.id).eq("status", "open").is("deleted_at", null)
    .lt("opened_at", account.created_at);
  if (error) throw new Error(`could not check for inherited positions: ${error.message}`);

  if (data?.length) {
    throw new Error(
      `refusing to run: account ${account.id} holds ${data.length} open position(s) that ` +
        `predate this run (${data.map((t: any) => `${t.symbol} ${t.id}`).join(", ")}). ` +
        `The app closes positions on its own via useSlTpMonitor, so driving it here ` +
        `would realize trades nobody asked to close.`,
    );
  }
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
 * A position at a price the test chooses, for assertions about *rendering*.
 *
 * Deliberately does not consult a feed. A forex row has to be on screen to
 * check how its price is drawn, and forex does not quote at the weekend — a
 * fixture that needed a live price would make the test pass or fail on the day
 * of the week. Levels stay null so `use-sl-tp-monitor` has nothing to fire on.
 */
export async function createPositionAt(
  sb: SupabaseClient,
  accountId: string,
  userId: string,
  opts: { symbol: string; market: string; price: number; lot?: number },
) {
  const { data, error } = await sb.from("paper_trades").insert({
    user_id: userId,
    account_id: accountId,
    symbol: opts.symbol,
    market: opts.market,
    direction: "long",
    entry_price: opts.price,
    lot_size: opts.lot ?? 0.01,
    status: "open",
    opened_at: new Date().toISOString(),
    stop_loss: null,
    take_profit: null,
  }).select("id, symbol, entry_price").single();

  if (error) throw new Error(`could not create ${opts.symbol} position: ${error.message}`);
  return {
    trade: data as any,
    async dispose() {
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
