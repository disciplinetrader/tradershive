import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BookOpen, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTrades } from "@/lib/paper-trading.functions";
import { formatCurrency } from "@/lib/paper-trading/calculations";

/**
 * Compact journal preview inside the Trading Workspace. Shows recent closed
 * trades for the active symbol (or all if not provided) and links to the
 * full Journal module for deep review.
 */
export function QuickJournalPanel({ symbol }: { symbol?: string }) {
  const fetchTrades = useServerFn(listTrades);
  const { data } = useQuery({
    queryKey: ["paper", "recent-closed", symbol ?? "all"],
    queryFn: () => fetchTrades({ data: { status: "closed", limit: 25 } as any }) as unknown as Promise<any[]>,
    staleTime: 15_000,
  });

  const rows = (data ?? []).filter((t) => !symbol || t.symbol === symbol).slice(0, 10);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <BookOpen className="h-3.5 w-3.5" /> Recent closed trades {symbol ? `· ${symbol}` : ""}
        </div>
        <Button asChild variant="ghost" size="sm" className="h-7 gap-1 text-xs">
          <Link to="/journal">Open Journal <ExternalLink className="h-3 w-3" /></Link>
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
          Close a paper trade to auto-create a journal draft.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-medium">Symbol</th>
              <th className="text-left font-medium">Side</th>
              <th className="text-right font-medium">Entry</th>
              <th className="text-right font-medium">Exit</th>
              <th className="text-right font-medium">PnL</th>
              <th className="text-right font-medium">Closed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-border/40">
                <td className="py-1.5 font-medium">{t.symbol}</td>
                <td className={t.direction === "long" ? "text-success" : "text-danger"}>{t.direction}</td>
                <td className="text-right tabular-nums">{Number(t.entry_price).toFixed(4)}</td>
                <td className="text-right tabular-nums">{t.exit_price != null ? Number(t.exit_price).toFixed(4) : "—"}</td>
                <td className={`text-right tabular-nums ${Number(t.pnl) >= 0 ? "text-success" : "text-danger"}`}>
                  {t.pnl != null ? formatCurrency(Number(t.pnl)) : "—"}
                </td>
                <td className="text-right text-muted-foreground">{t.closed_at ? new Date(t.closed_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
