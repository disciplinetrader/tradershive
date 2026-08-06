import { Download, FileJson, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useStatistics } from "@/components/statistics/context";
import { useSessionContext } from "@/hooks/use-session-context";
import { computeKpis } from "@/lib/statistics/calculations";
import { toCsv, downloadFile } from "@/lib/statistics/format";

/**
 * Real analytics export. Always exports the *filtered* dataset for the
 * currently selected account/session context, so what you see is what you get.
 */
export function ExportMenu() {
  const { filtered, filters } = useStatistics();
  const { context } = useSessionContext();

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const scope = `${context.type}${context.id ? `-${context.id.slice(0, 8)}` : ""}`;
  const base = `tradershive-analytics-${scope}-${stamp}`;

  const rows = () =>
    filtered.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      market: t.market,
      direction: t.direction,
      source: t.source,
      opened_at: t.opened_at,
      closed_at: t.closed_at ?? "",
      entry_price: t.entry_price ?? "",
      exit_price: t.exit_price ?? "",
      stop_loss: t.stop_loss ?? "",
      take_profit: t.take_profit ?? "",
      lot_size: t.lot_size ?? "",
      pnl: t.pnl ?? "",
      rr: t.rr ?? "",
      risk_pct: t.risk_pct ?? "",
      commission: t.commission ?? "",
      swap: t.swap ?? "",
      duration_seconds: t.duration_seconds ?? "",
      grade: t.grade ?? "",
      status: t.status,
      setup: t.setup ?? "",
      strategy: t.strategy ?? "",
      session: t.session ?? "",
      account_id: t.account_id ?? "",
      emotions: (t.emotions ?? []).join("|"),
      mistakes: (t.mistakes ?? []).join("|"),
    }));

  const guard = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export — no trades match the current filters.");
      return false;
    }
    return true;
  };

  const exportCsv = () => {
    if (!guard()) return;
    downloadFile(`${base}.csv`, toCsv(rows()), "text/csv;charset=utf-8");
    toast.success(`Exported ${filtered.length} trades to CSV`);
  };

  const exportJson = () => {
    if (!guard()) return;
    const payload = {
      exported_at: new Date().toISOString(),
      context,
      filters,
      trade_count: filtered.length,
      kpis: computeKpis(filtered),
      trades: filtered,
    };
    downloadFile(`${base}.json`, JSON.stringify(payload, null, 2), "application/json");
    toast.success(`Exported ${filtered.length} trades to JSON`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {filtered.length} trade{filtered.length === 1 ? "" : "s"} · current filters
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={exportCsv}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Download CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={exportJson}>
          <FileJson className="mr-2 h-4 w-4" /> Download JSON (with KPIs)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
