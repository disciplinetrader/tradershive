/**
 * One-off: how much of a trade history actually HAS excursion data?
 *
 * `computeEntryExcursion` is an on-demand POST, so MAE/MFE exist only for
 * entries someone has opened and computed. "Ideal RR" over a history where 5%
 * of trades have MFE is not a metric, it is a blank column — so the coverage
 * number decides whether the feature is worth building before a backfill.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv(p: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
  } catch { return {}; }
}
const env = { ...loadEnv(".env"), ...loadEnv(".env.local"), ...loadEnv(".env.e2e.local"), ...process.env } as Record<string, string>;
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: env.E2E_HOST_EMAIL, password: env.E2E_HOST_PASSWORD,
});
if (authErr) { console.error("AUTH FAILED:", authErr.message); process.exit(1); }
console.log("account:", auth.user?.email);
console.log("NOTE: RLS scopes this to the signed-in user only.\n");

const { data: entries, error: e1 } = await sb
  .from("journal_entries")
  .select("id, trade_id, closed_at, stop_loss, mfe_r, mae_r, excursion_computed_at, excursion_source, excursion_timeframe")
  .limit(5000);
if (e1) { console.error("journal query failed:", e1.message); process.exit(1); }

const { data: trades, error: e2 } = await sb
  .from("paper_trades")
  .select("id, closed_at, stop_loss")
  .not("closed_at", "is", null)
  .limit(5000);
if (e2) { console.error("trades query failed:", e2.message); process.exit(1); }

const js = entries ?? [];
const ts = trades ?? [];
const closedJournal = js.filter((j) => j.closed_at != null);
const computed = js.filter((j) => j.excursion_computed_at != null);
const withMfe = js.filter((j) => j.mfe_r != null);
const journalled = new Set(js.map((j) => j.trade_id).filter(Boolean));

const pct = (a: number, b: number) => (b === 0 ? "—" : `${((a / b) * 100).toFixed(1)}%`);

console.log(`closed paper_trades:              ${ts.length}`);
console.log(`  ...with a journal entry:        ${ts.filter((t) => journalled.has(t.id)).length}  (${pct(ts.filter((t) => journalled.has(t.id)).length, ts.length)})`);
console.log(`  ...with a stop_loss set:        ${ts.filter((t) => t.stop_loss != null).length}  (${pct(ts.filter((t) => t.stop_loss != null).length, ts.length)})`);
console.log();
console.log(`journal_entries total:            ${js.length}`);
console.log(`  ...closed:                      ${closedJournal.length}`);
console.log(`  ...excursion_computed_at set:   ${computed.length}  (${pct(computed.length, closedJournal.length)} of closed)`);
console.log(`  ...mfe_r non-null:              ${withMfe.length}  (${pct(withMfe.length, closedJournal.length)} of closed)`);
console.log(`  ...has stop_loss (mfe_r needs one): ${closedJournal.filter((j) => j.stop_loss != null).length}`);

if (computed.length) {
  const bySource = new Map<string, number>();
  const byTf = new Map<string, number>();
  for (const c of computed) {
    bySource.set(String(c.excursion_source), (bySource.get(String(c.excursion_source)) ?? 0) + 1);
    byTf.set(String(c.excursion_timeframe), (byTf.get(String(c.excursion_timeframe)) ?? 0) + 1);
  }
  console.log("\ncomputed by source:", JSON.stringify(Object.fromEntries(bySource)));
  console.log("computed by timeframe:", JSON.stringify(Object.fromEntries(byTf)));
  const sample = computed.slice(0, 5).map((c) => ({ mfe_r: c.mfe_r, mae_r: c.mae_r }));
  console.log("sample:", JSON.stringify(sample));
}
