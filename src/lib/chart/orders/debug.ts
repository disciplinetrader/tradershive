/**
 * Structured lifecycle tracing for the Position Tool order/drawing stores.
 *
 * Off by default. Enable in the browser console with:
 *   localStorage.setItem("thive.debug.orders", "1")
 * The trace is also mirrored to `window.__thiveOrderTrace` so an automated
 * reload can be inspected without scraping console output.
 */

export interface TraceEntry {
  op: string;
  at: number;
  source: string;
  scope: string;
  prev?: number;
  next?: number;
  reason?: string;
  extra?: Record<string, unknown>;
}

const MAX = 400;

function enabled() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("thive.debug.orders") === "1";
  } catch {
    return false;
  }
}

export function trace(entry: Omit<TraceEntry, "at">) {
  if (!enabled()) return;
  const w = window as unknown as { __thiveOrderTrace?: TraceEntry[] };
  const list = (w.__thiveOrderTrace ??= []);
  const row: TraceEntry = { ...entry, at: Date.now() };
  list.push(row);
  if (list.length > MAX) list.shift();
  // eslint-disable-next-line no-console
  console.debug("[orders]", row.source, row.op, row.scope, row.prev, "→", row.next, row.reason ?? "", row.extra ?? "");
}
