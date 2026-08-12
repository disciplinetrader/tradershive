import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  openTrade, placeOrder, closeTrade, listTrades, listTradeTags, createTradeTag,
  setTradeExits, listTradeExits,
} from "@/lib/paper-trading.functions";
import { COMMON_TAGS } from "@/lib/paper-trading/symbols";
import {
  formatCurrency, pnl as computePnl, tradeCalculation, validateStops,
} from "@/lib/paper-trading/calculations";
import {
  resolveQuantity, targetPriceForReward, stopPriceForRisk,
  QUANTITY_MODE_LABEL, TARGET_MODE_LABEL, STOP_MODE_LABEL,
  type QuantityMode, type TargetMode, type StopMode,
} from "@/lib/paper-trading/order-ticket";
import { useLivePrice } from "@/lib/paper-trading/live-quotes";
import { validateNewOrder, liquidationPrice, type OpenTradeInput } from "@/lib/paper-trading/risk";
import { onTradeIntent } from "@/lib/trading/trade-intent";
import { cn } from "@/lib/utils";
import { usePaper } from "@/components/paper-trading/context";
import { PostCloseCapture } from "./PostCloseCapture";

/**
 * Order ticket — the /trading entry surface, rebuilt against TradingView's
 * paper-trading reference.
 *
 * Replaces `OrderPanel`'s UI while calling exactly the same functions:
 * `openTrade` / `placeOrder` on entry, `closeTrade` on exit, and the
 * `tag_ids` staging write that `create_journal_draft_from_trade()` drains.
 * The wire contract is unchanged, so journal tagging, the draft trigger and
 * `observation_cursor` are untouched by this rebuild.
 *
 * Two things it does that `OrderPanel` did not:
 *
 *  1. **Size from risk.** "Risk $" and "Risk %" compute the position backward
 *     from the stop distance. Beyond convenience this removes an ambiguity
 *     class at the input: a field labelled "Risk $" cannot be misread as lots
 *     the way a bare "size" can.
 *  2. **One panel, two states.** Before a fill it is an order preview; after a
 *     fill the same panel is position info. Not two components — the state is
 *     derived from whether this symbol has an open position.
 */

type Side = "long" | "short";
type OrderType = "market" | "limit" | "stop" | "stop_limit";
type TpAction = "none" | "break_even" | "trail";

type ExitLeg = {
  key: string;
  price: string;
  percent: string;
  action: TpAction;
};

type OpenTrade = {
  id: string; symbol: string; direction: Side;
  entry_price: number | string; lot_size: number | string;
  stop_loss: number | string | null; take_profit: number | string | null;
  risk_amount: number | string | null; opened_at: string;
  commission: number | string | null; swap: number | string | null;
};

type ExitRow = {
  id: string; idx: number; kind: string; price: number | string;
  percent: number | string; action: string; status: string;
  filled_at: string | null; filled_price: number | string | null;
};

let legSeq = 0;
const newLeg = (price = "", percent = "100", action: TpAction = "none"): ExitLeg => ({
  key: `leg_${++legSeq}`, price, percent, action,
});

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function OrderTicket({ compact = false }: { compact?: boolean } = {}) {
  const qc = useQueryClient();
  const { symbol, symbolMeta, account, accountId } = usePaper();
  const livePrice = useLivePrice(symbol);

  const openFn = useServerFn(openTrade);
  const orderFn = useServerFn(placeOrder);
  const closeFn = useServerFn(closeTrade);
  const setExitsFn = useServerFn(setTradeExits);
  const exitsFn = useServerFn(listTradeExits);
  const listTradesFn = useServerFn(listTrades);
  const tagsFn = useServerFn(listTradeTags);
  const createTagFn = useServerFn(createTradeTag);

  /* ---------------- ticket state ---------------- */
  const [side, setSide] = useState<Side>("long");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [entry, setEntry] = useState("");

  const [qtyMode, setQtyMode] = useState<QuantityMode>("units");
  const [qtyValue, setQtyValue] = useState("0.10");

  const [sl, setSl] = useState("");
  const [slMode, setSlMode] = useState<StopMode>("price");
  const [tpMode, setTpMode] = useState<TargetMode>("price");
  const [legs, setLegs] = useState<ExitLeg[]>([newLeg()]);

  const [notes, setNotes] = useState("");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagQuery, setTagQuery] = useState("");
  const [armed, setArmed] = useState<Side | null>(null);
  const [touched, setTouched] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [justClosed, setJustClosed] = useState<{ id: string; pnl: number } | null>(null);

  const PICKER_KIND = "setup";

  const { data: tags } = useQuery({
    queryKey: ["paper", "tags"],
    queryFn: () => tagsFn() as unknown as Promise<Array<{ id: string; name: string; color: string; kind: string }>>,
  });

  const { data: openTrades } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => listTradesFn({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<OpenTrade[]>,
    enabled: !!accountId,
    refetchInterval: 5000,
  });

  const position = useMemo(
    () => (openTrades ?? []).find((t) => t.symbol === symbol) ?? null,
    [openTrades, symbol],
  );

  // The panel's two states. A position on this symbol flips it to position
  // info; "New order" pins it back to entry without unmounting anything.
  const mode: "entry" | "position" = position && !showEntry ? "position" : "entry";

  // The filled position's ladder. Without this the position state can only show
  // `take_profit` — the primary leg — so a two-leg ladder that persisted
  // correctly would still look like a single target the moment it filled.
  const { data: positionExits } = useQuery({
    queryKey: ["paper", "exits", position?.id],
    queryFn: () => exitsFn({ data: { trade_id: position!.id } }) as unknown as Promise<ExitRow[]>,
    enabled: !!position?.id,
  });

  useEffect(() => {
    setEntry(livePrice != null ? String(livePrice) : "");
    setSl("");
    setLegs([newLeg()]);
    setTouched(false);
    setShowEntry(false);
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!entry && livePrice != null) setEntry(String(livePrice));
  }, [livePrice, entry]);

  /* ---------------- derived numbers ---------------- */
  const entryNum = Number(entry) || 0;
  const balance = Number(account?.balance ?? 0);
  const leverage = Number(account?.leverage ?? 100);

  // A risk-expressed stop needs a lot size to become a price. That lot is only
  // knowable without reference to the stop when quantity is in units — which is
  // exactly the case where the risk stop modes are offered, so there is no
  // cycle here. In the risk quantity modes `slMode` is forced back to "price".
  const unitsLot = qtyMode === "units" ? Number(qtyValue) || 0 : 0;

  const slNum = useMemo(() => {
    const v = num(sl);
    if (slMode === "price" || v == null) return v;
    return stopPriceForRisk({
      sym: symbolMeta, side, entry: entryNum, lot: unitsLot || null,
      balance, mode: slMode, value: v,
    });
  }, [sl, slMode, symbolMeta, side, entryNum, unitsLot, balance]);

  const sizing = useMemo(
    () => resolveQuantity({
      mode: qtyMode, sym: symbolMeta, entry: entryNum, sl: slNum,
      balance, value: Number(qtyValue),
    }),
    [qtyMode, symbolMeta, entryNum, slNum, balance, qtyValue],
  );
  const lotNum = sizing.lot ?? 0;

  // In reward modes the leg field holds a currency/percent amount, so the
  // actual price level has to be derived before anything can validate it.
  const legPrices = useMemo(
    () => legs.map((l) => {
      const v = num(l.price);
      if (v == null) return null;
      if (tpMode === "price") return v;
      return targetPriceForReward({
        sym: symbolMeta, side, entry: entryNum, lot: sizing.lot,
        balance, mode: tpMode, value: v,
      });
    }),
    [legs, tpMode, symbolMeta, side, entryNum, sizing.lot, balance],
  );

  const primaryTp = legPrices[0] ?? null;

  const calc = useMemo(() => {
    if (!symbolMeta || !touched) return null;
    if (validateStops(side, entryNum, slNum, primaryTp) !== null) return null;
    return tradeCalculation({
      sym: symbolMeta, side, entry: entryNum, sl: slNum, tp: primaryTp,
      lot: lotNum, leverage, balance,
    });
  }, [symbolMeta, side, entryNum, slNum, primaryTp, lotNum, leverage, balance, touched]);

  const allocated = useMemo(
    () => legs.reduce((s, l) => s + (Number(l.percent) || 0), 0),
    [legs],
  );

  const localErrors = useMemo(() => {
    if (!touched) return [];
    const errs: string[] = [];
    if (!Number.isFinite(entryNum) || entryNum <= 0) errs.push("Entry price must be a positive number");
    else if (entryNum > 1e12) errs.push("Entry price is out of range");

    if (sizing.error) errs.push(sizing.error);
    else if (symbolMeta && lotNum > 0) {
      if (lotNum < symbolMeta.minLot) errs.push(`Minimum lot size is ${symbolMeta.minLot}`);
      else if (lotNum > symbolMeta.maxLot) errs.push(`Maximum lot size is ${symbolMeta.maxLot}`);
    }

    if (sl !== "" && (slNum == null || slNum <= 0)) errs.push("Stop loss must be a positive number");

    legs.forEach((l, i) => {
      if (l.price.trim() === "") return;
      const px = legPrices[i];
      if (px == null || px <= 0) {
        errs.push(`TP${i + 1}: could not resolve a price from that value`);
        return;
      }
      const msg = validateStops(side, entryNum, null, px);
      if (msg) errs.push(`TP${i + 1}: ${msg.toLowerCase()}`);
      if (!(Number(l.percent) > 0)) errs.push(`TP${i + 1}: allocation must be greater than 0%`);
    });

    if (allocated > 100.0001) errs.push("Take-profit allocation exceeds 100% of the position");

    const stops = validateStops(side, entryNum, slNum, null);
    if (stops) errs.push(stops);

    return errs;
  }, [touched, entryNum, sizing.error, symbolMeta, lotNum, sl, slNum, legs, legPrices, side, allocated]);

  const preflight = useMemo(() => {
    if (localErrors.length) return null;
    if (!account || !symbolMeta || !entryNum || !lotNum) return null;
    return validateNewOrder(
      account as unknown as Parameters<typeof validateNewOrder>[0],
      (openTrades ?? []) as unknown as OpenTradeInput[],
      {
        symbol, direction: side, entry_price: entryNum, lot_size: lotNum,
        stop_loss: slNum, take_profit: primaryTp, risk_amount: calc?.riskAmount ?? null,
      },
      () => livePrice,
    );
  }, [localErrors, account, symbolMeta, openTrades, symbol, side, entryNum, lotNum, slNum, primaryTp, calc?.riskAmount, livePrice]);

  const errorList = useMemo(
    () => (localErrors.length ? localErrors : preflight?.errors ?? []),
    [localErrors, preflight],
  );
  const blocked = errorList.length > 0;
  const waitingForPrice = orderType === "market" && !(Number(livePrice ?? entryNum) > 0);

  const liqPrice = useMemo(
    () => (symbolMeta && entryNum && leverage > 1 ? liquidationPrice(entryNum, side, leverage) : null),
    [symbolMeta, entryNum, side, leverage],
  );

  const reset = useCallback(() => {
    setQtyValue(qtyMode === "units" ? "0.10" : qtyMode === "risk_percent" ? "1" : "100");
    setSl("");
    setLegs([newLeg()]);
    setNotes("");
    setSelectedTagIds([]);
    setEntry(livePrice != null ? String(livePrice) : "");
    setTouched(false);
  }, [qtyMode, livePrice]);

  /* ---------------- submit ---------------- */

  // A single in-flight latch. `OrderPanel` could fire `attemptPlace` twice from
  // one Ctrl+Enter — the input's own Enter handler and the window listener both
  // ran, because preventDefault does not stop propagation — and two synchronous
  // calls meant two `paper_trades` rows. There is exactly one submit path here,
  // and this latch closes the class rather than the instance.
  const inFlight = useRef(false);

  const openMut = useMutation({
    mutationFn: async () => {
      if (!accountId || !symbolMeta) throw new Error("Select an account first");
      if (errorList.length) throw new Error(errorList[0] ?? "Order rejected");
      if (!sizing.lot) throw new Error(sizing.error ?? "Enter a position size");

      const marketPx = Number(livePrice ?? entryNum);
      if (orderType === "market" && !(marketPx > 0)) {
        throw new Error("Waiting for live price — check your connection or try again");
      }
      if (orderType !== "market" && !(entryNum > 0)) throw new Error("Enter a trigger price");

      const base = {
        account_id: accountId, symbol, market: symbolMeta.market, direction: side,
        lot_size: sizing.lot, stop_loss: slNum, take_profit: primaryTp,
        commission: Number(account?.default_commission ?? 0),
        swap: Number(account?.default_swap ?? 0),
        notes: notes || null, tag_ids: selectedTagIds,
        risk_amount: calc?.riskAmount ?? sizing.actualRisk ?? null,
        reward_amount: calc?.rewardAmount ?? null,
        rr_planned: calc?.rr ?? null,
      };

      if (orderType !== "market") {
        return orderFn({ data: { ...base, order_type: orderType, trigger_price: entryNum } });
      }

      const created = await openFn({ data: { ...base, order_type: "market", entry_price: marketPx } });

      // Staged exits are a second write against the row we just created. They
      // are deliberately not folded into `openTrade` — that schema is what the
      // journal integration is built on and it stays exactly as it was.
      const ladder = legs
        .map((l, i) => ({ leg: l, price: legPrices[i], idx: i + 1 }))
        .filter((x): x is { leg: ExitLeg; price: number; idx: number } => x.price != null);
      if (ladder.length > 1) {
        const tradeId = (created as unknown as { id: string }).id;
        try {
          await setExitsFn({ data: {
            trade_id: tradeId,
            legs: ladder.map((x) => ({
              kind: "take_profit" as const, idx: x.idx, price: x.price,
              percent: Number(x.leg.percent) || 0, action: x.leg.action,
            })),
          } });
        } catch (e) {
          // The position is open and its primary target is already on the row.
          // Surface the ladder failure without pretending the trade failed.
          toast.warning(`Trade opened, but the exit ladder did not save: ${(e as Error).message}`);
        }
      }
      return created;
    },
    onSuccess: () => {
      toast.success(orderType === "market" ? "Trade opened" : "Order placed");
      reset();
      setArmed(null);
      setShowEntry(false);
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => { inFlight.current = false; },
  });

  const submit = useCallback(() => {
    if (inFlight.current || openMut.isPending) return;
    if (blocked || waitingForPrice || !accountId || !symbolMeta) return;
    if (preflight && preflight.ok && preflight.warnings.length > 0) {
      setRiskDialogOpen(true);
      return;
    }
    inFlight.current = true;
    openMut.mutate();
  }, [openMut, blocked, waitingForPrice, accountId, symbolMeta, preflight]);

  const submitRef = useRef(submit);
  submitRef.current = submit;

  const confirmRisky = () => {
    setRiskDialogOpen(false);
    if (inFlight.current || openMut.isPending) return;
    inFlight.current = true;
    openMut.mutate();
  };

  /* ---------------- close ---------------- */
  const closeMut = useMutation({
    mutationFn: async (trade: OpenTrade) => {
      const px = livePrice ?? Number(trade.entry_price);
      if (!(px > 0)) throw new Error("Waiting for live price");
      const res = await closeFn({ data: { id: trade.id, exit_price: px, close_reason: "manual" } });
      return { res, tradeId: trade.id };
    },
    onSuccess: ({ res, tradeId }) => {
      // The server's figure, not the client's estimate. Under negative-balance
      // protection `closeTrade` caps the realized loss, so a locally computed
      // P&L can disagree with what actually landed in `paper_trades.pnl` — and
      // this strip writes to the journal entry created from that very row.
      const realized = Number((res as unknown as { pnl?: number }).pnl ?? 0);
      toast.success("Position closed");
      setJustClosed({ id: tradeId, pnl: realized });
      qc.invalidateQueries({ queryKey: ["paper"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  /* ---------------- keyboard ---------------- */
  // One handler, one path. `b`/`s` stay out of fields; Ctrl+Enter is allowed
  // from inside a field but cannot double-fire because nothing else listens
  // for it and `submit` latches.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const inField = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || !!el?.isContentEditable;
      if (!inField && (e.key === "b" || e.key === "B")) setSide("long");
      if (!inField && (e.key === "s" || e.key === "S")) setSide("short");
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitRef.current();
      }
      if (e.key === "Escape" && armed) setArmed(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [armed]);

  /* ---------------- chart intents ---------------- */
  const [submitRequest, setSubmitRequest] = useState(0);
  useEffect(() => {
    const unsub = onTradeIntent((i) => {
      if (i.kind === "focus_side") { setSide(i.side); setArmed(i.side); return; }
      setShowEntry(true);
      setSide(i.side);
      setOrderType(i.orderType);
      setTouched(true);
      if (i.price != null) setEntry(String(i.price));
      // Chart intents always carry price levels, so the field has to be in
      // price mode to read one correctly — otherwise a dragged stop at 63156
      // would be interpreted as $63,156 of risk.
      if (i.sl != null) { setSlMode("price"); setSl(String(i.sl)); }
      if (i.tp != null) { setTpMode("price"); setLegs([newLeg(String(i.tp))]); }
      if (i.lot != null) { setQtyMode("units"); setQtyValue(String(i.lot)); }
      if (i.kind === "submit") setSubmitRequest((n) => n + 1);
    });
    return () => { unsub(); };
  }, []);

  // Fire from an effect keyed on the counter so React has committed the state
  // the intent just set before the ticket reads it.
  useEffect(() => {
    if (submitRequest === 0) return;
    submitRef.current();
  }, [submitRequest]);

  /* ---------------- live position numbers ---------------- */
  function livePnl(t: OpenTrade): number {
    if (!symbolMeta || livePrice == null) return 0;
    const gross = computePnl(symbolMeta, t.direction, Number(t.entry_price), livePrice, Number(t.lot_size));
    return gross - Number(t.commission ?? 0) - Number(t.swap ?? 0);
  }

  const filteredTags = (tags ?? []).filter((t) => t.name.toLowerCase().includes(tagQuery.toLowerCase()));
  const canCreateTag = tagQuery && !(tags ?? []).some(
    (t) => t.kind === PICKER_KIND && t.name.toLowerCase() === tagQuery.toLowerCase(),
  );

  const currency = account?.currency;

  /* ================= render ================= */
  return (
    <div className="flex flex-col gap-3">
      {armed ? (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px] font-semibold",
            armed === "long" ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger",
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            Armed · {armed === "long" ? "BUY" : "SELL"} —{" "}
            <kbd className="rounded bg-background/60 px-1 py-0.5 font-mono text-[10px]">⌘/Ctrl+↵</kbd> submit ·{" "}
            <kbd className="rounded bg-background/60 px-1 py-0.5 font-mono text-[10px]">Esc</kbd> cancel
          </span>
          <button type="button" onClick={() => setArmed(null)} aria-label="Clear armed side"
            className="rounded p-0.5 text-current/70 hover:text-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current/40">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      {justClosed ? (
        <PostCloseCapture
          tradeId={justClosed.id}
          pnl={justClosed.pnl}
          currency={currency}
          onDismiss={() => setJustClosed(null)}
        />
      ) : null}

      {mode === "position" && position ? (
        <PositionState
          trade={position}
          exits={positionExits ?? []}
          livePrice={livePrice}
          pnl={livePnl(position)}
          currency={currency}
          closing={closeMut.isPending}
          onClose={() => closeMut.mutate(position)}
          onNewOrder={() => setShowEntry(true)}
        />
      ) : (
        <>
          {position ? (
            <button
              type="button"
              onClick={() => setShowEntry(false)}
              className="self-start rounded-md border border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              ← Back to position
            </button>
          ) : null}

          {/* side */}
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/40 p-1">
            {(["long", "short"] as const).map((s) => (
              <button
                key={s} type="button" aria-pressed={side === s}
                onClick={() => { setSide(s); setTouched(true); }}
                className={cn(
                  "rounded-md py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2",
                  side === s
                    ? s === "long"
                      ? "bg-success/20 text-success shadow-sm focus-visible:ring-success/50"
                      : "bg-danger/20 text-danger shadow-sm focus-visible:ring-danger/50"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >{s === "long" ? "Buy" : "Sell"}</button>
            ))}
          </div>

          <Select value={orderType} onValueChange={(v) => { setOrderType(v as OrderType); setTouched(true); }}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="market">Market</SelectItem>
              <SelectItem value="limit">Limit</SelectItem>
              <SelectItem value="stop">Stop</SelectItem>
              <SelectItem value="stop_limit">Stop limit</SelectItem>
            </SelectContent>
          </Select>

          {/* entry */}
          <Field label={orderType === "market" ? "Entry price" : "Trigger price"} htmlFor="ticket-entry">
            <div className="flex gap-1">
              <Input
                id="ticket-entry" inputMode="decimal" value={entry} className="h-8 font-mono"
                onChange={(e) => { setEntry(e.target.value); setTouched(true); }}
              />
              {livePrice != null && (
                <Button type="button" size="sm" variant="outline" title="Use live price"
                  className="h-8 shrink-0 px-2 text-[10px] font-semibold uppercase"
                  onClick={() => { setEntry(String(livePrice)); setTouched(true); }}>Live</Button>
              )}
            </div>
          </Field>

          {/* quantity, mode-switched */}
          <div className="space-y-1">
            <ModeSwitch<QuantityMode>
              label="Quantity"
              value={qtyMode}
              options={["units", "risk_currency", "risk_percent"]}
              labels={QUANTITY_MODE_LABEL}
              onChange={(m) => {
                setQtyMode(m);
                setQtyValue(m === "units" ? "0.10" : m === "risk_percent" ? "1" : "100");
                // Leaving a risk-expressed stop selected here would leave the
                // ticket in the one combination that has no unique solution.
                if (m !== "units" && slMode !== "price") { setSlMode("price"); setSl(""); }
                setTouched(true);
              }}
            />
            <Input
              id="ticket-qty" inputMode="decimal" value={qtyValue} className="h-8 font-mono"
              aria-label={QUANTITY_MODE_LABEL[qtyMode]}
              onChange={(e) => { setQtyValue(e.target.value); setTouched(true); }}
            />
            {qtyMode !== "units" && (
              <div className="rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[10px]">
                {sizing.lot ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Position size</span>
                    <span className="font-mono tabular-nums">{sizing.lot} lots</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground">{sizing.error ?? "Enter a stop loss to size from risk"}</span>
                )}
                {sizing.actualRisk != null && (
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Actual risk</span>
                    <span className={cn("font-mono tabular-nums", sizing.clamped === "min" && "text-warning")}>
                      {formatCurrency(sizing.actualRisk, currency)}
                    </span>
                  </div>
                )}
                {/* The requested figure is not the risk taken once the lot is
                    stepped or floored, and at the minimum lot it can be many
                    times larger. Say so rather than showing the request. */}
                {sizing.clamped === "min" && (
                  <p className="mt-1 flex items-start gap-1 text-warning">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                    Minimum lot is {symbolMeta?.minLot} — this risks more than you asked for.
                  </p>
                )}
                {sizing.clamped === "step" && (
                  <p className="mt-1 text-muted-foreground">Rounded to the {symbolMeta?.lotStep} lot step.</p>
                )}
                {sizing.clamped === "max" && (
                  <p className="mt-1 flex items-start gap-1 text-warning">
                    <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                    Capped at the {symbolMeta?.maxLot} lot maximum — this risks less than you asked for.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* stop loss, mode-switched */}
          <div className="space-y-1">
            <ModeSwitch<StopMode>
              label="Stop loss"
              value={slMode}
              options={["price", "risk_currency", "risk_percent"]}
              labels={STOP_MODE_LABEL}
              // Sizing from risk derives the lot FROM the stop. Expressing the
              // stop as risk too has no unique solution, so the combination is
              // locked out rather than silently resolved.
              disabled={qtyMode !== "units" ? ["risk_currency", "risk_percent"] : []}
              disabledTitle="Unavailable while quantity is sized from risk — the stop is the input there"
              onChange={(m) => { setSlMode(m); setSl(""); setTouched(true); }}
            />
            <Input
              id="ticket-sl" inputMode="decimal" value={sl} placeholder="—"
              className="h-8 font-mono"
              aria-label={`Stop loss ${STOP_MODE_LABEL[slMode]}`}
              onChange={(e) => { setSl(e.target.value); setTouched(true); }}
            />
            {qtyMode !== "units" && (
              <p className="text-[10px] text-muted-foreground">Drives the position size.</p>
            )}
            {slMode !== "price" && (
              <p className="font-mono text-[10px] text-muted-foreground">
                {slNum != null
                  ? `→ ${slNum.toFixed(symbolMeta?.decimals ?? 2)}`
                  : "Enter a lot size and amount to resolve a stop price"}
              </p>
            )}
          </div>

          {/* take profit ladder */}
          <div className="space-y-1.5">
            <ModeSwitch<TargetMode>
              label="Take profit"
              value={tpMode}
              options={["price", "reward_currency", "reward_percent"]}
              labels={TARGET_MODE_LABEL}
              onChange={(m) => { setTpMode(m); setLegs((ls) => ls.map((l) => ({ ...l, price: "" }))); setTouched(true); }}
            />
            {legs.map((leg, i) => (
              <div key={leg.key} className="rounded-md border border-border/50 bg-background/30 p-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-8 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    TP{i + 1}
                  </span>
                  <Input
                    inputMode="decimal" value={leg.price} placeholder={tpMode === "price" ? "Price" : TARGET_MODE_LABEL[tpMode]}
                    aria-label={`Take profit ${i + 1} ${TARGET_MODE_LABEL[tpMode]}`}
                    className="h-7 flex-1 font-mono text-xs"
                    onChange={(e) => {
                      const v = e.target.value;
                      setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, price: v } : l)));
                      setTouched(true);
                    }}
                  />
                  {legs.length > 1 && (
                    <>
                      <Input
                        inputMode="decimal" value={leg.percent} aria-label={`Take profit ${i + 1} allocation percent`}
                        className="h-7 w-14 font-mono text-xs"
                        onChange={(e) => {
                          const v = e.target.value;
                          setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, percent: v } : l)));
                          setTouched(true);
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">%</span>
                    </>
                  )}
                  {legs.length > 1 && (
                    <button
                      type="button" aria-label={`Remove take profit ${i + 1}`}
                      onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-danger"
                    ><Trash2 className="h-3 w-3" /></button>
                  )}
                </div>
                {legs.length > 1 && tpMode !== "price" && legPrices[i] != null && (
                  <p className="mt-1 pl-9 font-mono text-[10px] text-muted-foreground">
                    → {legPrices[i]!.toFixed(symbolMeta?.decimals ?? 2)}
                  </p>
                )}
                {legs.length > 1 && i < legs.length - 1 && (
                  <div className="mt-1 pl-9">
                    <Select
                      value={leg.action}
                      onValueChange={(v) => setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, action: v as TpAction } : l)))}
                    >
                      <SelectTrigger className="h-6 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No action</SelectItem>
                        <SelectItem value="break_even">Then move stop to break-even</SelectItem>
                        <SelectItem value="trail">Then activate trailing stop</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            ))}

            <div className="flex items-center justify-between gap-2">
              <Button
                type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]"
                disabled={legs.length >= 5 || orderType !== "market"}
                title={orderType !== "market" ? "Staged exits attach once the order fills" : undefined}
                onClick={() => setLegs((ls) => {
                  // Re-split evenly so a new leg never silently over-allocates.
                  const n = ls.length + 1;
                  const even = Math.floor((100 / n) * 100) / 100;
                  const next = [...ls, newLeg()].map((l) => ({ ...l, percent: String(even) }));
                  const drift = Math.round((100 - even * n) * 100) / 100;
                  if (drift !== 0) next[0] = { ...next[0], percent: String(Math.round((even + drift) * 100) / 100) };
                  return next;
                })}
              ><Plus className="mr-1 h-3 w-3" /> Add exit level</Button>
              {legs.length > 1 && (
                <span className={cn("font-mono text-[10px] tabular-nums",
                  allocated > 100.0001 ? "text-danger" : "text-muted-foreground")}>
                  {allocated.toFixed(0)}% allocated
                </span>
              )}
            </div>
            {orderType !== "market" && legs.length === 1 && (
              <p className="text-[10px] text-muted-foreground">
                Staged exits are available on market orders — a pending order has no position to scale out of yet.
              </p>
            )}
          </div>

          {/* preview */}
          {calc && (
            <div className="rounded-xl border border-border/70 bg-background/40 p-3 text-xs">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Order preview
              </p>
              <div className="grid grid-cols-2 gap-y-1.5">
                <Row label="Risk" value={formatCurrency(calc.riskAmount, currency)} accent="rose" />
                <Row label="Reward" value={formatCurrency(calc.rewardAmount, currency)} accent="emerald" />
                <Row label="Risk %" value={`${calc.riskPct.toFixed(2)}%`} />
                <Row label="R:R" value={calc.rr ? `${calc.rr.toFixed(2)} : 1` : "—"} />
                <Row label="Order value" value={formatCurrency(calc.notional, currency)} />
                <Row label="Leverage" value={`${leverage}×`} />
                <Row label="Required margin" value={formatCurrency(calc.margin, currency)} />
                {preflight && (
                  <Row label="Free margin after" value={formatCurrency(preflight.free_margin_after, currency)}
                    accent={preflight.free_margin_after < 0 ? "rose" : undefined} />
                )}
                {liqPrice != null && (
                  <Row label="Est. liquidation" value={liqPrice.toFixed(symbolMeta?.decimals ?? 2)} accent="rose" />
                )}
              </div>
            </div>
          )}

          {errorList.length > 0 && (
            <div className="space-y-1">
              {errorList.map((msg, i) => (
                <p key={i} className="flex items-start gap-1.5 rounded-md bg-danger/10 px-2 py-1 text-[11px] text-danger">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {msg}
                </p>
              ))}
            </div>
          )}
          {!blocked && preflight && preflight.warnings.length > 0 && (
            <div className="space-y-1">
              {preflight.warnings.map((msg, i) => (
                <p key={i} className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-[11px] text-warning">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {msg}
                </p>
              ))}
            </div>
          )}

          {/* tags + notes */}
          <details open={!compact} className={cn(compact && "rounded-md border border-border/40 bg-background/30")}>
            <summary className={cn(
              "flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground",
              !compact && "hidden",
            )}>Tags &amp; notes</summary>
            <div className={cn("space-y-3", compact && "border-t border-border/40 p-2")}>
              <div>
                <Label className="text-xs">Tags</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedTagIds.map((id) => {
                    const t = tags?.find((x) => x.id === id);
                    if (!t) return null;
                    return (
                      <Badge key={id} variant="secondary" className="cursor-pointer"
                        onClick={() => setSelectedTagIds((s) => s.filter((x) => x !== id))}>{t.name} ×</Badge>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <Input value={tagQuery} onChange={(e) => setTagQuery(e.target.value)}
                    placeholder="Search or create tag" className="h-8" />
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
                      <button key={t.id} type="button"
                        onClick={() => { setSelectedTagIds((s) => (s.includes(t.id) ? s : [...s, t.id])); setTagQuery(""); }}
                        className="rounded-md border border-border/60 px-2 py-0.5 text-xs hover:bg-accent">+ {t.name}</button>
                    ))}
                  </div>
                )}
                {!tagQuery && !selectedTagIds.length && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {COMMON_TAGS.slice(0, 6).map((n) => (
                      <button key={n} type="button" onClick={async () => {
                        const existing = tags?.find((t) => t.kind === PICKER_KIND && t.name === n);
                        if (existing) return setSelectedTagIds((s) => (s.includes(existing.id) ? s : [...s, existing.id]));
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
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Trade notes / thesis" rows={2} />
            </div>
          </details>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={reset} className="transition-all active:scale-[0.98]">
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reset
            </Button>
            <Button
              onClick={submit}
              disabled={openMut.isPending || !accountId || !symbolMeta || blocked || waitingForPrice}
              // Must not collapse to bare "Buy"/"Sell": the side toggle above
              // already owns those names, and three controls sharing one
              // accessible name is indistinguishable to a screen reader.
              aria-label={
                waitingForPrice
                  ? "Waiting for live price"
                  : orderType === "market"
                    ? (side === "long" ? "Buy market order" : "Sell market order")
                    : `Place ${orderType.replace("_", " ")} order`
              }
              className={cn(
                "flex-1 shadow-elegant transition-all active:scale-[0.98] focus-visible:ring-2",
                side === "long"
                  ? "bg-success text-white hover:bg-success/90 focus-visible:ring-success/60"
                  : "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/60",
              )}
            >
              <Send className="mr-1.5 h-4 w-4" />
              {errorList.length > 0 ? errorList[0]
                : waitingForPrice ? "Waiting for price…"
                : orderType === "market" ? (side === "long" ? "Buy market" : "Sell market")
                : "Place order"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            <kbd>B</kbd> buy · <kbd>S</kbd> sell · <kbd>⌘/Ctrl</kbd>+<kbd>↵</kbd> place
          </p>
        </>
      )}

      <AlertDialog open={riskDialogOpen} onOpenChange={setRiskDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="h-5 w-5" /> High risk trade
            </AlertDialogTitle>
            <AlertDialogDescription>
              This order exceeds your configured risk limits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
            {calc && (
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span>Risk: <strong className="text-warning">{calc.riskPct.toFixed(2)}%</strong>
                  {account?.max_trade_risk_pct != null && (
                    <> (maximum: <strong>{Number(account.max_trade_risk_pct)}%</strong>)</>
                  )}
                </span>
              </li>
            )}
            {preflight?.warnings.map((msg, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                <span>{msg}</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRisky}
              className="bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger">
              Place trade anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ================= sub-components ================= */

function ModeSwitch<T extends string>({
  label, value, options, labels, onChange, disabled = [], disabledTitle,
}: {
  label: string; value: T; options: readonly T[];
  labels: Record<T, string>; onChange: (v: T) => void;
  disabled?: readonly T[]; disabledTitle?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div role="radiogroup" aria-label={`${label} input mode`} className="flex gap-0.5 rounded-md bg-muted/40 p-0.5">
        {options.map((o) => {
          const off = disabled.includes(o);
          return (
            <button
              key={o} type="button" role="radio" aria-checked={value === o}
              aria-disabled={off} disabled={off}
              title={off ? disabledTitle : undefined}
              onClick={() => { if (!off) onChange(o); }}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                off
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : value === o
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
              )}
            >{labels[o]}</button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The filled state. Same panel, different content: what the position is
 * actually doing rather than what an order would do.
 */
function PositionState({
  trade, exits, livePrice, pnl, currency, closing, onClose, onNewOrder,
}: {
  trade: OpenTrade; exits: ExitRow[]; livePrice: number | null; pnl: number;
  currency?: string; closing: boolean; onClose: () => void; onNewOrder: () => void;
}) {
  const entry = Number(trade.entry_price);
  const slv = trade.stop_loss == null ? null : Number(trade.stop_loss);
  const tpv = trade.take_profit == null ? null : Number(trade.take_profit);
  const risk = trade.risk_amount == null ? null : Number(trade.risk_amount);

  // Live R:R is the *remaining* trade: how far to the target against how far
  // to the stop from here, not from entry. That is the number that changes as
  // price moves, and the reason to look at this panel at all.
  const tpLegs = useMemo(
    () => exits.filter((e) => e.kind === "take_profit").sort((a, b) => a.idx - b.idx),
    [exits],
  );

  const rrNow = useMemo(() => {
    if (livePrice == null || slv == null || tpv == null) return null;
    const toTarget = Math.abs(tpv - livePrice);
    const toStop = Math.abs(livePrice - slv);
    if (toStop <= 0) return null;
    return toTarget / toStop;
  }, [livePrice, slv, tpv]);

  const up = pnl >= 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
            trade.direction === "long" ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
          )}>{trade.direction === "long" ? "Long" : "Short"}</span>
          <span className="font-mono text-sm">{trade.symbol}</span>
          <span className="font-mono text-xs text-muted-foreground">{Number(trade.lot_size)} lots</span>
        </div>
        <button type="button" onClick={onNewOrder}
          className="rounded-md border border-border/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-accent hover:text-foreground">
          New order
        </button>
      </div>

      <div className="rounded-xl border border-border/70 bg-background/40 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Unrealised P&amp;L
        </p>
        <p className={cn("mt-0.5 font-mono text-2xl tabular-nums", up ? "text-success" : "text-danger")}>
          {up ? "+" : ""}{formatCurrency(pnl, currency)}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-xs">
          <Row label="Entry" value={entry.toFixed(2)} />
          <Row label="Mark" value={livePrice != null ? livePrice.toFixed(2) : "—"} />
          <Row label="Stop" value={slv != null ? slv.toFixed(2) : "—"} accent={slv != null ? "rose" : undefined} />
          <Row label="Target" value={tpv != null ? tpv.toFixed(2) : "—"} accent={tpv != null ? "emerald" : undefined} />
          {/* Names the leg explicitly once a ladder exists. This is distance to
              the PRIMARY target from the current mark; the chart's chip is the
              whole ladder's reward against risk. Two different quantities that
              read as contradictory if both are just called "R:R". */}
          <Row
            label={tpLegs.length > 1 ? "R:R to TP1 from here" : "R:R from here"}
            value={rrNow != null ? `${rrNow.toFixed(2)} : 1` : "—"}
          />
          <Row label="R now" value={risk && risk > 0 ? `${(pnl / risk).toFixed(2)}R` : "—"}
            accent={risk && risk > 0 ? (pnl >= 0 ? "emerald" : "rose") : undefined} />
        </div>

        {/* Only worth its space when the ladder has more than the primary leg —
            a single TP is already the "Target" row above. */}
        {tpLegs.length > 1 && (
          <div className="mt-2 border-t border-border/50 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Exit ladder
            </p>
            <div className="mt-1 space-y-1">
              {tpLegs.map((leg) => {
                const px = Number(leg.price);
                const filled = leg.status === "filled";
                const reached = livePrice != null && !filled &&
                  (trade.direction === "long" ? livePrice >= px : livePrice <= px);
                return (
                  <div key={leg.id} className="flex items-center gap-2 text-xs">
                    <span className="w-8 shrink-0 font-semibold text-muted-foreground">TP{leg.idx}</span>
                    <span className="font-mono tabular-nums">{px.toFixed(2)}</span>
                    <span className="text-muted-foreground">{Number(leg.percent)}%</span>
                    {leg.action !== "none" && (
                      <span className="text-[10px] text-muted-foreground">
                        · {leg.action === "break_even" ? "→ break-even" : "→ trail"}
                      </span>
                    )}
                    <span className={cn(
                      "ml-auto text-[10px] font-semibold uppercase",
                      filled ? "text-success" : reached ? "text-warning" : "text-muted-foreground",
                    )}>
                      {filled ? "Filled" : reached ? "At level" : "Pending"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Button onClick={onClose} disabled={closing || livePrice == null}
        className="w-full bg-danger text-white shadow-elegant transition-all hover:bg-danger/90 active:scale-[0.98]">
        {closing ? "Closing…" : livePrice == null ? "Waiting for price…" : "Close position"}
      </Button>
    </div>
  );
}

function Field({
  label, htmlFor, hint, children,
}: {
  label: string; htmlFor?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "emerald" | "rose" }) {
  return (
    <>
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-mono tabular-nums",
        accent === "emerald" && "text-success", accent === "rose" && "text-danger")}>{value}</span>
    </>
  );
}
