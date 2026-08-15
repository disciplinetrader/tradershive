import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

import { RUN_ACCOUNT_PREFIX, UI_IDS_FILE } from "./global-setup";

/**
 * Delete this run's throwaway account.
 *
 * `paper_trades.account_id` is `ON DELETE CASCADE`, so this removes every row
 * the run created and nothing else. The delete is filtered on the id AND the
 * name prefix: an id read back from a file is only as trustworthy as the file,
 * and the prefix is what actually proves the row is ours.
 *
 * Failures here are reported, not thrown. A teardown that throws turns a green
 * run red and hides the result the run was for; the next run's sweep will clear
 * whatever is left.
 */
async function globalTeardown() {
  if (!fs.existsSync(UI_IDS_FILE)) return;

  try {
    const ids = JSON.parse(fs.readFileSync(UI_IDS_FILE, "utf8"));
    if (!ids.accountId) return;

    const sb = createClient(ids.supabaseUrl, ids.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${ids.accessToken}` } },
    });

    const { error } = await sb
      .from("paper_accounts")
      .delete()
      .eq("id", ids.accountId)
      .like("name", `${RUN_ACCOUNT_PREFIX}%`);

    if (error) console.warn(`[ui-suite] could not delete run account: ${error.message}`);
    else console.log(`[ui-suite] deleted run account ${ids.accountId}`);
  } catch (e) {
    console.warn("[ui-suite] teardown failed", e);
  }
}

export default globalTeardown;
