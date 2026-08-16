/**
 * Column definitions for the open-positions table.
 *
 * One registry, consumed by the header, the body, the column picker, the
 * skeleton's column count and the CSV export — so a column cannot exist in the
 * header and be missing from a row, which is what a hand-maintained pair of
 * `{!compact && <TableHead>}` / `{!compact && <TableCell>}` lists drifts into.
 *
 * It also makes the crowding problem the user's to solve rather than ours.
 * Every column ships visible; the picker hides what a given trader does not
 * use. Choosing a default-hidden set here would be us guessing which columns
 * matter, which is the guess the picker exists to remove.
 */
import type { ReactNode } from "react";
import type { BlotterSortKey } from "@/hooks/use-workspace-prefs";
import { formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import { detectSession } from "@/lib/paper-trading/session";
import type { PositionRow } from "@/lib/paper-trading/position-row";
import { SessionBadge } from "./SessionBadge";
import { SidePill, FractionalPrice, signed } from "@/components/trading/blotter-shared";
import { cn } from "@/lib/utils";

export type { PositionRow, Trade } from "@/lib/paper-trading/position-row";

export type ColumnCtx = { currency?: string; compact: boolean };

export type PositionColumn = {
  id: string;
  label: string;
  align?: "left" | "right";
  sortKey?: BlotterSortKey;
  /** Cannot be hidden — without these the row cannot be identified or judged. */
  required?: boolean;
  /** Part of the narrow right-rail set. */
  compact?: boolean;
  /** Cell contents. The row wraps this in a `<TableCell>`. */
  cell: (r: PositionRow, ctx: ColumnCtx) => ReactNode;
  className?: string;
  /**
   * Makes the row render this column through `FlashCell` — it emits its own
   * `<td>` so it cannot be nested inside one.
   */
  flash?: (r: PositionRow) => { value: number; up: boolean };
  /** Plain text for the CSV export. Falls back to omitting the column. */
  csv?: (r: PositionRow, ctx: ColumnCtx) => string;
};

const dash = <span className="text-muted-foreground">—</span>;
const NUM = "py-1.5 text-right font-mono tabular-nums";

/** `null` renders as a dash and exports as empty — never as 0. */
function num(v: number | null, render: (n: number) => ReactNode): ReactNode {
  return v == null ? dash : render(v);
}

export const POSITION_COLUMNS: PositionColumn[] = [
  {
    id: "symbol",
    label: "Pair",
    sortKey: "symbol",
    required: true,
    compact: true,
    className: "py-1.5 font-semibold",
    cell: ({ t }, { compact }) =>
      compact ? (
        <span className="flex items-center gap-1">
          <span className={cn(
            "shrink-0 text-[10px]",
            t.direction === "long" ? "text-success" : "text-danger",
          )}>{t.direction === "long" ? "▲" : "▼"}</span>
          <span className="truncate">{t.symbol}</span>
        </span>
      ) : t.symbol,
    csv: ({ t }) => t.symbol,
  },
  {
    id: "side",
    label: "Side",
    sortKey: "status",
    className: "py-1.5",
    cell: ({ t }) => <SidePill side={t.direction} />,
    csv: ({ t }) => (t.direction === "long" ? "Buy" : "Sell"),
  },
  {
    id: "entry",
    label: "Entry",
    align: "right",
    className: NUM,
    cell: ({ t, sym }) => <FractionalPrice sym={sym} price={Number(t.entry_price)} />,
    csv: ({ t }) => String(t.entry_price),
  },
  {
    id: "current",
    label: "Current",
    align: "right",
    className: NUM,
    cell: ({ sym, current }) => num(current, (n) => <FractionalPrice sym={sym} price={n} />),
    csv: ({ current }) => (current == null ? "" : String(current)),
  },
  {
    id: "lot",
    label: "Lot",
    sortKey: "size",
    align: "right",
    className: NUM,
    cell: ({ t }) => Number(t.lot_size).toFixed(2),
    csv: ({ t }) => String(t.lot_size),
  },
  {
    id: "sl",
    label: "SL",
    align: "right",
    className: cn(NUM, "text-muted-foreground"),
    cell: ({ t, sym }) =>
      t.stop_loss ? <FractionalPrice sym={sym} price={Number(t.stop_loss)} /> : dash,
    csv: ({ t }) => (t.stop_loss == null ? "" : String(t.stop_loss)),
  },
  {
    id: "tp",
    label: "TP",
    align: "right",
    className: cn(NUM, "text-muted-foreground"),
    cell: ({ t, sym }) =>
      t.take_profit ? <FractionalPrice sym={sym} price={Number(t.take_profit)} /> : dash,
    csv: ({ t }) => (t.take_profit == null ? "" : String(t.take_profit)),
  },
  {
    id: "rr",
    label: "RR",
    align: "right",
    className: NUM,
    // A dash here means "no stop, so R is not measurable" — distinct from a
    // real 0.00R at break-even, which a truthiness test would collapse into it.
    cell: ({ rr }) =>
      rr == null
        ? <span className="text-muted-foreground" title="No stop loss set — R cannot be measured">—</span>
        : <span className={rr >= 0 ? "text-success" : "text-danger"}>{rr.toFixed(2)}R</span>,
    csv: ({ rr }) => (rr == null ? "" : rr.toFixed(2)),
  },
  {
    id: "pnl",
    label: "P/L",
    sortKey: "pnl",
    align: "right",
    required: true,
    compact: true,
    flash: ({ floating }) => ({ value: floating ?? 0, up: (floating ?? 0) >= 0 }),
    cell: ({ floating }, { currency }) =>
      num(floating, (n) => <>{signed(n)}{formatCurrency(Math.abs(n), currency)}</>),
    csv: ({ floating }) => (floating == null ? "" : floating.toFixed(2)),
  },
  {
    id: "pnlPct",
    label: "P/L %",
    align: "right",
    className: NUM,
    // Percent of margin committed, not of notional: it answers "how is this
    // position doing against what it is tying up", which is the number that
    // decides whether to add, trim or leave it alone.
    cell: ({ pnlPct }) =>
      num(pnlPct, (n) => (
        <span className={n >= 0 ? "text-success" : "text-danger"}>
          {signed(n)}{Math.abs(n).toFixed(2)}%
        </span>
      )),
    csv: ({ pnlPct }) => (pnlPct == null ? "" : pnlPct.toFixed(2)),
  },
  {
    id: "tradeValue",
    label: "Trade value",
    align: "right",
    className: NUM,
    cell: ({ tradeValue }, { currency }) => num(tradeValue, (n) => formatCurrency(n, currency)),
    csv: ({ tradeValue }) => (tradeValue == null ? "" : tradeValue.toFixed(2)),
  },
  {
    id: "marketValue",
    label: "Market value",
    align: "right",
    className: NUM,
    cell: ({ marketValue }, { currency }) => num(marketValue, (n) => formatCurrency(n, currency)),
    csv: ({ marketValue }) => (marketValue == null ? "" : marketValue.toFixed(2)),
  },
  {
    id: "leverage",
    label: "Leverage",
    align: "right",
    className: cn(NUM, "text-muted-foreground"),
    cell: ({ leverage }) => num(leverage, (n) => `${formatNumber(n, n >= 10 ? 0 : 1)}×`),
    csv: ({ leverage }) => (leverage == null ? "" : leverage.toFixed(2)),
  },
  {
    id: "margin",
    label: "Margin",
    align: "right",
    className: NUM,
    cell: ({ margin }, { currency }) => num(margin, (n) => formatCurrency(n, currency)),
    csv: ({ margin }) => (margin == null ? "" : margin.toFixed(2)),
  },
  {
    id: "session",
    label: "Session",
    className: "py-1.5",
    cell: ({ t }) => <SessionBadge at={t.opened_at} />,
    // The session's name, not the raw timestamp: a column headed "Session"
    // exporting an ISO string is a different column with the same title.
    csv: ({ t }) => detectSession(t.opened_at).label,
  },
  {
    id: "duration",
    label: "Duration",
    sortKey: "time",
    className: "py-1.5 text-xs text-muted-foreground",
    cell: ({ t }) => formatDuration(new Date(t.opened_at)),
    csv: ({ t }) => formatDuration(new Date(t.opened_at)),
  },
];

/** Columns the narrow right rail can show at all. */
export const COMPACT_COLUMNS = POSITION_COLUMNS.filter((c) => c.compact);

/** Every column visible — the shipped default. See the note at the top. */
export function defaultColumnVisibility(): Record<string, boolean> {
  return Object.fromEntries(POSITION_COLUMNS.map((c) => [c.id, true]));
}

/**
 * Visible columns for the current mode.
 *
 * `required` columns ignore the stored preference: a row with neither its
 * symbol nor its P/L is not a shorter table, it is an unreadable one, and a
 * stale prefs blob from an older build should not be able to produce it.
 */
export function visibleColumns(
  visibility: Record<string, boolean>, compact: boolean,
): PositionColumn[] {
  const pool = compact ? COMPACT_COLUMNS : POSITION_COLUMNS;
  return pool.filter((c) => c.required || visibility[c.id] !== false);
}

export function formatDuration(start: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
