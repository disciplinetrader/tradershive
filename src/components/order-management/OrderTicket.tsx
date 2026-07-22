/**
 * Professional Order Ticket — reusable across Trading Workspace and
 * Replay Studio. Given an OrderManager, renders the full ticket UI with
 * live-derived metrics and a confirm-to-place flow.
 */

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, TrendingDown, TrendingUp } from "lucide-react";
import type {
  OrderManager, SizingConfig, TicketInput, TicketMetrics,
} from "@/lib/order-management";
import type { OrderKind, Side } from "@/lib/trading-engine";

export type OrderTicketProps = {
  manager: OrderManager;
  symbol: string;
  onPlaced?: (result: { orderId?: string; ok: boolean; message?: string }) => void;
  className?: string;
};

const KINDS: { value: OrderKind; label: string }[] = [
  { value: "market", label: "Market" },
  { value: "limit", label: "Limit" },
  { value: "stop", label: "Stop" },
  { value: "stop_limit", label: "Stop Limit" },
];

const SIZING_MODES: { value: SizingConfig["mode"]; label: string }[] = [
  { value: "fixed_lots", label: "Fixed Lots" },
  { value: "fixed_units", label: "Fixed Units" },
  { value: "cash_risk", label: "Cash Risk" },
  { value: "percent_risk", label: "% Risk" },
  { value: "atr_risk", label: "ATR Risk" },
  { value: "max_size", label: "Max Size" },
];

function fmt(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function OrderTicket({ manager, symbol, onPlaced, className }: OrderTicketProps) {
  const [side, setSide] = useState<Side>("long");
  const [kind, setKind] = useState<OrderKind>("market");
  const [sizingMode, setSizingMode] = useState<SizingConfig["mode"]>("fixed_lots");
  const [lots, setLots] = useState(0.10);
  const [units, setUnits] = useState(10_000);
  const [cashRisk, setCashRisk] = useState(100);
  const [percentRisk, setPercentRisk] = useState(1);
  const [atr, setAtr] = useState(0.0015);
  const [atrMult, setAtrMult] = useState(1.5);
  const [entry, setEntry] = useState<number | "">("");
  const [limit, setLimit] = useState<number | "">("");
  const [stop, setStop] = useState<number | "">("");
  const [sl, setSl] = useState<number | "">("");
  const [tp, setTp] = useState<number | "">("");
  const [placing, setPlacing] = useState(false);

  const sizing: SizingConfig = useMemo(() => {
    switch (sizingMode) {
      case "fixed_lots":   return { mode: "fixed_lots", lots };
      case "fixed_units":  return { mode: "fixed_units", units };
      case "cash_risk":    return { mode: "cash_risk", cashRisk };
      case "percent_risk": return { mode: "percent_risk", percent: percentRisk };
      case "atr_risk":     return { mode: "atr_risk", percent: percentRisk, atr, atrMultiplier: atrMult };
      case "max_size":     return { mode: "max_size" };
    }
  }, [sizingMode, lots, units, cashRisk, percentRisk, atr, atrMult]);

  const input: TicketInput = useMemo(() => ({
    symbol, side, kind, sizing,
    entryPrice: entry === "" ? null : Number(entry),
    limitPrice: limit === "" ? null : Number(limit),
    stopPrice: stop === "" ? null : Number(stop),
    stopLoss: sl === "" ? null : Number(sl),
    takeProfit: tp === "" ? null : Number(tp),
  }), [symbol, side, kind, sizing, entry, limit, stop, sl, tp]);

  const metrics: TicketMetrics = useMemo(() => manager.quote(input), [manager, input]);

  const buy = side === "long";

  async function submit(): Promise<void> {
    setPlacing(true);
    try {
      const res = manager.place(input);
      onPlaced?.({ orderId: res.order?.id, ok: res.ok, message: res.message });
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className={`space-y-3 rounded-md border bg-card p-3 text-sm ${className ?? ""}`}>
      {/* Side + Kind */}
      <div className="flex items-center gap-2">
        <Tabs value={side} onValueChange={(v) => setSide(v as Side)} className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="long" className="data-[state=active]:bg-success/15 data-[state=active]:text-success">
              <TrendingUp className="mr-1 h-4 w-4" /> Buy
            </TabsTrigger>
            <TabsTrigger value="short" className="data-[state=active]:bg-danger/15 data-[state=active]:text-danger">
              <TrendingDown className="mr-1 h-4 w-4" /> Sell
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Select value={kind} onValueChange={(v) => setKind(v as OrderKind)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Price inputs */}
      <div className="grid grid-cols-2 gap-2">
        {(kind === "limit" || kind === "stop_limit") && (
          <div><Label className="text-xs">Limit Price</Label>
            <Input type="number" step="0.00001" value={limit} onChange={(e) => setLimit(e.target.value === "" ? "" : Number(e.target.value))} /></div>
        )}
        {(kind === "stop" || kind === "stop_limit") && (
          <div><Label className="text-xs">Stop Price</Label>
            <Input type="number" step="0.00001" value={stop} onChange={(e) => setStop(e.target.value === "" ? "" : Number(e.target.value))} /></div>
        )}
        {kind === "market" && (
          <div className="col-span-2"><Label className="text-xs">Reference</Label>
            <Input value={fmt(metrics.currentPrice, 5)} disabled /></div>
        )}
        <div><Label className="text-xs">Stop Loss</Label>
          <Input type="number" step="0.00001" value={sl} onChange={(e) => setSl(e.target.value === "" ? "" : Number(e.target.value))} /></div>
        <div><Label className="text-xs">Take Profit</Label>
          <Input type="number" step="0.00001" value={tp} onChange={(e) => setTp(e.target.value === "" ? "" : Number(e.target.value))} /></div>
      </div>

      {/* Sizing */}
      <div className="space-y-2">
        <Label className="text-xs">Position Sizing</Label>
        <Select value={sizingMode} onValueChange={(v) => setSizingMode(v as SizingConfig["mode"])}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {SIZING_MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {sizingMode === "fixed_lots" && (
          <Input type="number" step="0.01" value={lots} onChange={(e) => setLots(Number(e.target.value))} />)}
        {sizingMode === "fixed_units" && (
          <Input type="number" step="100" value={units} onChange={(e) => setUnits(Number(e.target.value))} />)}
        {sizingMode === "cash_risk" && (
          <Input type="number" step="10" value={cashRisk} onChange={(e) => setCashRisk(Number(e.target.value))} />)}
        {sizingMode === "percent_risk" && (
          <Input type="number" step="0.1" value={percentRisk} onChange={(e) => setPercentRisk(Number(e.target.value))} />)}
        {sizingMode === "atr_risk" && (
          <div className="grid grid-cols-3 gap-2">
            <Input type="number" step="0.1" value={percentRisk} onChange={(e) => setPercentRisk(Number(e.target.value))} placeholder="%" />
            <Input type="number" step="0.0001" value={atr} onChange={(e) => setAtr(Number(e.target.value))} placeholder="ATR" />
            <Input type="number" step="0.1" value={atrMult} onChange={(e) => setAtrMult(Number(e.target.value))} placeholder="×" />
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-muted/40 p-2 text-xs">
        <Row label="Quantity" value={`${fmt(metrics.quantity, 2)} lots`} />
        <Row label="Units" value={fmt(metrics.units, 0)} />
        <Row label="Fill Price" value={fmt(metrics.fillPrice, 5)} />
        <Row label="Leverage" value={`${metrics.leverage}×`} />
        <Row label="Margin" value={fmt(metrics.marginRequired)} />
        <Row label="Free After" value={fmt(metrics.freeMarginAfter)} />
        <Row label="Risk" value={`${fmt(metrics.riskAmount)} (${fmt(metrics.riskPct, 2)}%)`} />
        <Row label="Reward" value={fmt(metrics.potentialProfit)} />
        <Row label="R:R" value={metrics.rr > 0 ? `1 : ${fmt(metrics.rr, 2)}` : "—"} />
        <Row label="Liquidation" value={metrics.liquidationPrice ? fmt(metrics.liquidationPrice, 5) : "—"} />
        <Row label="Spread" value={fmt(metrics.spreadCost)} />
        <Row label="Commission" value={fmt(metrics.commission)} />
        <Row label="Slippage" value={fmt(metrics.slippage)} />
        <Row label="Total Cost" value={fmt(metrics.totalCost)} />
      </div>

      {metrics.warnings.length > 0 && (
        <Alert variant="default" className="border-warning/40 bg-warning/10 text-xs">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{metrics.warnings.join(" · ")}</AlertDescription>
        </Alert>
      )}
      {metrics.errors.length > 0 && (
        <Alert variant="destructive" className="text-xs">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{metrics.errors.join(" · ")}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={submit}
        disabled={!metrics.ok || placing}
        className={`w-full ${buy ? "bg-success hover:bg-success/90" : "bg-danger hover:bg-danger/90"} text-white`}
      >
        {placing ? "Placing…" : `${buy ? "Buy" : "Sell"} ${symbol} · ${fmt(metrics.quantity, 2)} lots`}
      </Button>

      <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
        <Badge variant="outline">{kind}</Badge>
        <Badge variant="outline">{symbol}</Badge>
        <Badge variant="outline">{sizingMode}</Badge>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </>
  );
}
