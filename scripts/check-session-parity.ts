/**
 * Asserts that `public.detect_session()` agrees with the TypeScript rule.
 *
 * The session rule exists twice — once in `src/lib/market-sessions` for the
 * app, once in SQL because the journal draft trigger needs it at insert time.
 * Two implementations of one rule is exactly the divergence that produced five
 * disagreeing session modules in the first place, so it is only tolerable with
 * a gate: both are run against the SAME fixture (`market-sessions/cases.ts`),
 * and a rule changed in one language fails here rather than surfacing in a
 * report months later.
 *
 * Skips — rather than fails — without credentials, matching `check:schema`.
 * Note what that means: a CI run with no secrets goes green having verified
 * only the TypeScript half. That is a deliberate trade, not an oversight.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { SESSION_CASES } from "../src/lib/market-sessions/cases";
import { sessionAt } from "../src/lib/market-sessions/index";

function loadEnv(p: string): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.e2e.local") };
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const key = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key || !env.E2E_HOST_EMAIL || !env.E2E_HOST_PASSWORD) {
  console.log("check:sessions — skipped (no Supabase credentials in .env / .env.e2e.local)");
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const { error: authErr } = await sb.auth.signInWithPassword({
  email: env.E2E_HOST_EMAIL,
  password: env.E2E_HOST_PASSWORD,
});
if (authErr) {
  console.error(`check:sessions — sign-in failed: ${authErr.message}`);
  process.exit(1);
}

/* ---- the fixture, against both implementations ---- */

let failures = 0;

// One round trip for the whole fixture. A per-case rpc() would be 22 requests
// and would make the gate slow enough that someone eventually skips it.
const { data, error } = await sb.rpc("detect_session_batch", {
  ats: SESSION_CASES.map((c) => c.at),
});

let sqlResults: string[] | null = null;
if (error) {
  // The batch helper is optional; fall back to one call per case so this gate
  // still works against a database that only has the scalar function.
  sqlResults = [];
  for (const c of SESSION_CASES) {
    const r = await sb.rpc("detect_session", { at: c.at });
    if (r.error) {
      console.error(`check:sessions — detect_session() is not callable: ${r.error.message}`);
      console.error("Apply docs/migrations/detect-session.sql first.");
      process.exit(1);
    }
    sqlResults.push(r.data as string);
  }
} else {
  sqlResults = data as string[];
}

for (const [i, c] of SESSION_CASES.entries()) {
  const ts = sessionAt(c.at);
  const sql = sqlResults[i];

  if (ts !== c.expect) {
    console.error(`FAIL ${c.at} — TypeScript said ${ts}, fixture expects ${c.expect}`);
    console.error(`     ${c.why}`);
    failures++;
  }
  if (sql !== c.expect) {
    console.error(`FAIL ${c.at} — SQL said ${sql}, fixture expects ${c.expect}`);
    console.error(`     ${c.why}`);
    failures++;
  }
  if (ts !== sql) {
    console.error(`DRIFT ${c.at} — TypeScript ${ts} vs SQL ${sql}`);
    failures++;
  }
}

if (failures) {
  console.error(`check:sessions — ${failures} failure(s) across ${SESSION_CASES.length} cases`);
  process.exit(1);
}

console.log(`check:sessions — ok (${SESSION_CASES.length} cases, TypeScript and SQL agree)`);
