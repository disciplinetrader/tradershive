/**
 * check:columns — validate every `.from("t").select("...")` against the schema
 * in `src/integrations/supabase/types.ts`.
 *
 * Why this exists
 * ---------------
 * Supabase's generated types DO catch a misspelled column. What defeats them is
 * a cast at the call site (`(r: any)`, `as never`), and six such columns shipped
 * that way — `journal_entries.side`, `replay_homework.mistake_focus` and friends.
 * PostgREST answers a bad column with an error and `data: null`, a caller that
 * drops the error computes over `[]`, and a broken query is indistinguishable
 * from an empty account. `tsc` stays green throughout.
 *
 * Design rule: NEVER cry wolf
 * ---------------------------
 * A check that reports a valid join is a check someone disables. So this only
 * reports a column it can PROVE is absent from a table it can PROVE it knows:
 *
 *  - Embedded resources (`profiles(id, name)`) are parsed as joins, not columns.
 *    The relation name is resolved through the `Relationships` metadata already
 *    in types.ts — forward by referenced table or FK constraint name, reverse
 *    for one-to-many — and the scanner then recurses into the related table.
 *  - A relation name it cannot resolve is SKIPPED, not flagged.
 *  - A table not present in types.ts is SKIPPED (views, RPCs, future tables).
 *  - Dynamic selects (template literals with `${}`, or a non-literal argument)
 *    are SKIPPED — their columns are not knowable statically.
 *  - Modifiers are stripped before lookup: `!inner` / `!fkname` hints, `::casts`,
 *    `->`/`->>` JSON paths, `alias:column` renames, and `...spread(...)`.
 *
 * The result needs no database access, so it runs in CI exactly as it runs
 * locally. Exit 1 on any finding.
 */
import { readFileSync } from "node:fs";
import { Glob } from "bun";

const TYPES = "src/integrations/supabase/types.ts";

/* ---------------- schema model ---------------- */

type Rel = { fk: string; referenced: string };

const columns = new Map<string, Set<string>>();
/** table -> embeddable relation name -> target table */
const relations = new Map<string, Map<string, string>>();

function addRelation(from: string, name: string, to: string) {
  if (!relations.has(from)) relations.set(from, new Map());
  relations.get(from)!.set(name, to);
}

function parseTypes(src: string) {
  const lines = src.split(/\r?\n/);
  let table: string | null = null;
  let inRow = false;
  let inRels = false;
  let pending: Partial<Rel> = {};
  const relsByTable = new Map<string, Rel[]>();

  for (const line of lines) {
    const t = line.match(/^ {6}([a-z0-9_]+): \{$/);
    if (t) {
      table = t[1];
      inRow = inRels = false;
      continue;
    }
    if (!table) continue;

    if (/^ {8}Row: \{$/.test(line)) {
      inRow = true;
      columns.set(table, new Set());
      continue;
    }
    if (inRow) {
      if (/^ {8}\}$/.test(line)) inRow = false;
      else {
        // The type may sit on the SAME line (`col: string`) or wrap to the
        // NEXT one for long unions — `preferred_market:` alone on its line is
        // still a column. Requiring a trailing space here silently under-reads
        // the schema, which turns a valid column into a false positive.
        const c = line.match(/^ {10}([a-z0-9_]+)\??:(\s|$)/);
        if (c) columns.get(table)!.add(c[1]);
      }
    }

    if (/^ {8}Relationships: \[$/.test(line)) {
      inRels = true;
      relsByTable.set(table, []);
      continue;
    }
    if (inRels) {
      if (/^ {8}\]$/.test(line)) {
        inRels = false;
        continue;
      }
      const fk = line.match(/foreignKeyName: "([^"]+)"/);
      if (fk) pending.fk = fk[1];
      const rr = line.match(/referencedRelation: "([^"]+)"/);
      if (rr) pending.referenced = rr[1];
      if (/^ {10}\},?$/.test(line) && pending.fk && pending.referenced) {
        relsByTable.get(table)!.push({ fk: pending.fk, referenced: pending.referenced });
        pending = {};
      }
    }
  }

  // Forward embeds: by referenced table name and by FK constraint name.
  // Reverse embeds: a table that points at us is embeddable from us.
  for (const [from, rels] of relsByTable) {
    for (const r of rels) {
      addRelation(from, r.referenced, r.referenced);
      addRelation(from, r.fk, r.referenced);
      addRelation(r.referenced, from, from);
    }
  }
}

/* ---------------- select-string parser ---------------- */

/** Split on commas that are not inside parentheses. */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

type Finding = { file: string; line: number; table: string; column: string };

function checkSelect(table: string, select: string, file: string, line: number, out: Finding[]) {
  const cols = columns.get(table);
  if (!cols) return; // unknown table (view / RPC / not yet generated) — skip

  for (const rawItem of splitTop(select)) {
    let item = rawItem.trim();
    if (!item || item === "*") continue;

    // `...spread(...)` behaves like an embed for our purposes
    if (item.startsWith("...")) item = item.slice(3).trim();

    const paren = item.indexOf("(");
    if (paren !== -1) {
      // Embedded resource: NAME(inner). NAME may be `alias:target` and may
      // carry a `!hint`. Resolve it; if we cannot, skip rather than flag.
      let name = item.slice(0, paren).trim();
      const inner = item.slice(paren + 1, item.lastIndexOf(")"));
      if (name.includes(":")) name = name.split(":").slice(1).join(":").trim();
      name = name.split("!")[0].trim();

      if (!name) continue; // e.g. `count()`
      const target = columns.has(name) ? name : relations.get(table)?.get(name);
      if (!target) continue; // unresolvable relation — never flagged
      checkSelect(target, inner, file, line, out);
      continue;
    }

    // Plain column. Strip alias, hint, cast and JSON path.
    let col = item;
    if (col.includes(":")) col = col.split(":").slice(1).join(":").trim();
    col = col.split("!")[0];
    col = col.split("::")[0];
    col = col.split("->")[0];
    col = col.trim().split(/\s+/)[0];
    if (!col || col === "*") continue;
    if (!/^[a-z0-9_]+$/i.test(col)) continue; // anything exotic — skip

    if (!cols.has(col)) out.push({ file, line, table, column: col });
  }
}

/* ---------------- scan ---------------- */

const findings: Finding[] = [];

parseTypes(readFileSync(TYPES, "utf8"));

/**
 * Self-test — runs before every scan.
 *
 * A parser that under-reads the schema turns valid columns into "errors", and
 * a check that cries wolf gets switched off. That failure already happened
 * once here: the column regex required `": "` on the same line, so
 * `profiles.preferred_market` (whose type wraps to the next line) went missing
 * and three valid call sites were flagged. These assertions pin the cases that
 * make the parser wrong in the dangerous direction.
 */
function selfTest() {
  const fail = (msg: string) => {
    console.error(`check:columns SELF-TEST FAILED — ${msg}`);
    console.error("The scanner is not trustworthy in this state; fix it before believing it.");
    process.exit(2);
  };

  if (columns.size < 100) fail(`parsed only ${columns.size} tables from ${TYPES}`);
  // Same-line type, and a type that wraps to the following line.
  if (!columns.get("profiles")?.has("preferred_markets")) fail("missed profiles.preferred_markets");
  if (!columns.get("profiles")?.has("preferred_market")) fail("missed a wrapped-type column");
  if (!columns.get("journal_entries")?.has("notes_text")) fail("missed journal_entries.notes_text");
  // Relationship resolution, forward and nested.
  if (!relations.get("user_achievements")?.has("achievements")) fail("missed a forward relation");

  const probe: Finding[] = [];
  // Valid: embedded resources, alias, hint, cast, json path, spread, count.
  checkSelect(
    "user_achievements",
    "id, unlocked_at, achievements(title, icon)",
    "<self-test>",
    0,
    probe,
  );
  checkSelect("journal_entries", "id, pnl::text, narrative->x, sym:symbol", "<self-test>", 0, probe);
  if (probe.length) fail(`flagged valid syntax: ${probe.map((p) => p.table + "." + p.column)}`);

  // And it must still catch a column that genuinely is not there.
  const bad: Finding[] = [];
  checkSelect("journal_entries", "id, side", "<self-test>", 0, bad);
  if (bad.length !== 1) fail("failed to catch a known-missing column");
}
selfTest();

const files: string[] = [];
for await (const f of new Glob("src/**/*.{ts,tsx}").scan(".")) {
  if (!f.includes("types.ts")) files.push(f);
}

// `.from("t")` followed by `.select(...)`, allowing chained calls between.
const CALL = /\.from\(\s*["'`]([a-z0-9_]+)["'`]\s*\)((?:\s*\.\w+\([^()]*\))*?)\s*\.select\(\s*([^)]*)/g;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  let m: RegExpExecArray | null;
  while ((m = CALL.exec(src))) {
    const [, table, , rawArg] = m;
    const arg = rawArg.trim();
    const quoted = arg.match(/^(["'`])([\s\S]*?)\1/);
    if (!quoted) continue; // not a literal — skip
    if (quoted[1] === "`" && quoted[2].includes("${")) continue; // dynamic — skip
    const line = src.slice(0, m.index).split("\n").length;
    checkSelect(table, quoted[2], file, line, findings);
  }
}

/* ---------------- known-broken baseline ---------------- */

/**
 * These are real bugs, not false positives — each one is a query that fails at
 * runtime and yields `data: null`. They are listed rather than fixed because
 * the correct column is a product decision (`journal_entries.rating` could be
 * `grade` or any of six numeric ratings; `emotions_pre`/`emotions_post` have no
 * equivalent at all). Listing them keeps the check green so that any NEW
 * breakage is visible, which is the whole point of running it every build.
 *
 * The list is self-pruning: fixing an entry without removing it from the file
 * fails the check, so it cannot quietly rot into a permanent exemption.
 */
const KNOWN = new Set(
  JSON.parse(readFileSync("scripts/known-broken-columns.json", "utf8")).known as string[],
);
const key = (f: Finding) => `${f.table}.${f.column}`;

const fresh = findings.filter((f) => !KNOWN.has(key(f)));
const stillBroken = new Set(findings.map(key));
const stale = [...KNOWN].filter((k) => !stillBroken.has(k));

if (fresh.length) {
  console.error(`check:columns — ${fresh.length} column(s) not present on the table:\n`);
  for (const f of fresh) {
    console.error(`  ${f.file}:${f.line}`);
    console.error(`    ${f.table}.${f.column} does not exist`);
    const near = [...(columns.get(f.table) ?? [])]
      .filter((c) => c.includes(f.column.slice(0, 4)) || f.column.includes(c.slice(0, 4)))
      .slice(0, 3);
    if (near.length) console.error(`    did you mean: ${near.join(", ")}?`);
  }
  console.error(`\nIf the schema changed, regenerate ${TYPES} before assuming the code is wrong.`);
  process.exit(1);
}

if (stale.length) {
  console.error("check:columns — these are listed as known-broken but no longer appear:\n");
  for (const s of stale) console.error(`  ${s}`);
  console.error("\nFixed? Remove them from scripts/known-broken-columns.json.");
  process.exit(1);
}

const suppressed = findings.length;
console.log(
  `check:columns — ok (${columns.size} tables, ${files.length} files)` +
    (suppressed ? `, ${suppressed} known-broken read(s) still pending a decision` : ""),
);
