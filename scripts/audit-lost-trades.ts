/**
 * One-off audit: did any Replay position close WITHOUT its durable record
 * reaching `chart_closed_trades`?
 *
 * WHY THE SNAPSHOT AND NOT THE EVENT LOG
 *
 * `replay_events` looked like the right source and is not: it only ever
 * receives `session_created`, `session_reset` and `session_finished`
 * (replay.functions.ts). It never records a position close, so an absence of
 * close events there proves nothing.
 *
 * The session SNAPSHOT does carry the canonical order book — it rides in
 * `replay_sessions.settings.engine_v1` as `orders: PositionOrder[]`, written by
 * the autosave engine on a path completely independent of the closed-trade
 * upsert. An order in `status: "closed"` with no matching `chart_closed_trades`
 * row is therefore direct evidence of a lost write.
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

const env = {
  ...loadEnv(".env"), ...loadEnv(".env.local"), ...loadEnv(".env.e2e.local"), ...process.env,
} as Record<string, string>;

const sb = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: false } },
);
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: env.E2E_HOST_EMAIL, password: env.E2E_HOST_PASSWORD,
});
if (authErr) { console.error("AUTH FAILED:", authErr.message); process.exit(1); }
console.log("account audited:", auth.user?.email);
console.log("NOTE: RLS scopes this to the signed-in user. Other accounts are NOT visible.\n");

const SINCE_ISO = "2026-08-26T00:00:00Z";

const { data: sessions, error: sErr } = await sb
  .from("replay_sessions")
  .select("id, title, status, created_at, settings")
  .gte("created_at", SINCE_ISO)
  .limit(500);
if (sErr) { console.error("session query failed:", sErr.message); process.exit(1); }

const { data: trades, error: tErr } = await sb
  .from("chart_closed_trades")
  .select("position_id, replay_session_id, initial_stop")
  .limit(5000);
if (tErr) { console.error("trade query failed:", tErr.message); process.exit(1); }
const haveRow = new Set((trades ?? []).map((r) => String(r.position_id)));

type Order = { id?: string; positionId?: string; status?: string; stop?: number | null };

let closedTotal = 0;
let missingTotal = 0;
let statelessSessions = 0;

console.log(`sessions created today: ${sessions?.length ?? 0}\n`);
for (const s of sessions ?? []) {
  const snap = (s.settings as Record<string, unknown> | null)?.engine_v1 as
    | { orders?: Order[] } | undefined;
  if (!snap) { statelessSessions++; continue; }
  const orders = snap.orders ?? [];
  const closed = orders.filter((o) => o.status === "closed" || o.status === "archived");
  if (orders.length === 0) continue;

  const missing = closed.filter((o) => !o.positionId || !haveRow.has(String(o.positionId)));
  closedTotal += closed.length;
  missingTotal += missing.length;

  console.log(
    `  ${String(s.title).slice(0, 40).padEnd(40)} orders=${String(orders.length).padStart(3)} ` +
    `closed=${String(closed.length).padStart(3)} missingRow=${String(missing.length).padStart(3)}` +
    (missing.length ? "  <-- LOST" : ""),
  );
  for (const m of missing) {
    console.log(`        lost: ${JSON.stringify(m, null, 2).slice(0, 900)}`);
  }
}

console.log(`\nsessions with no engine snapshot at all: ${statelessSessions}`);
console.log(`closed orders across snapshots: ${closedTotal}`);
console.log(`closed orders with NO durable row: ${missingTotal}`);
