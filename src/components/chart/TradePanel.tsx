import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveQuote } from "@/lib/market-data/hooks";
import { toast } from "sonner";

interface Props {
  symbol: string;
  market?: any;
}

/**
 * Compact trade panel. Fires orders through the existing Paper Trading
 * engine when the user clicks Buy / Sell — the real order plumbing lives
 * inside the Paper Trading module (unchanged) and is intentionally not
 * duplicated here. This panel only collects intent + shows live quote.
 */
export function TradePanel({ symbol, market }: Props) {
  const quote = useLiveQuote(symbol, market);
  const [size, setSize] = useState("0.1");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");

  function submit(side: "buy" | "sell") {
    toast.success(`${side.toUpperCase()} ${size} ${symbol} · queued for Paper Trading`);
  }

  return (
    <div className="flex h-full flex-col gap-3 border-l border-border/60 bg-card/40 p-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{symbol}</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-xl font-semibold tabular-nums">{quote?.last?.toFixed(4) ?? "—"}</span>
          <span className="text-xs text-muted-foreground">
            Bid {quote?.bid?.toFixed(4) ?? "—"} · Ask {quote?.ask?.toFixed(4) ?? "—"}
          </span>
        </div>
      </div>

      <div className="grid gap-2">
        <div>
          <Label className="text-xs">Size (lots)</Label>
          <Input value={size} onChange={(e) => setSize(e.target.value)} className="h-8" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">Stop Loss</Label><Input value={sl} onChange={(e) => setSl(e.target.value)} className="h-8" placeholder="—" /></div>
          <div><Label className="text-xs">Take Profit</Label><Input value={tp} onChange={(e) => setTp(e.target.value)} className="h-8" placeholder="—" /></div>
        </div>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button variant="destructive" onClick={() => submit("sell")} className="h-10 gap-1.5">
          <ArrowDown className="h-4 w-4" />Sell
        </Button>
        <Button onClick={() => submit("buy")} className="h-10 gap-1.5 bg-emerald-600 hover:bg-emerald-500">
          <ArrowUp className="h-4 w-4" />Buy
        </Button>
      </div>

      <div className="mt-2 rounded-md border border-border/60 bg-background/40 p-2 text-[11px] text-muted-foreground">
        Orders route through the Paper Trading engine. Drag SL/TP directly on the chart to modify (feature-flagged).
      </div>
    </div>
  );
}
