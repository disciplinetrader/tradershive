import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DraftOrderType } from "@/lib/chart-trading/types";

import { fmtPrice } from "@/lib/trading/plan-math";

interface Props {
  /** Instrument, so the quoted price renders at its own precision. */
  symbol: string;
  x: number;
  y: number;
  price: number;
  livePrice: number | null;
  defaultLot: number;
  onPlace: (type: DraftOrderType, lot: number) => void;
  onCancel: () => void;
}

const OPTIONS: Array<{ id: DraftOrderType; label: string; tone: "buy" | "sell" }> = [
  { id: "buy_market", label: "Buy Market", tone: "buy" },
  { id: "sell_market", label: "Sell Market", tone: "sell" },
  { id: "buy_limit", label: "Buy Limit", tone: "buy" },
  { id: "sell_limit", label: "Sell Limit", tone: "sell" },
  { id: "buy_stop", label: "Buy Stop", tone: "buy" },
  { id: "sell_stop", label: "Sell Stop", tone: "sell" },
];

/**
 * Small popover pinned to the click price. Picks order type + lot size;
 * confirming hands off to the overlay which then calls the correct server fn.
 * The popover auto-filters options based on whether the click was above /
 * below the live price so you can't create an invalid limit / stop.
 */
export function DraftOrderPopover({ x, y, symbol, price, livePrice, defaultLot, onPlace, onCancel }: Props) {
  const [lot, setLot] = useState(defaultLot);

  const filter = (id: DraftOrderType): boolean => {
    if (id === "buy_market" || id === "sell_market") return true;
    if (livePrice == null) return true;
    // Buy limit below market, buy stop above market, sell limit above, sell stop below
    if (id === "buy_limit") return price < livePrice;
    if (id === "buy_stop") return price > livePrice;
    if (id === "sell_limit") return price > livePrice;
    if (id === "sell_stop") return price < livePrice;
    return true;
  };

  return (
    <div
      className="absolute z-40 w-[180px] rounded-md border bg-background/95 p-2 text-[11px] shadow-xl backdrop-blur"
      style={{ left: x + 8, top: y + 8 }}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold">
          @ <span className="font-mono">{fmtPrice(symbol, price)}</span>
        </span>
        <button
          className="grid h-5 w-5 place-items-center rounded hover:bg-muted"
          onClick={onCancel}
          aria-label="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="mb-2 flex items-center gap-1">
        <label className="text-muted-foreground">Lot</label>
        <input
          type="number"
          step={0.01}
          min={0.01}
          value={lot}
          onChange={(e) => setLot(Math.max(0.01, Number(e.target.value) || 0.01))}
          className="flex-1 rounded border bg-background px-1.5 py-0.5 text-right font-mono text-[11px]"
        />
      </div>
      <div className="grid grid-cols-1 gap-1">
        {OPTIONS.filter((o) => filter(o.id)).map((o) => (
          <button
            key={o.id}
            onClick={() => onPlace(o.id, lot)}
            className={cn(
              "rounded px-2 py-1 text-left font-semibold text-white transition",
              o.tone === "buy" ? "bg-success hover:brightness-110" : "bg-danger hover:brightness-110",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
