/**
 * check:schema — verify `types.ts` still describes the REAL database.
 *
 * Why this is separate from check:columns
 * ---------------------------------------
 * `check:columns` validates code against `types.ts`. That makes `types.ts` the
 * ground truth, and creates one blind spot: if `types.ts` itself is wrong, the
 * scanner is confidently wrong with it. That is not hypothetical — `types.ts`
 * is currently HAND-PATCHED for the tag-consolidation columns because the
 * project is owned by Lovable and no Supabase access token is available to
 * regenerate it properly.
 *
 * This script closes that gap by asking the database. For every table in
 * `types.ts` it issues one `?select=<every column>&limit=0`. PostgREST rejects
 * a select naming a column that does not exist and says which one — so a
 * `types.ts` that claims a column the database lacks fails loudly.
 *
 * What it does and does not catch
 * -------------------------------
 *  CATCHES  types.ts claims a column the DB does not have. This is the
 *           dangerous direction: it is what a bad hand-patch looks like, and it
 *           makes check:columns bless code that will fail at runtime.
 *  CATCHES  (best effort) a DB column missing from types.ts, but only for
 *           tables where RLS lets this user see at least one row — that is the
 *           `profiles.preferred_market` class, which causes check:columns to
 *           flag VALID code.
 *  MISSES   type/nullability drift. Column presence only.
 *
 * Credentials come from `.env` + `.env.e2e.local`. Without them the script
 * exits 0 with a notice rather than failing, so CI without secrets is not
 * blocked — it is a local/periodic check, not a build gate.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const TYPES = "src/integrations/supabase/types.ts";

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
  console.log("check:schema — skipped (no Supabase credentials in .env / .env.e2e.local)");
  process.exit(0);
}

/* ---- what types.ts claims ---- */

const columns = new Map<string, string[]>();
{
  const src = readFileSync(TYPES, "utf8");
  let table: string | null = null;
  let inRow = false;
  for (const line of src.split(/\r?\n/)) {
    const t = line.match(/^ {6}([a-z0-9_]+): \{$/);
    if (t) {
      table = t[1];
      inRow = false;
      continue;
    }
    if (!table) continue;
    if (/^ {8}Row: \{$/.test(line)) {
      inRow = true;
      columns.set(table, []);
      continue;
    }
    if (inRow && /^ {8}\}$/.test(line)) inRow = false;
    else if (inRow) {
      const c = line.match(/^ {10}([a-z0-9_]+)\??:(\s|$)/);
      if (c) columns.get(table)!.push(c[1]);
    }
  }
}
if (columns.size < 100) {
  console.error(`check:schema — parsed only ${columns.size} tables from ${TYPES}. Refusing to pass.`);
  process.exit(2);
}

/* ---- ask the database ---- */

const isOpaque = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
const customFetch: typeof fetch = (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  if (isOpaque && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
  headers.set("apikey", key);
  return fetch(input, { ...init, headers });
};

const sb = createClient(url, key, { global: { fetch: customFetch } });
const { error: authErr } = await sb.auth.signInWithPassword({
  email: env.E2E_HOST_EMAIL,
  password: env.E2E_HOST_PASSWORD,
});
if (authErr) {
  console.error(`check:schema — could not sign in: ${authErr.message}`);
  process.exit(2);
}

type Problem = { table: string; detail: string };
const problems: Problem[] = [];
const extras: Problem[] = [];

const entries = [...columns.entries()];
const CONCURRENCY = 12;
let cursor = 0;

async function worker() {
  for (;;) {
    const i = cursor++;
    if (i >= entries.length) return;
    const [table, cols] = entries[i];
    if (!cols.length) continue;

    // A plain `limit(0)` GET, not `{ head: true }`: some tables (`profiles`)
    // answer a HEAD request with an empty-bodied error that carries no message,
    // which would silently drop them from coverage — and `profiles` is exactly
    // where schema drift bit us before. A zero-row GET still validates columns.
    try {
      const { error } = await sb.from(table as never).select(cols.join(",")).limit(0);
      if (error) {
        // "column x.y does not exist" is the signal. Anything else — RLS,
        // permission denied, a view without a grant — is not a types.ts defect
        // and lands in the quiet bucket, so a transient failure or a locked
        // table can never turn this into a red build on its own.
        problems.push({ table, detail: error.message });
        continue;
      }

      // Reverse direction, best effort: only meaningful when a row is visible.
      const { data } = await sb.from(table as never).select("*").limit(1);
      const row = (data as Record<string, unknown>[] | null)?.[0];
      if (row) {
        const known = new Set(cols);
        const missing = Object.keys(row).filter((k) => !known.has(k));
        if (missing.length) extras.push({ table, detail: missing.join(", ") });
      }
    } catch (e) {
      problems.push({ table, detail: `request failed: ${(e as Error).message}` });
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

/* ---- report ---- */

const realDrift = problems.filter((p) => /does not exist/i.test(p.detail));
const other = problems.filter((p) => !/does not exist/i.test(p.detail));

if (realDrift.length) {
  console.error(`check:schema — ${TYPES} describes columns the database does not have:\n`);
  for (const p of realDrift) console.error(`  ${p.table}\n    ${p.detail}`);
  console.error("\ntypes.ts is WRONG, which means check:columns is validating against a lie.");
  console.error("Regenerate it:  npx supabase gen types typescript --project-id <id>");
}

if (extras.length) {
  console.error(`\ncheck:schema — columns present in the database but missing from ${TYPES}:\n`);
  for (const p of extras) console.error(`  ${p.table}: ${p.detail}`);
  console.error("\nThese make check:columns flag VALID code as broken. Regenerate types.ts.");
}

if (other.length) {
  console.log(`\nnot inspected (${other.length} table(s) unreadable — RLS, view, or no grant):`);
  for (const p of other.slice(0, 8)) console.log(`  ${p.table}: ${p.detail.slice(0, 90)}`);
}

if (realDrift.length || extras.length) process.exit(1);

console.log(
  `check:schema — ok (${columns.size} tables verified against the live database` +
    (other.length ? `, ${other.length} not readable` : "") +
    ")",
);
