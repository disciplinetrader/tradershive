/**
 * Sprint 3.2 — shared Blotter primitives.
 *
 * Small, focused helpers used by Positions / Orders / History tables so
 * they share look, keyboard behaviour, and sort/skeleton logic without a
 * redesign.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Clock, Loader2, MinusCircle, XCircle } from "lucide-react";
import { TableCell, TableHead, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * The Actions column, shared by the Orders and Positions blotters.
 *
 * They had drifted: Positions pinned its actions in a sticky, shadowed column
 * while Orders used a plain right-aligned cell, so the same control sat in a
 * different place depending on which tab you were looking at. Defining the
 * column once means a change to one tab cannot silently skip the other.
 *
 * `w-*` plus `whitespace-nowrap` at the call site is what stops the buttons
 * being squeezed: a sticky cell is still a table cell, and without a width the
 * columns to its left will happily compress it until its contents spill past
 * the panel edge — which is how the red Close button ended up clipped.
 *
 * Sized for three 28px icon buttons. It was 136px to fit a labelled "Close"
 * button; dropping the label to match TradingView's two-icon row gave 28px
 * back, which is also what stopped the floating assistant bubble sitting on
 * top of the last control.
 */
export const ACTIONS_CELL =
  "sticky right-0 z-10 w-[108px] min-w-[108px] bg-background/95 px-2 text-right " +
  "shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.4)]";

/**
 * Narrow variant for the right rail — deliberately NOT sticky.
 *
 * Sticky is the right answer only while the table is wider than its scrollport.
 * Once the compact column set fits (four columns in ~320px), `right-0` has
 * nothing to pin past, so the cell gets pulled left of its natural position and
 * parks on top of its neighbour: measured at 1469–1569 over a P/L column at
 * 1443–1553, hiding the one number the panel exists to show. With no overflow
 * there is nothing to protect against, so it stays in normal flow.
 */
export const ACTIONS_CELL_COMPACT =
  "w-[92px] min-w-[92px] bg-background/95 px-1 text-right";

export type SortDir = "asc" | "desc";
export type SortState<K extends string> = { key: K; dir: SortDir };

export function nextSort<K extends string>(prev: SortState<K>, key: K): SortState<K> {
  if (prev.key !== key) return { key, dir: "desc" };
  return { key, dir: prev.dir === "desc" ? "asc" : "desc" };
}

export function SortHeader<K extends string>({
  label, sortKey, state, onChange, align = "left", className,
}: {
  label: string;
  sortKey: K;
  state: SortState<K>;
  onChange: (s: SortState<K>) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = state.key === sortKey;
  const Icon = !active ? ArrowUpDown : state.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onChange(nextSort(state, sortKey))}
        aria-sort={active ? (state.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors",
          "text-muted-foreground hover:text-foreground focus-visible:text-foreground focus-visible:outline-none",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon className={cn("h-3 w-3 opacity-60", active && "opacity-100")} />
      </button>
    </TableHead>
  );
}

/** Skeleton rows for initial load — mimics real row density (no spinner). */
export function SkeletonRows({ rows = 4, cols = 8 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i} className="border-b border-border/40">
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j} className="py-1.5">
              <div className="h-3 w-full max-w-[80px] animate-pulse rounded bg-muted/60" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

/** Status pill: icon + text + colour (never colour alone). */
export function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const map: Record<string, { icon: any; cls: string; label: string }> = {
    open:      { icon: Clock,        cls: "bg-primary/10 text-primary",            label: "Open" },
    pending:   { icon: Clock,        cls: "bg-warning/15 text-warning",            label: "Pending" },
    filled:    { icon: CheckCircle2, cls: "bg-success/15 text-success",            label: "Filled" },
    closed:    { icon: CheckCircle2, cls: "bg-muted text-muted-foreground",        label: "Closed" },
    cancelled: { icon: MinusCircle,  cls: "bg-muted text-muted-foreground",        label: "Cancelled" },
    rejected:  { icon: XCircle,      cls: "bg-danger/15 text-danger",              label: "Rejected" },
    working:   { icon: Loader2,      cls: "bg-primary/10 text-primary",            label: "Working" },
  };
  const item = map[s] ?? { icon: Clock, cls: "bg-muted text-muted-foreground", label: status };
  const Icon = item.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", item.cls)}>
      <Icon className="h-2.5 w-2.5" />
      {item.label}
    </span>
  );
}

/** Side pill w/ arrow icon — never colour alone. */
export function SidePill({ side }: { side: "long" | "short" }) {
  const Icon = side === "long" ? ArrowUp : ArrowDown;
  return (
    <span className={cn(
      "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
      side === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
    )}>
      <Icon className="h-2.5 w-2.5" />
      {side === "long" ? "Buy" : "Sell"}
    </span>
  );
}

/** Flash background briefly whenever `value` changes — no row remount. */
export const FlashCell = memo(function FlashCell({
  value, up, className, children,
}: {
  value: number;
  up: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value && Number.isFinite(prev.current) && Number.isFinite(value)) {
      setFlash(value > prev.current ? "up" : "down");
      const t = window.setTimeout(() => setFlash(null), 420);
      prev.current = value;
      return () => window.clearTimeout(t);
    }
    prev.current = value;
  }, [value]);
  return (
    <td className={cn(
      "min-w-[110px] p-2 text-right font-mono tabular-nums font-semibold transition-colors duration-500",
      up ? "text-success" : "text-danger",
      flash === "up" && "bg-success/10",
      flash === "down" && "bg-danger/10",
      className,
    )}>
      {children}
    </td>
  );
});

/** Row keyboard nav: arrow up/down move focus between rows in the same tbody. */
export function useRowKeyNav() {
  return useCallback((e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const row = e.currentTarget;
    const tbody = row.parentElement;
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr[tabindex="0"]'));
    const i = rows.indexOf(row);
    if (i < 0) return;
    const next = e.key === "ArrowDown" ? rows[i + 1] : rows[i - 1];
    if (next) {
      e.preventDefault();
      next.focus();
    }
  }, []);
}

/**
 * A price with its fractional pip as a superscript: `1.1556`⁶.
 *
 * Forex quotes to half a pip, so the last decimal is a tenth of the increment
 * everything else on the row is denominated in. Rendered at full size it reads
 * as another significant digit and the eye has to count places to find the pip;
 * as a superscript the pip is the last full-size digit, which is how a trader
 * actually reads the number — and no precision is dropped to get there.
 *
 * Only applied where a fractional pip exists: 5-decimal pairs and 3-decimal JPY
 * crosses. Metals, crypto and equities quote in whole increments and render
 * unchanged, because raising a digit that is not a fractional pip invents a
 * distinction that is not in the instrument.
 */
export function FractionalPrice({
  sym, price,
}: {
  sym: { decimals: number; market: string } | null | undefined;
  price: number | null | undefined;
}) {
  if (price == null || !Number.isFinite(price)) return <span className="text-muted-foreground">—</span>;
  const decimals = sym?.decimals ?? 2;
  const text = price.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const fractional = sym?.market === "forex" && (decimals === 5 || decimals === 3);
  if (!fractional) return <>{text}</>;

  return (
    <>
      {text.slice(0, -1)}
      {/* `leading-none` and the negative offset keep the superscript inside the
          row's line box — an unstyled <sup> grows the line and the rows stop
          aligning with the ones above them. */}
      <sup className="relative -top-[0.15em] text-[0.75em] leading-none opacity-80">
        {text.slice(-1)}
      </sup>
    </>
  );
}

/** Signed +/– prefix so sign is legible without relying on colour. */
export function signed(n: number): string {
  if (n > 0) return "+";
  if (n < 0) return "\u2212"; // real minus sign, not hyphen
  return "";
}
