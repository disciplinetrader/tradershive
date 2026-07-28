import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLiveQuote } from "@/lib/market-data/hooks";
import { toast } from "sonner";
import { openTrade } from "@/lib/paper-trading.functions";
import { findSymbol } from "@/lib/paper-trading/symbols";
import { usePaper } from "@/components/paper-trading/context";

interface Props {
  symbol: string;
  market?: any;
}

/**
 * Chart-native paper order panel. Executes trades against the SAME live
 * Market Data Engine quote shown on the chart (crypto → Binance WS).
 */
export function TradePanel({ symbol, market }: Props) {
  const quote = useLiveQuote(symbol, market);
  const { accountId } = usePaper();
  const qc = useQueryClient();
  const submitTrade = useServerFn(openTrade);
  const [size, setSize] = useState("0.1");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");

  const meta = findSymbol(symbol);
  const price = quote?.last ?? quote?.bid ?? meta?.refPrice ?? 0;

  const mutation = useMutation({
    mutationFn: async (side: "long" | "short") => {
      if (!accountId) throw new Error("Select a paper account first");
      if (!meta) throw new Error(`Unknown symbol: ${symbol}`);
      // Hard guard: server rejects entry_price <= 0. Wait for the live quote
      // (or a valid ref price) rather than firing a doomed request.
      const px = Number(price);
      if (!Number.isFinite(px) || px <= 0) throw new Error("Waiting for live price — try again in a moment");
      const lot = Number(size);
      if (!lot || lot <= 0) throw new Error("Invalid size");
      return submitTrade({
        data: {
          account_id: accountId,
          symbol,
          market: meta.market,
          direction: side,
          order_type: "market",
          lot_size: lot,
          entry_price: px,
          stop_loss: sl ? Number(sl) : null,
          take_profit: tp ? Number(tp) : null,
          commission: 0,
          swap: 0,
        } as any,
      });
    },
    onSuccess: (_, side) => {
      toast.success(`${side.toUpperCase()} ${size} ${symbol} @ ${price.toFixed(meta?.decimals ?? 4)}`);
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Order failed"),
  });

  return (
    <div className="flex h-full flex-col gap-3 border-l border-border/60 bg-card/40 p-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{symbol}</div>
        <div className="mt-1 flex items-baseline gap-3">
          <span className="text-xl font-semibold tabular-nums">{price ? price.toFixed(meta?.decimals ?? 4) : "—"}</span>
          <span className="text-xs text-muted-foreground">
            Bid {quote?.bid?.toFixed(meta?.decimals ?? 4) ?? "—"} · Ask {quote?.ask?.toFixed(meta?.decimals ?? 4) ?? "—"}
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

      {!accountId ? (
        <p className="text-[11px] text-warning">No paper account selected.</p>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button
          variant="destructive"
          disabled={mutation.isPending || !accountId || !price}
          onClick={() => mutation.mutate("short")}
          className="h-10 gap-1.5"
        >
          <ArrowDown className="h-4 w-4" />Sell
        </Button>
        <Button
          disabled={mutation.isPending || !accountId || !price}
          onClick={() => mutation.mutate("long")}
          className="h-10 gap-1.5 bg-success hover:bg-success"
        >
          <ArrowUp className="h-4 w-4" />Buy
        </Button>
      </div>
    </div>
  );
}
