/** Similar trades — transparent rule-based matching, no semantic claims. */
import { Link } from "@tanstack/react-router";
import type { SimilarTrade } from "@/lib/journal/story";
import { formatCurrency, formatDate, formatNumber } from "@/lib/journal/format";
import { MissingData } from "./primitives";
import { cn } from "@/lib/utils";

export function SimilarTrades({ items }: { items: SimilarTrade[] }) {
  if (!items.length) return <MissingData label="No comparable trades in your journal yet." />;

  return (
    <ul className="space-y-1">
      {items.map(({ entry: e, similarity, difference }) => {
        const pnl = e.pnl == null ? null : Number(e.pnl);
        return (
          <li key={e.id}>
            <Link
              to="/journal/$entryId"
              params={{ entryId: e.id }}
              className="block rounded border border-border/40 px-2 py-1.5 transition hover:border-border hover:bg-muted/20"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-[12px] font-medium">{e.symbol ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">{formatDate(e.opened_at ?? e.created_at)}</span>
                <span
                  className={cn(
                    "ml-auto text-[12px] font-semibold tabular-nums",
                    pnl == null ? "" : pnl > 0 ? "text-success" : pnl < 0 ? "text-danger" : "",
                  )}
                >
                  {formatCurrency(pnl)}
                </span>
                {e.rr != null ? (
                  <span className="text-[10px] tabular-nums text-muted-foreground">{formatNumber(Number(e.rr), 2)}R</span>
                ) : null}
              </div>
              <p className="text-[10px] text-muted-foreground">Same: {similarity} · Different: {difference}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
