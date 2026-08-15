import fs from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { requireEnv, seedSession } from "../supabase-session";

export const UI_AUTH_DIR = path.join(process.cwd(), ".auth");
export const UI_HOST_STATE = path.join(UI_AUTH_DIR, "ui-host.json");
export const UI_IDS_FILE = path.join(UI_AUTH_DIR, "ui-ids.json");

/**
 * Every account this suite creates is named with this prefix, and the suite
 * only ever touches accounts named this way. Nothing else identifies a test
 * account, so nothing else may be traded by a test.
 */
export const RUN_ACCOUNT_PREFIX = "E2E UI RUN";

/**
 * Host-only setup for the UI interaction suite.
 *
 * The battle suite's `global-setup.ts` requires E2E_JOINER_* as well, because a
 * battle needs two distinct users. Nothing here does — these tests drive one
 * trader through the chart — so requiring a second account would block the
 * whole suite on credentials it never uses.
 *
 * Also stands up a **disposable paper account for this run**, and that is not a
 * convenience. `TradingWorkspace` mounts `useSlTpMonitor`, which evaluates
 * *every* open trade on the selected account against the live feed and closes
 * the ones whose levels are crossed. Point the suite at an account that already
 * holds positions and the app will close them — correctly priced, permanently
 * booked, and never asked for. That happened: a run against the real demo
 * account realized $151.82 of someone's open trades.
 *
 * So the suite gets an account of its own, empty at the start of the run and
 * deleted at the end of it. The monitor is left switched on — it is part of
 * what these specs exercise — but there is nothing on the account for it to
 * reach except rows a test created.
 *
 * Writes live access tokens into `.auth/`, which is gitignored. Keep it that
 * way.
 */
async function globalSetup(config: FullConfig) {
  const supabaseUrl = requireEnv("VITE_SUPABASE_URL");
  const publishableKey = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:8080";
  const origin = new URL(baseURL).origin;

  const host = await seedSession(
    supabaseUrl,
    publishableKey,
    requireEnv("E2E_HOST_EMAIL"),
    requireEnv("E2E_HOST_PASSWORD"),
  );

  const sb = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${host.accessToken}` } },
  });

  // Sweep accounts left behind by a run that crashed before teardown. Scoped to
  // the prefix and, by RLS, to the host user — a hard-killed run must not make
  // the next one start against a book that already has positions on it.
  const { error: sweepErr } = await sb
    .from("paper_accounts")
    .delete()
    .like("name", `${RUN_ACCOUNT_PREFIX}%`);
  if (sweepErr) throw new Error(`could not sweep stale run accounts: ${sweepErr.message}`);

  // Defaults are stated rather than inherited: the margin-bar spec picks lot
  // sizes to land in specific tone bands, and those bands are a function of
  // balance and leverage. Reading them off whatever the table happens to
  // default to would make the assertions drift with a migration.
  const { data: account, error } = await sb
    .from("paper_accounts")
    .insert({
      user_id: host.userId,
      name: `${RUN_ACCOUNT_PREFIX} ${new Date().toISOString()}`,
      currency: "USD",
      starting_balance: 10000,
      balance: 10000,
      equity: 10000,
      leverage: 100,
    })
    .select("id, name, balance, equity, leverage, currency")
    .single();
  if (error) throw new Error(`could not create the run account: ${error.message}`);

  fs.mkdirSync(UI_AUTH_DIR, { recursive: true });
  fs.writeFileSync(
    UI_HOST_STATE,
    JSON.stringify(
      { cookies: [], origins: [{ origin, localStorage: host.storage }] },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    UI_IDS_FILE,
    JSON.stringify(
      {
        supabaseUrl,
        publishableKey,
        userId: host.userId,
        accessToken: host.accessToken,
        accountId: account.id,
      },
      null,
      2,
    ),
  );

  console.log(`[ui-suite] run account ${account.name} (${account.id})`);
}

export default globalSetup;
