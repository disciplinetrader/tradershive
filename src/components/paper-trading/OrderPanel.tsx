import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { AlertTriangle, Calculator, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { openTrade, placeOrder, listTradeTags, createTradeTag, listTrades } from "@/lib/paper-trading.functions";
import { COMMON_TAGS } from "@/lib/paper-trading/symbols";
import { lotForRisk, tradeCalculation, validateStops, formatCurrency } from "@/lib/paper-trading/calculations";
import { useLivePrice, useLiveQuotes } from "@/lib/paper-trading/mock-prices";
import { validateNewOrder, liquidationPrice, type OpenTradeInput } from "@/lib/paper-trading/risk";
import { onTradeIntent } from "@/lib/trading/trade-intent";
import { cn } from "@/lib/utils";
import { usePaper } from "./context";

type Side = "long" | "short";
type OrderType = "market" | "limit" | "stop" | "stop_limit";

export function OrderPanel() {
  const qc = useQueryClient();
  const { symbol, symbolMeta, account, accountId } = usePaper();
  const livePrice = useLivePrice(symbol);

  const [side, setSide] = useState<Side>("long");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [entry, setEntry] = useState<string>("");
  const [lot, setLot] = useState<string>("0.10");
  const [riskPct, setRiskPct] = useState<string>("1");
  const [sl, setSl] = useState<string>("");
  const [tp, setTp] = useState<string>("");
  const [commission, setCommission] = useState<string>("0");
  const [swap, setSwap] = useState<string>("0");
  const [notes, setNotes] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");

  const openFn = useServerFn(openTrade);
  const orderFn = useServerFn(placeOrder);
  const tagsFn = useServerFn(listTradeTags);
  const createTagFn = useServerFn(createTradeTag);
  const listTradesFn = useServerFn(listTrades);
  const liveQuotes = useLiveQuotes();

  const { data: tags } = useQuery({
    queryKey: ["paper", "tags"],
    queryFn: () => tagsFn() as unknown as Promise<Array<{ id: string; name: string; color: string }>>,
  });

  // Currently open positions on this account — needed to compute free margin
  // for the pre-flight validation so the panel shows the same numbers the
  // server will use when it accepts or rejects the order.
  const { data: openTrades } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => listTradesFn({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<OpenTradeInput[]>,
    enabled: !!accountId,
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!entry && livePrice != null) setEntry(String(livePrice));
  }, [symbol, livePrice, entry]);
  useEffect(() => { setEntry(livePrice != null ? String(livePrice) : ""); setSl(""); setTp(""); }, [symbol]); // eslint-disable-line

  const entryNum = Number(entry) || 0;
  const slNum = sl === "" ? null : Number(sl);
  const tpNum = tp === "" ? null : Number(tp);
  const lotNum = Number(lot) || 0;
  const balance = Number(account?.balance ?? 0);
  const leverage = Number(account?.leverage ?? 100);

  const calc = useMemo(() => {
    if (!symbolMeta) return null;
    return tradeCalculation({
      sym: symbolMeta, side, entry: entryNum, sl: slNum, tp: tpNum, lot: lotNum,
      leverage, balance,
    });
  }, [symbolMeta, side, entryNum, slNum, tpNum, lotNum, leverage, balance]);

  // Broker-style pre-flight: reject the same orders the server will reject,
  // and warn on the same ones. Runs on every keystroke so the CTA reflects
  // reality instantly.
  const validation = useMemo(() => {
    if (!account || !symbolMeta || !entryNum || !lotNum) return null;
    return validateNewOrder(
      account as any,
      openTrades ?? [],
      {
        symbol,
        direction: side,
        entry_price: entryNum,
        lot_size: lotNum,
        stop_loss: slNum,
        risk_amount: calc?.riskAmount ?? null,
      },
      (s) => liveQuotes[s]?.price ?? null,
    );
  }, [account, symbolMeta, openTrades, symbol, side, entryNum, lotNum, slNum, calc?.riskAmount, liveQuotes]);

  const liqPrice = useMemo(
    () => symbolMeta && entryNum && leverage > 1 ? liquidationPrice(entryNum, side, leverage) : null,
    [symbolMeta, entryNum, side, leverage],
  );

  const calculateSizeFromRisk = () => {
    if (!symbolMeta || !slNum || !entryNum) return toast.error("Set entry and stop loss first");
    const riskAmount = balance * (Number(riskPct) / 100);
    const suggested = lotForRisk(symbolMeta, entryNum, slNum, riskAmount);
    if (!suggested) return toast.error("Cannot compute — check entry/stop distance");
    setLot(String(suggested));
    toast.success(`Sized to risk ${riskPct}% (${formatCurrency(riskAmount, account?.currency)})`);
  };

  const reset = () => {
    setLot("0.10"); setSl(""); setTp(""); setNotes(""); setSelectedTagIds([]);
    setEntry(livePrice != null ? String(livePrice) : "");
  };

  const [riskDialogOpen, setRiskDialogOpen] = useState(false);

  const openMut = useMutation({
    mutationFn: async (opts?: { bypassWarnings?: boolean }) => {
      if (!accountId || !symbolMeta) throw new Error("Select an account first");
      const stopsMsg = validateStops(side, entryNum, slNum, tpNum);
      if (stopsMsg) throw new Error(stopsMsg);
      if (!lotNum || lotNum < symbolMeta.minLot) throw new Error(`Minimum lot is ${symbolMeta.minLot}`);

      // Hard errors block regardless of user choice — server enforces these too.
      if (validation && !validation.ok) {
        throw new Error(validation.errors[0] ?? "Order rejected");
      }

      const base = {
        account_id: accountId, symbol, market: symbolMeta.market, direction: side,
        lot_size: lotNum, stop_loss: slNum, take_profit: tpNum,
        commission: Number(commission) || 0, swap: Number(swap) || 0,
        notes: notes || null, tag_ids: selectedTagIds,
        risk_amount: calc?.riskAmount ?? null, reward_amount: calc?.rewardAmount ?? null,
        rr_planned: calc?.rr ?? null,
      };
      void opts;
      if (orderType === "market") {
        return openFn({ data: { ...base, order_type: "market", entry_price: livePrice ?? entryNum } });
      }
      return orderFn({ data: { ...base, order_type: orderType, trigger_price: entryNum } });
    },
    onSuccess: () => {
      toast.success(orderType === "market" ? "Trade opened" : "Order placed");
      reset();
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  // Broker-style intent: soft warnings surface a themed AlertDialog before we
  // actually submit. Hard errors fall through to the mutation which throws.
  const attemptPlace = () => {
    if (validation && validation.ok && validation.warnings.length > 0) {
      setRiskDialogOpen(true);
      return;
    }
    openMut.mutate({});
  };

  const confirmRiskyPlace = () => {
    setRiskDialogOpen(false);
    openMut.mutate({ bypassWarnings: true });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;
      if (e.key === "b" && !inField) { setSide("long"); }
      if (e.key === "s" && !inField) { setSide("short"); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); attemptPlace(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMut]);

  // Listen for chart-side intents (right-click menu, planner "Send")
  useEffect(() => {
    const unsub = onTradeIntent((i) => {
      if (i.kind === "focus_side") { setSide(i.side); return; }
      const isSubmit = i.kind === "submit";
      setSide(i.side);
      setOrderType(i.orderType);
      if (i.price != null) setEntry(String(i.price));
      if (i.sl != null) setSl(String(i.sl));
      if (i.tp != null) setTp(String(i.tp));
      if (i.lot != null) setLot(String(i.lot));
      if (isSubmit) setTimeout(() => attemptPlace(), 0);
    });
    return () => { unsub(); };
  }, [openMut]);

  const filteredTags = (tags ?? []).filter((t) => t.name.toLowerCase().includes(tagQuery.toLowerCase()));
  const canCreateTag = tagQuery && !(tags ?? []).some((t) => t.name.toLowerCase() === tagQuery.toLowerCase());

  const riskWarn = calc && account?.max_trade_risk_pct != null && calc.riskPct > Number(account.max_trade_risk_pct);

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={side} onValueChange={(v) => setSide(v as Side)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="long" className="cursor-pointer transition-all duration-150 data-[state=active]:bg-success/20 data-[state=active]:text-success data-[state=active]:shadow-sm">Buy</TabsTrigger>
          <TabsTrigger value="short" className="cursor-pointer transition-all duration-150 data-[state=active]:bg-danger/20 data-[state=active]:text-danger data-[state=active]:shadow-sm">Sell</TabsTrigger>
        </TabsList>
      </Tabs>

      <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="market">Market</SelectItem>
          <SelectItem value="limit">Limit</SelectItem>
          <SelectItem value="stop">Stop</SelectItem>
          <SelectItem value="stop_limit">Stop Limit</SelectItem>
        </SelectContent>
      </Select>

      <div className="grid grid-cols-2 gap-2">
        <Field label={orderType === "market" ? "Entry (live)" : "Trigger price"}>
          <div className="flex gap-1">
            <Input inputMode="decimal" value={entry} onChange={(e) => setEntry(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attemptPlace(); } }}
              className="h-8 font-mono" />
            {livePrice != null && (
              <Button
                type="button" size="sm" variant="outline" className="h-8 shrink-0 px-2 text-[10px] font-semibold uppercase"
                onClick={() => setEntry(String(livePrice))} title="Use live price"
              >Live</Button>
            )}
          </div>
        </Field>
        <Field label="Lot size">
          <Input inputMode="decimal" value={lot} onChange={(e) => setLot(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attemptPlace(); } }}
            className="h-8 font-mono" />
        </Field>
        <Field label="Stop loss">
          <Input inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attemptPlace(); } }}
            className="h-8 font-mono" placeholder="—" />
        </Field>
        <Field label="Take profit">
          <Input inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attemptPlace(); } }}
            className="h-8 font-mono" placeholder="—" />
        </Field>
        <Field label="Risk %">
          <div className="flex gap-1">
            <Input inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} className="h-8 font-mono" />
            <Button size="icon" variant="outline" className="h-8 w-8 transition-transform active:scale-95" aria-label="Calculate lot from risk" title="Calculate lot from risk" onClick={calculateSizeFromRisk}>
              <Calculator className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-1 flex gap-1">
            {["0.25", "0.5", "1", "2"].map((r) => (
              <button
                key={r} type="button"
                onClick={() => { setRiskPct(r); setTimeout(calculateSizeFromRisk, 0); }}
                className={cn(
                  "flex-1 rounded-md border border-border/60 px-1 py-0.5 text-[10px] font-semibold transition-colors",
                  riskPct === r ? "border-primary/60 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                title={`Size for ${r}% risk`}
              >{r}%</button>
            ))}
          </div>
        </Field>
        <Field label="Commission">
          <Input inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} className="h-8 font-mono" />
        </Field>
      </div>

      {calc && (
        <motion.div
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border/70 bg-background/40 p-3 text-xs"
        >
          <div className="grid grid-cols-2 gap-y-1.5">
            <Row label="Risk amount" value={formatCurrency(calc.riskAmount, account?.currency)} />
            <Row label="Reward" value={formatCurrency(calc.rewardAmount, account?.currency)} accent="emerald" />
            <Row label="Risk %" value={`${calc.riskPct.toFixed(2)}%`} accent={riskWarn ? "rose" : undefined} />
            <Row label="RR" value={calc.rr ? `${calc.rr.toFixed(2)} : 1` : "—"} />
            <Row label="Notional" value={formatCurrency(calc.notional, account?.currency)} />
            <Row label="Required margin" value={formatCurrency(calc.margin, account?.currency)} />
            {validation && (
              <>
                <Row
                  label="Free margin after"
                  value={formatCurrency(validation.free_margin_after, account?.currency)}
                  accent={validation.free_margin_after < 0 ? "rose" : undefined}
                />
                <Row
                  label="Buying power after"
                  value={formatCurrency(validation.buying_power_after, account?.currency)}
                />
              </>
            )}
            <Row label="Leverage" value={`${leverage}×`} />
            {liqPrice != null && (
              <Row label="Est. liquidation" value={liqPrice.toFixed(symbolMeta?.decimals ?? 2)} accent="rose" />
            )}
          </div>
          {validation && validation.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {validation.errors.map((msg, i) => (
                <p key={i} className="flex items-start gap-1.5 rounded-md bg-danger/10 px-2 py-1 text-danger">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {msg}
                </p>
              ))}
            </div>
          )}
          {validation && validation.errors.length === 0 && validation.warnings.length > 0 && (
            <div className="mt-2 space-y-1">
              {validation.warnings.map((msg, i) => (
                <p key={i} className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {msg}
                </p>
              ))}
            </div>
          )}
        </motion.div>
      )}

      <div>
        <Label className="text-xs">Tags</Label>
        <div className="mt-1 flex flex-wrap gap-1">
          {selectedTagIds.map((id) => {
            const t = tags?.find((x) => x.id === id);
            if (!t) return null;
            return (
              <Badge key={id} variant="secondary" className="cursor-pointer" onClick={() => setSelectedTagIds((s) => s.filter((x) => x !== id))}>
                {t.name} ×
              </Badge>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <Input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="Search or create tag" className="h-8" />
          {canCreateTag && (
            <Button size="sm" variant="outline" className="h-8" onClick={async () => {
              try {
                const created = await createTagFn({ data: { name: tagQuery.trim() } });
                setSelectedTagIds((s) => [...s, (created as unknown as { id: string }).id]);
                setTagQuery("");
                qc.invalidateQueries({ queryKey: ["paper", "tags"] });
              } catch (e) { toast.error((e as Error).message); }
            }}>Create</Button>
          )}
        </div>
        {tagQuery && (
          <div className="mt-1 flex flex-wrap gap-1">
            {filteredTags.slice(0, 8).map((t) => (
              <button key={t.id}
                onClick={() => { setSelectedTagIds((s) => s.includes(t.id) ? s : [...s, t.id]); setTagQuery(""); }}
                className="rounded-md border border-border/60 px-2 py-0.5 text-xs hover:bg-accent">
                + {t.name}
              </button>
            ))}
          </div>
        )}
        {!tagQuery && !selectedTagIds.length && (
          <div className="mt-1 flex flex-wrap gap-1">
            {COMMON_TAGS.slice(0, 6).map((n) => (
              <button key={n} onClick={async () => {
                const existing = tags?.find((t) => t.name === n);
                if (existing) return setSelectedTagIds((s) => s.includes(existing.id) ? s : [...s, existing.id]);
                try {
                  const created = await createTagFn({ data: { name: n } });
                  setSelectedTagIds((s) => [...s, (created as unknown as { id: string }).id]);
                  qc.invalidateQueries({ queryKey: ["paper", "tags"] });
                } catch (e) { toast.error((e as Error).message); }
              }} className="rounded-md border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:bg-accent">
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Trade notes / thesis" rows={2} />

      <div className="flex flex-wrap items-center gap-2">
        <PlaybookQuickAttach context="paper" />
        <div className="ml-auto flex flex-1 justify-end gap-2">
          <Button variant="outline" onClick={reset} className="cursor-pointer transition-all duration-150 active:scale-[0.98]"><RotateCcw className="mr-1.5 h-4 w-4" /> Reset</Button>
          <Button
            onClick={attemptPlace}
            disabled={openMut.isPending || !accountId || !symbolMeta || (validation != null && !validation.ok)}
            className={cn("flex-1 cursor-pointer shadow-elegant transition-all duration-150 hover:shadow-md active:scale-[0.98] focus-visible:ring-2",
              side === "long"
                ? "bg-success text-white hover:bg-success/90 focus-visible:ring-success/60"
                : "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/60")}
          >
            <Send className="mr-1.5 h-4 w-4" />
            {validation && !validation.ok ? "Insufficient margin" : (orderType === "market" ? (side === "long" ? "Buy market" : "Sell market") : "Place order")}
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Shortcuts — <kbd>B</kbd> buy · <kbd>S</kbd> sell · <kbd>⌘/Ctrl</kbd>+<kbd>↵</kbd> place · Run a playbook checklist before entry.</p>

      <AlertDialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" /> High risk trade
            </AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;re about to place a trade that exceeds your configured risk limits.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ul className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            {calc && (
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span>
                  Risk: <strong className="text-warning">{calc.riskPct.toFixed(2)}%</strong>
                  {account?.max_trade_risk_pct != null && (
                    <> (Maximum: <strong>{Number(account.max_trade_risk_pct)}%</strong>)</>
                  )}
                </span>
              </li>
            )}
            <li className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
              <span>Leverage: <strong className="text-warning">{leverage}×</strong></span>
            </li>
            {validation?.warnings.map((msg, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span>{msg}</span>
              </li>
            ))}
            <li className="flex items-start gap-2 text-danger">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />
              <span>Small price movements may result in liquidation.</span>
            </li>
          </ul>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRiskyPlace}
              className="bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger"
            >
              Place trade anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "emerald" | "rose" }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-mono tabular-nums",
        accent === "emerald" && "text-success",
        accent === "rose" && "text-danger")}>{value}</span>
    </>
  );
}
