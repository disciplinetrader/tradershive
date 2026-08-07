import fs from "node:fs";
import { test, expect, type Page } from "@playwright/test";

import { HOST_STATE, JOINER_STATE, IDS_FILE } from "./global-setup";
import { clientFor } from "./supabase-session";

/**
 * The battle-arena core loop: create -> join -> live -> trade.
 *
 * This is the flow that took a full day to verify by hand, and it spans four
 * things that each broke independently: the status state machine, the lobby
 * visibility filter, battle paper-account selection, and the trade path.
 *
 * It is slow by nature and that is not a defect to optimise away:
 *
 *   - `ready -> countdown` fires only when `start_at <= now + 30s`
 *   - `countdown -> live` deliberately cannot fire in the tick that started the
 *     countdown, and waits a further 10s
 *   - `enforce_battle_rules_on_trade` rejects any trade whose battle is not
 *     `live`, and any `opened_at` outside [start_at, end_at]
 *
 * Short-circuiting by calling `tick_battle` directly would skip precisely the
 * sequencing that was broken, so the test pays the wall-clock cost.
 */

type Ids = {
  supabaseUrl: string;
  publishableKey: string;
  host: { userId: string; accessToken: string };
  joiner: { userId: string; accessToken: string };
};

/**
 * Read lazily, not at module scope: Playwright collects test files without
 * running `globalSetup` (`--list`, IDE discovery), and a top-level read would
 * throw before the file it wants has been written.
 */
let _ids: Ids | undefined;
function getIds(): Ids {
  if (!_ids) _ids = JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) as Ids;
  return _ids;
}

/** Seconds from battle creation to `start_at`. Must clear the 30s countdown gate. */
const SECONDS_UNTIL_START = 50;

/** `datetime-local` inputs take local wall-clock time, not UTC. */
function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function createBattle(page: Page, name: string): Promise<string> {
  await page.goto("/battle-arena/create");

  // Step 0 — Basics. Only the name is required; every other default is usable.
  await page.getByRole("textbox").first().fill(name);
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 1 — Market. Symbols are pre-populated from the default market.
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 2 — Risk & rules. Defaults are within limits.
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 3 — Schedule. The whole point: start almost immediately.
  const start = new Date(Date.now() + SECONDS_UNTIL_START * 1000);
  const end = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const dateInputs = page.locator('input[type="datetime-local"]');
  await dateInputs.nth(0).fill(toDateTimeLocal(start));
  await dateInputs.nth(1).fill(toDateTimeLocal(end));
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 4 — Review.
  await page.getByRole("button", { name: /launch arena/i }).click();

  // onCreated navigates to the battle. The id in the URL is the assertion that
  // createBattle actually returned one.
  await page.waitForURL(/\/battle-arena\/[0-9a-f-]{36}/, { timeout: 60_000 });
  const battleId = page.url().split("/battle-arena/")[1]!.split(/[?#]/)[0]!;
  expect(battleId).toMatch(/^[0-9a-f-]{36}$/);
  return battleId;
}

test.describe("battle arena core loop", () => {
  // Cancelled in afterAll so a failed run doesn't leave a live battle behind.
  let battleId: string | undefined;

  test.afterAll(async () => {
    if (!battleId) return;
    const ids = getIds();
    const host = clientFor(ids.supabaseUrl, ids.publishableKey, ids.host.accessToken);
    // The host may update their own battle ("battles update host" RLS policy).
    await host.from("battles").update({ status: "cancelled" }).eq("id", battleId);
  });

  test("create -> join -> live -> trade", async ({ browser }) => {
    const hostCtx = await browser.newContext({ storageState: HOST_STATE });
    const joinerCtx = await browser.newContext({ storageState: JOINER_STATE });
    const hostPage = await hostCtx.newPage();
    const joinerPage = await joinerCtx.newPage();

    const name = `E2E loop ${new Date().toISOString()}`;

    // --- create -------------------------------------------------------------
    battleId = await createBattle(hostPage, name);

    // --- lobby visibility ---------------------------------------------------
    // Regression guard for c5ef0083: a battle the host created and joined used
    // to vanish from All Battles, so the second player could never find it.
    await joinerPage.goto("/battle-arena");
    await expect(joinerPage.getByText(name)).toBeVisible({ timeout: 30_000 });

    // --- join ---------------------------------------------------------------
    await joinerPage.goto(`/battle-arena/${battleId}`);
    await joinerPage.getByTestId("battle-join").click();

    // Two participants is what lets `open/filling -> ready` fire. Assert it
    // server-side rather than trusting the toast, which appears either way.
    const ids = getIds();
    const joiner = clientFor(ids.supabaseUrl, ids.publishableKey, ids.joiner.accessToken);
    await expect
      .poll(
        async () => {
          const { count } = await joiner
            .from("battle_participants")
            .select("id", { count: "exact", head: true })
            .eq("battle_id", battleId!);
          return count ?? 0;
        },
        { timeout: 60_000, message: "battle never reached two participants" },
      )
      .toBe(2);

    // --- live ---------------------------------------------------------------
    // Driven by the route's own tick poll. No cron involved: `battle-tick` runs
    // once a minute and cannot resolve a 10-second countdown edge.
    await expect(joinerPage.getByTestId("battle-live")).toBeVisible({ timeout: 3 * 60 * 1000 });
    await expect(hostPage.getByTestId("battle-live")).toBeVisible({ timeout: 60_000 });

    // --- trade --------------------------------------------------------------
    // Regression guard for 2bfaf57f: the joining player used to land on a
    // personal paper account, so the trade wrote with battle_id NULL and no
    // error. Placing this trade as the *joiner* is deliberate — as the host it
    // would pass even with that bug present.
    const submit = joinerPage.getByRole("button", { name: /buy market/i });
    await expect(submit).toBeEnabled({ timeout: 60_000 });
    await submit.click();

    // The real assertion is in the database, not the UI. battle_id is derived
    // by a BEFORE INSERT trigger from paper_accounts.battle_id, so a trade on
    // the wrong account is written silently with battle_id NULL.
    await expect
      .poll(
        async () => {
          const { data } = await joiner
            .from("paper_trades")
            .select("id, battle_id, direction, status")
            .eq("battle_id", battleId!)
            .eq("user_id", ids.joiner.userId)
            .is("deleted_at", null);
          return data?.length ?? 0;
        },
        { timeout: 60_000, message: "no trade written against this battle" },
      )
      .toBeGreaterThan(0);

    const { data: trades } = await joiner
      .from("paper_trades")
      .select("battle_id, account_id, direction, status")
      .eq("battle_id", battleId!)
      .eq("user_id", ids.joiner.userId)
      .is("deleted_at", null);

    const trade = trades![0]!;
    expect(trade.battle_id).toBe(battleId);
    expect(trade.direction).toBe("long");

    // The account the trade landed on must be the battle account, not a
    // personal one. This is the check that would have caught the account-
    // selection bug directly.
    const { data: account } = await joiner
      .from("paper_accounts")
      .select("battle_id")
      .eq("id", trade.account_id)
      .single();
    expect(account?.battle_id).toBe(battleId);

    await hostCtx.close();
    await joinerCtx.close();
  });
});
