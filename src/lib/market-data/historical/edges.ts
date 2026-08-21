/**
 * HD-3 · which way a symbol's stored edges are allowed to move.
 *
 * `historical_symbols` carries two coverage columns — `earliest_available`
 * (the back edge) and `latest_imported` (the front edge). Every completed
 * import updates them, and the direction each may move is not symmetric with
 * the direction an import may run.
 *
 * ── The defect this exists to close ────────────────────────────────────────
 *
 * `runImport` used to write `latest_imported` UNCONDITIONALLY to the last bar
 * of whatever window it had just imported, while guarding `earliest_available`
 * to only ever move older. That asymmetry was invisible while every import
 * walked forward. HD-1 added a backward walk, whose windows are old by
 * construction — so finishing a backfill step stamped an OLD `latest_imported`
 * onto a symbol whose data was current.
 *
 * That column is the forward slice's sort key (`latest_imported ASC NULLS
 * FIRST`), so each backfilled symbol jumped to the front of the forward queue.
 * When the forward phase got there it derived its window from `max(ts)` in the
 * DATA, found nothing to fetch, and returned `{ skipped: true }` BEFORE
 * `runImport` — so the column was never corrected and the symbol stayed at the
 * front. The backward phase manufactures stale entries faster than the forward
 * phase can clear them, and the forward walk starves.
 *
 * Same family as HD-2: a queue ordered by a column that only advances on a
 * real write. HD-2's starvation came from outside (Binance's permanent 403);
 * this one we caused ourselves.
 *
 * ── The rule ───────────────────────────────────────────────────────────────
 *
 * Both columns describe the OUTER bounds of what is stored, so both are
 * monotonic and in opposite directions:
 *
 *   earliest_available  only ever moves EARLIER
 *   latest_imported     only ever moves LATER
 *
 * An import that lands inside the bounds already recorded moves neither, and
 * that is the common case for a re-import. Returning an empty patch lets the
 * caller skip the write entirely rather than issue an update that changes
 * nothing.
 *
 * Pure, and tested, for the same reason `backfill.ts` is: this is a decision,
 * and everything around it is plumbing.
 */

/** The columns as currently stored. Nulls mean "never imported". */
export interface StoredEdges {
  /** `historical_symbols.earliest_available` in epoch ms, or null. */
  earliestAvailable: number | null;
  /** `historical_symbols.latest_imported` in epoch ms, or null. */
  latestImported: number | null;
}

/** The bounds of the window an import just wrote, in epoch ms. */
export interface ImportedRange {
  /** First (earliest) bar written. `clean` is sorted, so `clean[0].ts`. */
  firstTs: number;
  /** Last (latest) bar written. `clean[clean.length - 1].ts`. */
  lastTs: number;
}

/**
 * A patch for `historical_symbols`, as ISO strings ready for the update.
 * Empty when the import landed entirely inside the recorded bounds.
 */
export interface EdgePatch {
  earliest_available?: string;
  latest_imported?: string;
}

/**
 * The columns to write after an import, or `{}` when nothing moved.
 *
 * Comparisons are strict, so an import landing exactly on a recorded edge
 * writes nothing — it has not extended coverage.
 */
export function edgePatch(edges: StoredEdges, range: ImportedRange): EdgePatch {
  const patch: EdgePatch = {};

  if (edges.earliestAvailable == null || range.firstTs < edges.earliestAvailable) {
    patch.earliest_available = new Date(range.firstTs).toISOString();
  }

  // The HD-3 guard. Mirrors the line above rather than trusting the caller to
  // only ever import forward — a backward walk is a legitimate caller.
  if (edges.latestImported == null || range.lastTs > edges.latestImported) {
    patch.latest_imported = new Date(range.lastTs).toISOString();
  }

  return patch;
}
