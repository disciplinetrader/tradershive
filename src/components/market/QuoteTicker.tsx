import { useEffect, useState } from "react";
import { useLiveQuote } from "@/lib/market-data/hooks";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";

export function QuoteTicker({ symbol, className }: { symbol: string; className?: string }) {
  const quote = useLiveQuote(symbol);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [prev, setPrev] = useState<number | null>(null);

  useEffect(() => {
    if (!quote) return;
    if (prev !== null && quote.last !== prev) {
      setFlash(quote.last > prev ? "up" : "down");
      const t = setTimeout(() => setFlash(null), 350);
      return () => clearTimeout(t);
    }
    setPrev(quote.last);
  }, [quote, prev]);

  if (!quote) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  const up = (quote.changePct ?? 0) >= 0;
  return (
    <div className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-mono tabular-nums transition-colors",
      flash === "up" && "bg-success/10 text-success",
      flash === "down" && "bg-danger/10 text-danger",
      !flash && "text-foreground/90", className)}>
      <span>{quote.last.toLocaleString(undefined, { maximumFractionDigits: 5 })}</span>
      <span className={cn("inline-flex items-center gap-0.5 text-[10px]", up ? "text-success" : "text-danger")}>
        {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(quote.changePct ?? 0).toFixed(2)}%
      </span>
    </div>
  );
}
