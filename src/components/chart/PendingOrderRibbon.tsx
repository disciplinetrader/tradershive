import { useState } from "react";
import { formatNumber } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";
import { MoreHorizontal } from "lucide-react";

export interface PendingRibbonData {
  id: string;
  side: "long" | "short";
  orderType: "limit" | "stop" | "stop_limit";
  trigger: number;
  lot: number;
}

interface Props {
  data: PendingRibbonData;
  top: number;
  onCancel: () => void;
  onDuplicate: () => void;
}

export function PendingOrderRibbon({ data, top, onCancel, onDuplicate }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="pointer-events-auto absolute right-16 z-20 flex items-center gap-1"
      style={{ top: top - 12 }}
    >
      <div className="flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-mono text-primary shadow">
        <span
          className={cn(
            "rounded px-1 py-[1px] text-[9px] font-bold uppercase text-white",
            data.side === "long" ? "bg-success" : "bg-danger",
          )}
        >
          {data.side} {data.orderType}
        </span>
        <span>{formatNumber(data.lot, 2)} lot</span>
        <span>@</span>
        <span>{data.trigger.toFixed(4)}</span>
      </div>
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="grid h-6 w-6 place-items-center rounded border bg-background/90 shadow hover:bg-muted"
          aria-label="Order actions"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {open ? (
          <div
            className="absolute right-0 top-7 z-30 w-[140px] rounded-md border bg-background/95 p-1 text-[11px] shadow-xl backdrop-blur"
            onMouseLeave={() => setOpen(false)}
          >
            <button
              onClick={() => { setOpen(false); onDuplicate(); }}
              className="block w-full rounded px-2 py-1 text-left hover:bg-muted"
            >
              Duplicate
            </button>
            <button
              onClick={() => { setOpen(false); onCancel(); }}
              className="block w-full rounded px-2 py-1 text-left text-danger hover:bg-muted"
            >
              Cancel order
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
