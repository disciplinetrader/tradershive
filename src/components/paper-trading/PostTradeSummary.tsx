/**
 * Post-trade summary modal — shown after a trade closes. Surfaces P/L,
 * realised RR, duration, session, and deep-links to Journal, Replay
 * Studio and the community share flow. All data is derived from the
 * closed `paper_trades` row plus its position_history timeline.
 */
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { BookOpen, Play, Share2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TradeTimeline } from "./TradeTimeline";
import { SessionBadge } from "./SessionBadge";
import { formatCurrency, formatNumber, formatPrice } from "@/lib/paper-trading/calculations";
import { cn } from "@/lib/utils";

export type ClosedTrade = {
  id: string;
  symbol: string;
  direction: "long" | "short";
  entry_price: number | string;
  exit_price: number | string | null;
  lot_size: number | string;
  pnl: number | string | null;
  rr_realized: number | string | null;
  opened_at: string;
  closed_at: string | null;
  close_reason: string | null;
  commission: number | string | null;
  swap: number | string | null;
};

export function PostTradeSummary({
  trade,
  currency = "USD",
  open,
  onClose,
}: {
  trade: ClosedTrade | null;
  currency?: string;
  open: boolean;
  onClose: () => void;
}) {
  if (!trade) return null;
  const pnl = Number(trade.pnl ?? 0);
  const rr = trade.rr_realized != null ? Number(trade.rr_realized) : null;
  const up = pnl >= 0;
  const openedAt = new Date(trade.opened_at).getTime();
  const closedAt = trade.closed_at ? new Date(trade.closed_at).getTime() : Date.now();
  const durationMs = Math.max(0, closedAt - openedAt);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Trade closed
            <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase",
              trade.direction === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
              {trade.direction}
            </span>
            <span className="font-mono text-sm">{trade.symbol}</span>
            <SessionBadge at={trade.opened_at} />
          </DialogTitle>
        </DialogHeader>

        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className={cn(
            "grid grid-cols-4 gap-3 rounded-xl border p-3 text-xs",
            up ? "border-success/40 bg-success/5" : "border-danger/40 bg-danger/5",
          )}
        >
          <Stat label="P/L" value={
            <span className={cn("font-mono font-semibold", up ? "text-success" : "text-danger")}>
              {up ? "+" : ""}{formatCurrency(pnl, currency)}
            </span>
          } />
          <Stat label="RR realised" value={rr != null ? `${rr.toFixed(2)}R` : "—"} />
          <Stat label="Duration" value={formatDuration(durationMs)} />
          <Stat label="Close reason" value={
            <Badge variant="secondary" className="text-[10px] capitalize">
              {(trade.close_reason ?? "manual").replace(/_/g, " ")}
            </Badge>
          } />
          <Stat label="Entry" value={formatPrice(trade.symbol, trade.entry_price)} />
          <Stat label="Exit" value={trade.exit_price ? formatPrice(trade.symbol, trade.exit_price) : "—"} />
          <Stat label="Size" value={`${Number(trade.lot_size).toFixed(2)} lots`} />
          <Stat label="Fees" value={formatCurrency(Number(trade.commission ?? 0) + Number(trade.swap ?? 0), currency)} />
        </motion.div>

        <div className="max-h-56 overflow-auto rounded-xl border border-border/60 bg-background/40 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trade timeline</div>
          <TradeTimeline tradeId={trade.id} currency={currency} />
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="mr-1.5 h-4 w-4" /> Close
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/journal">
                <BookOpen className="mr-1.5 h-4 w-4" /> Open Journal
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/replay">
                <Play className="mr-1.5 h-4 w-4" /> Replay trade
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/community">
                <Share2 className="mr-1.5 h-4 w-4" /> Share
              </Link>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
