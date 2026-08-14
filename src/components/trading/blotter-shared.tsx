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
 */
export const ACTIONS_CELL =
  "sticky right-0 z-10 w-[136px] min-w-[136px] bg-background/95 px-2 text-right " +
  "shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.4)]";

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

/** Signed +/– prefix so sign is legible without relying on colour. */
export function signed(n: number): string {
  if (n > 0) return "+";
  if (n < 0) return "\u2212"; // real minus sign, not hyphen
  return "";
}
