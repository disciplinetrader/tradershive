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
import { ensureHistoricalRange } from "@/lib/market-data/historical.functions";
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

type PresetRange = { id: "1h" | "4h" | "1d" | "3d" | "1w" | "custom"; label: string; days: number };
const SESSION_PRESETS: PresetRange[] = [
  { id: "1h", label: "1 Hour", days: 0 },
  { id: "4h", label: "4 Hours", days: 0 },
  { id: "1d", label: "1 Day", days: 0 },
  { id: "3d", label: "3 Days", days: 3 },
  { id: "1w", label: "1 Week", days: 7 },
  { id: "custom", label: "Custom", days: -1 },
];

type StartPosition = "beginning" | "random" | "before_end";

const PREFS_KEY = "replay.creator.prefs.v1";
const RECENTS_KEY = "replay.creator.recents.v1";
type Prefs = { symbol?: string; timeframe?: Timeframe; balance?: string; startPos?: StartPosition };
type RecentEntry = { symbol: string; market: JournalMarket; timeframe: Timeframe };

function readPrefs(): Prefs {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Prefs; } catch { return {}; }
}
function readRecents(): RecentEntry[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]") as RecentEntry[]; } catch { return []; }
}

export function CreatorWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const initial = useMemo(() => readPrefs(), []);
  const [title, setTitle] = useState("");
  const [balance, setBalance] = useState(initial.balance ?? "10000");
  const [instrument, setInstrument] = useState<InstrumentRecord | null>(
    findInstrument(initial.symbol ?? "EUR/USD") ?? findInstrument("EUR/USD"),
  );
  const [from, setFrom] = useState(daysAgoISO(30));
  const [to, setTo] = useState(todayISO());
  const [tf, setTf] = useState<Timeframe>(initial.timeframe ?? "5m");
  const [startPos, setStartPos] = useState<StartPosition>(initial.startPos ?? "beginning");
  const [recents, setRecents] = useState<RecentEntry[]>(() => readRecents());
  const [preload, setPreload] = useState<{ progress: number; status: "idle" | "loading" | "cached" | "downloaded" | "error"; message?: string }>({ progress: 0, status: "idle" });
  const navigate = useNavigate();

  // Refresh recents whenever the dialog opens so newly-created sessions surface.
  useEffect(() => { if (open) setRecents(readRecents()); }, [open]);

  const createFn = useServerFn(createReplaySession);
  const create = useMutation({
    mutationFn: async (input: Parameters<typeof createFn>[0]) => createFn(input),
    onSuccess: (row: { id: string }) => {
      onOpenChange(false);
      navigate({ to: "/replay/studio", search: { id: row.id } as never });
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

    // Verify (and, if needed, import) REAL market history for this range.
    // We never create a session that would have to fall back to fake data.
    setPreload({ progress: 0.1, status: "loading" });
    const fromMs = new Date(`${from}T00:00:00Z`).getTime();
    const toMs = new Date(`${to}T23:59:59Z`).getTime();
    let sourceCode = "historical";
    try {
      const res = await ensureHistoricalRange({
        data: { symbol: instrument.symbol, timeframe: tf as never, from: fromMs, to: toMs, market },
      });
      if (!res.ok) {
        setPreload({
          progress: 0,
          status: "error",
          message: `${res.unavailable?.message ?? "No market data for this range."} ${res.unavailable?.remedy ?? ""}`.trim(),
        });
        return; // Block creation — a session without data is not usable.
      }
      sourceCode = res.source?.providerCode ?? "historical";
      setPreload({ progress: 1, status: res.source?.kind === "stored" ? "cached" : "downloaded" });
    } catch (e) {
      setPreload({ progress: 0, status: "error", message: (e as Error).message });
      return;
    }

    // Persist prefs + push to recents so the next backtest inherits selection.
    try {
      localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({ symbol: instrument.symbol, timeframe: tf, balance, startPos } satisfies Prefs),
      );
      const entry: RecentEntry = { symbol: instrument.symbol, market: market as JournalMarket, timeframe: tf };
      const next = [entry, ...recents.filter((r) => r.symbol !== entry.symbol)].slice(0, 5);
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch { /* ignore quota errors */ }

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
        // Record the REAL provider that supplied the candles.
        provider: sourceCode,
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
            {recents.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent</span>
                {recents.map((r) => (
                  <button
                    key={r.symbol}
                    type="button"
                    onClick={() => {
                      const inst = findInstrument(r.symbol);
                      if (inst) setInstrument(inst);
                      setTf(r.timeframe);
                    }}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] transition",
                      instrument?.symbol === r.symbol
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {r.symbol} · {r.timeframe}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Session Length</Label>
              <button type="button" onClick={surpriseDates} className="text-[10px] text-primary hover:underline">
                Surprise dates
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SESSION_PRESETS.map((p) => {
                const apply = () => {
                  if (p.id === "custom") {
                    setCustomRange(true);
                    // Reveal + focus the date inputs so the range can be edited.
                    requestAnimationFrame(() => {
                      const el = document.getElementById("bt-from") as HTMLInputElement | null;
                      el?.focus();
                      el?.scrollIntoView({ block: "nearest" });
                    });
                    return;
                  }
                  setCustomRange(false);
                  const end = new Date();
                  if (p.days > 0) {
                    const start = new Date(end.getTime() - p.days * 86_400_000);
                    setFrom(start.toISOString().slice(0, 10));
                    setTo(end.toISOString().slice(0, 10));
                  } else {
                    // Intraday windows collapse to a single day; the engine
                    // resolves to 24h of candles around that date.
                    const day = end.toISOString().slice(0, 10);
                    setFrom(day);
                    setTo(day);
                  }
                };
                const spanDays = Math.max(
                  1,
                  Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1,
                );
                const active =
                  p.id === "custom"
                    ? customRange
                    : !customRange &&
                      ((p.id === "1d" && from === to) || (p.days > 0 && spanDays - 1 === p.days));
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={apply}
                    className={cn(
                      "cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {customRange && (
              <p className="text-[11px] text-muted-foreground">
                Pick any From / To dates below to define your own session length.
              </p>
            )}

          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bt-from">From</Label>
            <Input id="bt-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bt-to">To</Label>
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
              <option value="beginning">
                {from === to ? "Start of the selected day (first candle)" : "Beginning of range (first candle)"}
              </option>
              <option value="random">Random candle</option>
              <option value="before_end">Last portion of range</option>
            </select>
            <p className="text-[11px] text-muted-foreground">
              {startPos === "beginning"
                ? `Replay opens on the very first candle of ${from === to ? from : from + " → " + to}.`
                : startPos === "random"
                  ? "Replay drops you at an unseen candle inside the range."
                  : "Replay starts near the end of the range."}
            </p>
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
