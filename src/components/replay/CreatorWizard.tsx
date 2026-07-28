/**
 * Create Backtest — single-page form.
 *
 * Replaces the previous 5-step wizard. Everything fits on one screen:
 * name, starting balance, instrument (with autocomplete), from/to dates,
 * timeframe, and a "Surprise Me" affordance that randomizes symbol + date.
 * Submitting immediately creates the session and navigates to the
 * Trading Workspace — no additional setup screens.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Dices, Loader2, Play } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { InstrumentSearchInput } from "@/components/journal/InstrumentSearchInput";
import { findInstrument, type InstrumentRecord, type JournalMarket } from "@/lib/journal/instruments";
import type { Timeframe } from "@/lib/replay/types";
import { TIMEFRAMES } from "@/lib/replay/constants";
import { createReplaySession } from "@/lib/replay.functions";
import { twelveDataCandles } from "@/lib/market-data/twelvedata.functions";
import { cn } from "@/lib/utils";

const REPLAY_MARKETS = new Set<JournalMarket>(["forex", "crypto", "stocks", "indices", "futures", "metals"]);

function todayISO(): string { return new Date().toISOString().slice(0, 10); }
function daysAgoISO(n: number): string {
  const d = new Date(); d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function randomHistoricalDate(): string {
  const spanDays = 365 * 3;
  const back = Math.floor(Math.random() * spanDays) + 7;
  let d = new Date(Date.now() - back * 86_400_000);
  // Skip weekends for FX-style symbols.
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d = new Date(d.getTime() - 86_400_000);
  }
  return d.toISOString().slice(0, 10);
}

const SURPRISE_POOL: { symbol: string; market: JournalMarket }[] = [
  { symbol: "EUR/USD", market: "forex" },
  { symbol: "GBP/USD", market: "forex" },
  { symbol: "USD/JPY", market: "forex" },
  { symbol: "XAU/USD", market: "metals" },
  { symbol: "BTC/USDT", market: "crypto" },
  { symbol: "ETH/USDT", market: "crypto" },
  { symbol: "NAS100", market: "indices" },
  { symbol: "SPX500", market: "indices" },
];

type StartPosition = "beginning" | "random" | "before_end";

export function CreatorWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [title, setTitle] = useState("");
  const [balance, setBalance] = useState("10000");
  const [instrument, setInstrument] = useState<InstrumentRecord | null>(findInstrument("EUR/USD"));
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [tf, setTf] = useState<Timeframe>("5m");
  const [startPos, setStartPos] = useState<StartPosition>("beginning");
  const [preload, setPreload] = useState<{ progress: number; status: "idle" | "loading" | "cached" | "downloaded" | "error"; message?: string }>({ progress: 0, status: "idle" });
  const navigate = useNavigate();

  const createFn = useServerFn(createReplaySession);
  const create = useMutation({
    mutationFn: async (input: Parameters<typeof createFn>[0]) => createFn(input),
    onSuccess: (row: { id: string }) => {
      onOpenChange(false);
      navigate({ to: "/replay/session", search: { id: row.id } as never });
    },
  });

  const canSubmit = useMemo(() => {
    if (!instrument) return false;
    if (!from || !to) return false;
    if (new Date(from) > new Date(to)) return false;
    return !create.isPending;
  }, [instrument, from, to, create.isPending]);

  const surpriseDates = () => {
    const day = randomHistoricalDate();
    setFrom(day);
    setTo(day);
  };

  const surprise = () => {
    const pick = SURPRISE_POOL[Math.floor(Math.random() * SURPRISE_POOL.length)];
    const found = findInstrument(pick.symbol);
    if (found) setInstrument(found);
    surpriseDates();
  };

  const submit = async () => {
    if (!instrument || !canSubmit) return;
    const balanceNum = Math.max(100, Math.round(Number(balance) || 10000));
    const label = title.trim() || `${instrument.symbol} · ${from}`;
    const market = REPLAY_MARKETS.has(instrument.market as JournalMarket)
      ? instrument.market
      : "forex";

    // Preload candles (+buffer) so the replay opens instantly.
    setPreload({ progress: 0.1, status: "loading" });
    const fromMs = new Date(`${from}T00:00:00Z`).getTime();
    const toMs = new Date(`${to}T23:59:59Z`).getTime();
    try {
      const res = (await twelveDataCandles({
        data: { symbol: instrument.symbol, timeframe: tf, from: fromMs, to: toMs, buffer: true },
      })) as { candles?: unknown[]; cached?: boolean; error?: string };
      if (res?.error) {
        setPreload({ progress: 0, status: "error", message: res.error });
        // Non-fatal for crypto/synthetic — proceed anyway.
      } else {
        setPreload({ progress: 1, status: res?.cached ? "cached" : "downloaded" });
      }
    } catch (e) {
      setPreload({ progress: 0, status: "error", message: (e as Error).message });
    }

    create.mutate({
      data: {
        title: label,
        mode: from === to ? "day" : "range",
        market,
        symbol: instrument.symbol,
        timeframe: tf,
        replay_date: from === to ? from : undefined,
        range_start: from !== to ? new Date(`${from}T00:00:00Z`).toISOString() : undefined,
        range_end: from !== to ? new Date(`${to}T23:59:59Z`).toISOString() : undefined,
        provider: "synthetic",
        tags: startPos !== "beginning" ? [`start:${startPos}`] : [],
        initial_balance: balanceNum,
      } as never,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Create Backtest</span>
            <Button variant="ghost" size="sm" onClick={surprise} className="text-xs">
              <Dices className="mr-1.5 h-3.5 w-3.5" /> Surprise Me
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="bt-name">Strategy Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              id="bt-name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My London Breakout"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bt-balance">Starting Balance</Label>
            <Input
              id="bt-balance"
              type="number"
              min={100}
              step={100}
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Timeframe</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTf(t)}
                  className={cn(
                    "cursor-pointer rounded-lg border py-2 text-xs font-medium transition",
                    tf === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/40 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label>Instrument</Label>
            <InstrumentSearchInput
              value={instrument?.symbol ?? ""}
              onSelect={(inst) => setInstrument(inst)}
              placeholder="Search instrument (e.g. EU → EURUSD, Gold, BTC…)"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bt-from">Backtest From</Label>
            <Input id="bt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="bt-to">Backtest To</Label>
              <button type="button" onClick={surpriseDates} className="text-[10px] text-primary hover:underline">
                Surprise Me
              </button>
            </div>
            <Input id="bt-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="bt-start">Start Position</Label>
            <select
              id="bt-start"
              value={startPos}
              onChange={(e) => setStartPos(e.target.value as StartPosition)}
              className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            >
              <option value="beginning">Beginning of range</option>
              <option value="random">Random candle</option>
              <option value="before_end">Last portion of range</option>
            </select>
          </div>
        </div>

        {preload.status !== "idle" && (
          <div className="mt-2 space-y-1">
            <Progress value={Math.round(preload.progress * 100)} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground">
              {preload.status === "loading" && "Downloading candles…"}
              {preload.status === "cached" && "Loaded from cache — opening instantly."}
              {preload.status === "downloaded" && "Downloaded and cached for next time."}
              {preload.status === "error" && `Preload skipped: ${preload.message ?? "unavailable"}`}
            </p>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Launches instantly — chart, workspace and session appear together.
          </p>
          <Button onClick={submit} disabled={!canSubmit || preload.status === "loading"} className="min-w-[160px]">
            {create.isPending || preload.status === "loading" ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-4 w-4" />
            )}
            {preload.status === "loading" ? "Preloading…" : create.isPending ? "Launching…" : "Start Backtest"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
