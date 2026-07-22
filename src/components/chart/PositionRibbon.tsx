import { useState } from "react";
import { formatCurrency, formatNumber } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";

export interface PositionRibbonData {
  id: string;
  side: "long" | "short";
  entry: number;
  lot: number;
  currentPrice: number | null;
  pnl: number;
  pnlPct: number;
  accountName?: string;
}

interface Props {
  data: PositionRibbonData;
  top: number;
  currency?: string;
  onClose: () => void;
  onPartial: (fraction: number) => void;
  onBreakEven: () => void;
  onReverse: () => void;
  onTrailing: () => void;
}

export function PositionRibbon({
  data,
  top,
  currency = "USD",
  onClose,
  onPartial,
  onBreakEven,
  onReverse,
  onTrailing,
}: Props) {
  const [open, setOpen] = useState(false);
  const winning = data.pnl > 0;
  return (
    <div
      className="pointer-events-auto absolute right-16 z-20 flex items-center gap-1"
      style={{ top: top - 12 }}
    >
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-mono shadow",
          winning
            ? "border-success/40 bg-success/10 text-success"
            : "border-danger/40 bg-danger/10 text-danger",
        )}
      >
        <span
          className={cn(
            "rounded px-1 py-[1px] text-[9px] font-bold uppercase text-white",
            data.side === "long" ? "bg-success" : "bg-danger",
          )}
        >
          {data.side}
        </span>
        <span>{formatNumber(data.lot, 2)} lot</span>
        <span>·</span>
        <span>{formatCurrency(data.pnl, currency)}</span>
        <span className="opacity-70">({formatNumber(data.pnlPct, 2)}%)</span>
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="grid h-6 w-6 place-items-center rounded border bg-background/90 shadow hover:bg-muted"
          aria-label="Position actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {open ? (
          <div
            className="absolute right-0 top-7 z-30 w-[160px] rounded-md border bg-background/95 p-1 text-[11px] shadow-xl backdrop-blur"
            onMouseLeave={() => setOpen(false)}
          >
            <MenuItem onClick={() => { setOpen(false); onClose(); }} tone="danger">
              Close position
            </MenuItem>
            <MenuItem onClick={() => { setOpen(false); onPartial(0.25); }}>Partial 25%</MenuItem>
            <MenuItem onClick={() => { setOpen(false); onPartial(0.5); }}>Partial 50%</MenuItem>
            <MenuItem onClick={() => { setOpen(false); onPartial(0.75); }}>Partial 75%</MenuItem>
            <div className="my-1 h-px bg-border" />
            <MenuItem onClick={() => { setOpen(false); onBreakEven(); }}>Move to break-even</MenuItem>
            <MenuItem onClick={() => { setOpen(false); onTrailing(); }}>Trailing stop…</MenuItem>
            <MenuItem onClick={() => { setOpen(false); onReverse(); }}>Reverse position</MenuItem>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "danger";
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "block w-full rounded px-2 py-1 text-left hover:bg-muted",
        tone === "danger" && "text-danger",
      )}
    >
      {children}
    </button>
  );
}
