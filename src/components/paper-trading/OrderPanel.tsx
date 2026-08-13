import { useEffect, useMemo, useRef, useState } from "react";
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
import { tradeCalculation, validateStops, formatCurrency } from "@/lib/paper-trading/calculations";
import { resolveQuantity } from "@/lib/paper-trading/order-ticket";
import { useLivePrice, useLiveQuotes } from "@/lib/paper-trading/live-quotes";
import { validateNewOrder, liquidationPrice, type OpenTradeInput } from "@/lib/paper-trading/risk";
import { onTradeIntent } from "@/lib/trading/trade-intent";
import { cn } from "@/lib/utils";
import { usePaper } from "./context";
import { PlaybookQuickAttach } from "@/components/playbook/PlaybookQuickAttach";

type Side = "long" | "short";
type OrderType = "market" | "limit" | "stop" | "stop_limit";

/**
 * Order entry.
 *
 * `compact` renders the terminal-style ticket used by the Trading Workspace:
 * only Buy/Sell, order type, entry, lot, SL, TP and Risk stay visible —
 * commission, tags, notes and playbook attachment move behind "Advanced".
 * Execution logic is identical in both modes.
 */
export function OrderPanel({ compact = false }: { compact?: boolean } = {}) {

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
  // Persistent inline "armed" state — set when the workspace routes a B/S
  // shortcut or chart intent to the panel; replaces the previous toasts.
  const [armed, setArmed] = useState<Side | null>(null);

  const openFn = useServerFn(openTrade);
  const orderFn = useServerFn(placeOrder);
  const tagsFn = useServerFn(listTradeTags);
  const createTagFn = useServerFn(createTradeTag);
  const listTradesFn = useServerFn(listTrades);
  const { data: tags } = useQuery({
    queryKey: ["paper", "tags"],
    queryFn: () =>
      tagsFn() as unknown as Promise<
        Array<{ id: string; name: string; color: string; kind: string }>
      >,
  });

  /**
   * The kind this picker creates. Tag names are unique per (user, kind), not
   * per user — "Revenge" can be both an emotion and a mistake — so every
   * name-based lookup below has to be scoped to a kind or it may bind to the
   * wrong tag entirely.
   */
  const PICKER_KIND = "setup";

  // Currently open positions on this account — needed to compute free margin
  // for the pre-flight validation so the panel shows the same numbers the
  // server will use when it accepts or rejects the order.
  const { data: openTrades } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => listTradesFn({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<OpenTradeInput[]>,
    enabled: !!accountId,
    refetchInterval: 5000,
  });

  const liveQuotes = useLiveQuotes(openTrades?.map((t) => t.symbol));

  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!entry && livePrice != null) setEntry(String(livePrice));
  }, [symbol, livePrice, entry]);

  // Cost structure is a property of the account, not of each ticket. Pre-fill
  // from the account's defaults when the trader has not typed over them — a
  // commission left at 0 makes every expectancy figure optimistic by exactly
  // the fees that were never entered.
  useEffect(() => {
    if (!account) return;
    setCommission((c) => (c === "0" || c === "" ? String(account.default_commission ?? 0) : c));
    setSwap((s) => (s === "0" || s === "" ? String(account.default_swap ?? 0) : s));
  }, [account?.id, account?.default_commission, account?.default_swap]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setEntry(livePrice != null ? String(livePrice) : "");
    setSl("");
    setTp("");
    setTouched(false);
  }, [symbol]); // eslint-disable-line

  const entryNum = Number(entry) || 0;
  const slNum = sl === "" ? null : Number(sl);
  const tpNum = tp === "" ? null : Number(tp);
  const lotNum = Number(lot) || 0;
  const balance = Number(account?.balance ?? 0);
  const leverage = Number(account?.leverage ?? 100);

  const calc = useMemo(() => {
    if (!symbolMeta || !touched) return null;
    const isValidStops = validateStops(side, entryNum, slNum, tpNum) === null;
    if (!isValidStops) return null;

    return tradeCalculation({
      sym: symbolMeta,
      side,
      entry: entryNum,
      sl: slNum,
      tp: tpNum,
      lot: lotNum,
      leverage,
      balance,
    });
  }, [symbolMeta, side, entryNum, slNum, tpNum, lotNum, leverage, balance, touched]);

  // Broker-style pre-flight: reject the same orders the server will reject,
  // and warn on the same ones. Runs on every keystroke so the CTA reflects
  // reality instantly.
  // Local field-level guards run first: malformed, zero, negative or
  // non-finite inputs must block the CTA even before the broker pre-flight
  // (which needs a usable entry/lot to run at all).
  const localErrors = useMemo(() => {
    if (!touched) return [];
    const errs: string[] = [];
    if (!Number.isFinite(entryNum) || entryNum <= 0) errs.push("Entry price must be a positive number");
    else if (entryNum > 1e12) errs.push("Entry price is out of range");

    if (!Number.isFinite(lotNum) || lotNum <= 0) errs.push("Lot size must be a positive number");
    else if (symbolMeta && lotNum < symbolMeta.minLot) errs.push(`Minimum lot size is ${symbolMeta.minLot}`);
    else if (symbolMeta && lotNum > symbolMeta.maxLot) errs.push(`Maximum lot size is ${symbolMeta.maxLot}`);

    if (sl !== "" && (!Number.isFinite(slNum as number) || (slNum as number) <= 0)) {
      errs.push("Stop loss must be a positive number");
    }
    if (tp !== "" && (!Number.isFinite(tpNum as number) || (tpNum as number) <= 0)) {
      errs.push("Take profit must be a positive number");
    }

    // Directional sanity for protective levels.
    const stopsMsg = validateStops(side, entryNum, slNum, tpNum);
    if (stopsMsg) errs.push(stopsMsg);

    return errs;
  }, [entryNum, lotNum, symbolMeta, sl, tp, slNum, tpNum, side]);

  const preflight = useMemo(() => {
    if (localErrors.length) return null;
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
        take_profit: tpNum,
        risk_amount: calc?.riskAmount ?? null,
      },
      (s) => liveQuotes[s]?.price ?? null,
    );
  }, [localErrors, account, symbolMeta, openTrades, symbol, side, entryNum, lotNum, slNum, tpNum, calc?.riskAmount, liveQuotes]);

  const validation = preflight;
  const errorList = useMemo(
    () => (localErrors.length ? localErrors : preflight?.errors ?? []),
    [localErrors, preflight],
  );
  const blocked = errorList.length > 0;



  const liqPrice = useMemo(
    () => symbolMeta && entryNum && leverage > 1 ? liquidationPrice(entryNum, side, leverage) : null,
    [symbolMeta, entryNum, side, leverage],
  );

  /**
   * Size from risk %, reporting the risk the lot ACTUALLY carries.
   *
   * `lotForRisk` clamps up to the symbol's `minLot`, so on an instrument whose
   * smallest tradeable size is large relative to the request the returned lot
   * can risk far more than asked — NQ at 0.5% of a $10k account resolves to 1
   * lot risking $3,982.50, or 39.8%. This used to report the REQUESTED figure
   * ("Sized to risk 0.5% ($50.01)") and then the order was rejected downstream
   * by the 25% hard cap, which reads as an inexplicable margin error. Same
   * clamp detection the workspace ticket already uses.
   */
  const calculateSizeFromRisk = () => {
    if (!symbolMeta || !slNum || !entryNum) return toast.error("Set entry and stop loss first");
    const sizing = resolveQuantity({
      mode: "risk_percent",
      sym: symbolMeta,
      entry: entryNum,
      sl: slNum,
      balance,
      value: Number(riskPct),
    });
    if (sizing.error || sizing.lot == null || sizing.actualRisk == null) {
      return toast.error(sizing.error ?? "Cannot compute — check entry/stop distance");
    }
    setLot(String(sizing.lot));
    const actualPct = balance > 0 ? (sizing.actualRisk / balance) * 100 : 0;
    if (sizing.clamped === "min") {
      toast.warning(
        `${symbolMeta.symbol} cannot trade below ${symbolMeta.minLot} lot. That size risks `
        + `${formatCurrency(sizing.actualRisk, account?.currency)} (${actualPct.toFixed(1)}% of balance), `
        + `not the ${riskPct}% you asked for.`,
      );
      return;
    }
    if (sizing.clamped === "max") {
      toast.warning(
        `${symbolMeta.symbol} caps at ${symbolMeta.maxLot} lots — risking `
        + `${formatCurrency(sizing.actualRisk, account?.currency)} (${actualPct.toFixed(1)}%), under your target.`,
      );
      return;
    }
    toast.success(
      `Sized to ${sizing.lot} lots — risks ${formatCurrency(sizing.actualRisk, account?.currency)} `
      + `(${actualPct.toFixed(2)}%)`,
    );
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
      if (errorList.length) {
        throw new Error(errorList[0] ?? "Order rejected");
      }

      // Server rejects entry_price <= 0. Guard against submitting a market
      // order before the first live quote lands (previously produced a raw
      // "entry_price: Number must be greater than 0" toast).
      const marketPx = Number(livePrice ?? entryNum);
      if (orderType === "market") {
        if (!(marketPx > 0)) {
          throw new Error("Waiting for live price — check your connection or try again");
        }
        // Ensure the price isn't extremely stale (e.g. from a paused market or old cache)
        // This is a safety check for market orders.
      }
      if (orderType !== "market" && !(entryNum > 0)) {
        throw new Error("Enter a trigger price");
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
        return openFn({ data: { ...base, order_type: "market", entry_price: marketPx } });
      }
      return orderFn({ data: { ...base, order_type: orderType, trigger_price: entryNum } });
    },
    onSuccess: () => {
      toast.success(orderType === "market" ? "Trade opened" : "Order placed");
      reset();
      setArmed(null);
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
      if (e.key === "Escape" && armed) { setArmed(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openMut, armed]);

  // Always points at the current render's attemptPlace, so a submit triggered
  // from the intent bus reads the values the intent just set rather than the
  // ones captured when the subscription was created.
  const attemptPlaceRef = useRef(attemptPlace);
  attemptPlaceRef.current = attemptPlace;

  // Bumped by a "submit" intent. Firing the order from an effect keyed on this
  // counter guarantees React has committed setSide/setOrderType/setLot from the
  // same batch first — the previous `setTimeout(() => attemptPlace(), 0)` ran a
  // stale closure and submitted the *previous* side and lot size.
  const [submitRequest, setSubmitRequest] = useState(0);

  // Listen for chart-side intents (right-click menu, planner "Send", B/S shortcuts).
  useEffect(() => {
    const unsub = onTradeIntent((i) => {
      if (i.kind === "focus_side") { setSide(i.side); setArmed(i.side); return; }
      const isSubmit = i.kind === "submit";
      setSide(i.side);
      setOrderType(i.orderType);
      if (i.price != null) setEntry(String(i.price));
      if (i.sl != null) setSl(String(i.sl));
      if (i.tp != null) setTp(String(i.tp));
      if (i.lot != null) setLot(String(i.lot));
      if (isSubmit) setSubmitRequest((n) => n + 1);
    });
    return () => { unsub(); };
  }, []);

  useEffect(() => {
    if (submitRequest === 0) return;
    attemptPlaceRef.current();
  }, [submitRequest]);

  const filteredTags = (tags ?? []).filter((t) => t.name.toLowerCase().includes(tagQuery.toLowerCase()));
  const canCreateTag =
    tagQuery &&
    !(tags ?? []).some(
      (t) => t.kind === PICKER_KIND && t.name.toLowerCase() === tagQuery.toLowerCase(),
    );

  const riskWarn = calc && account?.max_trade_risk_pct != null && calc.riskPct > Number(account.max_trade_risk_pct);
  const waitingForPrice = orderType === "market" && !(Number(livePrice ?? entryNum) > 0);

  return (
    <div className="flex flex-col gap-3">
      {armed ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px] font-semibold",
            armed === "long"
              ? "border-success/40 bg-success/10 text-success"
              : "border-danger/40 bg-danger/10 text-danger",
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            Armed · {armed === "long" ? "BUY" : "SELL"} — <kbd className="rounded bg-background/60 px-1 py-0.5 font-mono text-[10px]">↵</kbd> submit ·
            <kbd className="rounded bg-background/60 px-1 py-0.5 font-mono text-[10px]">Esc</kbd> cancel
          </span>
          <button
            type="button"
            onClick={() => setArmed(null)}
            className="rounded p-0.5 text-current/70 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40"
            aria-label="Clear armed side"
          >×</button>
        </div>
      ) : null}
      <Tabs value={side} onValueChange={(v) => setSide(v as Side)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="long" aria-pressed={side === "long"} className="cursor-pointer transition-all duration-150 data-[state=active]:bg-success/20 data-[state=active]:text-success data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-success/50">Buy</TabsTrigger>
          <TabsTrigger value="short" aria-pressed={side === "short"} className="cursor-pointer transition-all duration-150 data-[state=active]:bg-danger/20 data-[state=active]:text-danger data-[state=active]:shadow-sm focus-visible:ring-2 focus-visible:ring-danger/50">Sell</TabsTrigger>
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
        <Field label="Entry price" htmlFor="order-entry" error={errorList.find(e => e.toLowerCase().includes("entry"))}>
          <div className="flex gap-1">
            <Input id="order-entry" inputMode="decimal" value={entry} onChange={(e) => { setEntry(e.target.value); setTouched(true); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attemptPlace(); } }}
              aria-invalid={errorList.some(m => m.toLowerCase().includes("entry"))}
              aria-describedby={errorList.some(m => m.toLowerCase().includes("entry")) ? "order-entry-error" : undefined}
              className="h-8 font-mono" />
            {livePrice != null && (
              <Button
                type="button" size="sm" variant="outline" className="h-8 shrink-0 px-2 text-[10px] font-semibold uppercase"
                onClick={() => { setEntry(String(livePrice)); setTouched(true); }} title="Use live price"
              >Live</Button>
            )}
          </div>
        </Field>
        <Field label="Lot size" htmlFor="order-lot" error={errorList.find(e => e.toLowerCase().includes("lot"))}>
          <Input id="order-lot" inputMode="decimal" value={lot} onChange={(e) => { setLot(e.target.value); setTouched(true); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attemptPlace(); } }}
            aria-invalid={errorList.some(m => m.toLowerCase().includes("lot"))}
            aria-describedby={errorList.some(m => m.toLowerCase().includes("lot")) ? "order-lot-error" : undefined}
            className="h-8 font-mono" />
        </Field>
        <Field label="Stop loss" htmlFor="order-sl" error={errorList.find(e => e.toLowerCase().includes("stop"))}>
          <Input id="order-sl" inputMode="decimal" value={sl} onChange={(e) => { setSl(e.target.value); setTouched(true); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attemptPlace(); } }}
            aria-invalid={errorList.some(m => m.toLowerCase().includes("stop"))}
            aria-describedby={errorList.some(m => m.toLowerCase().includes("stop")) ? "order-sl-error" : undefined}
            className="h-8 font-mono" placeholder="—" />
        </Field>
        <Field label="Take profit" htmlFor="order-tp" error={errorList.find(e => e.toLowerCase().includes("profit"))}>
          <Input id="order-tp" inputMode="decimal" value={tp} onChange={(e) => { setTp(e.target.value); setTouched(true); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); attemptPlace(); } }}
            aria-invalid={errorList.some(m => m.toLowerCase().includes("profit"))}
            aria-describedby={errorList.some(m => m.toLowerCase().includes("profit")) ? "order-tp-error" : undefined}
            className="h-8 font-mono" placeholder="—" />
        </Field>

        <Field label="Risk %" htmlFor="order-risk-pct">
          <div className="flex gap-1">
            <Input id="order-risk-pct" inputMode="decimal" value={riskPct} onChange={(e) => setRiskPct(e.target.value)} className="h-8 font-mono" />
            <Button size="icon" variant="outline" className="h-8 w-8 transition-transform active:scale-95" aria-label="Calculate lot from risk" title="Calculate lot from risk" onClick={() => { calculateSizeFromRisk(); setTouched(true); }}>
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
        {!compact && (
          <Field label="Commission">
            <Input inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} className="h-8 font-mono" />
          </Field>
        )}

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
          {errorList.length > 0 && (
            <div className="mt-2 space-y-1">
              {errorList.map((msg, i) => (
                <p key={i} className="flex items-start gap-1.5 rounded-md bg-danger/10 px-2 py-1 text-danger">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {msg}
                </p>
              ))}
            </div>
          )}
          {!blocked && validation && validation.warnings.length > 0 && (
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

      <details open={!compact} className={cn(compact && "rounded-md border border-border/40 bg-background/30")}>
        <summary className={cn(
          "flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground",
          !compact && "hidden",
        )}>
          Advanced — tags, notes &amp; playbook
        </summary>
        <div className={cn("space-y-3", compact && "border-t border-border/40 p-2")}>
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
                const existing = tags?.find((t) => t.kind === PICKER_KIND && t.name === n);
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

      <PlaybookQuickAttach context="paper" />
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-2">

        <div className="ml-auto flex flex-1 justify-end gap-2">
          <Button variant="outline" onClick={reset} className="cursor-pointer transition-all duration-150 active:scale-[0.98]"><RotateCcw className="mr-1.5 h-4 w-4" /> Reset</Button>
          <Button
            onClick={attemptPlace}
            disabled={openMut.isPending || !accountId || !symbolMeta || blocked || waitingForPrice}
            aria-label={waitingForPrice ? "Waiting for live price" : (side === "long" ? "Buy market order" : "Sell market order")}
            className={cn("flex-1 cursor-pointer shadow-elegant transition-all duration-150 hover:shadow-md active:scale-[0.98] focus-visible:ring-2",
              side === "long"
                ? "bg-success text-white hover:bg-success/90 focus-visible:ring-success/60"
                : "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/60")}
          >
            <Send className="mr-1.5 h-4 w-4" />
            {errorList.length > 0
              ? errorList[0]
              : waitingForPrice
              ? "Waiting for price…"
              : orderType === "market"
              ? (side === "long" ? "Buy market" : "Sell market")
              : "Place order"}
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

function Field({ label, htmlFor, children, error }: { label: string; htmlFor?: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
      {error && (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-[10px] font-medium text-danger">
          {error}
        </p>
      )}
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
