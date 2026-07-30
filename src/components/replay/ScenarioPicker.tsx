import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Calendar, Dices, Globe, Moon, Sun, TrendingUp, Waves, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MARKETS, TIMEFRAMES } from "@/lib/replay/constants";
import type { ReplayMarket, Timeframe } from "@/lib/replay/types";
import { createReplaySession } from "@/lib/replay.functions";
import { SYMBOL_CATALOG } from "@/lib/paper-trading/symbols";

type Difficulty = "easy" | "medium" | "hard";
type ScenarioId =
  | "london_open"
  | "ny_open"
  | "asia"
  | "trending"
  | "ranging"
  | "high_vol"
  | "low_vol"
  | "random"
  | "manual";

type Scenario = {
  id: ScenarioId;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  tags: string[];
  // suggested defaults
  market?: ReplayMarket;
  symbol?: string;
  timeframe?: Timeframe;
};

const SCENARIOS: Scenario[] = [
  { id: "london_open", label: "London Open", desc: "07:00 UTC session ignition", icon: Sun, tags: ["session:london"], market: "forex", symbol: "EUR/USD", timeframe: "5m" },
  { id: "ny_open", label: "New York Open", desc: "13:30 UTC volatility burst", icon: Zap, tags: ["session:ny"], market: "forex", symbol: "GBP/USD", timeframe: "5m" },
  { id: "asia", label: "Asia Session", desc: "Slow Tokyo/Sydney tape", icon: Moon, tags: ["session:asia"], market: "forex", symbol: "USD/JPY", timeframe: "15m" },
  { id: "trending", label: "Trending Market", desc: "Clean directional day", icon: TrendingUp, tags: ["regime:trending"], market: "crypto", symbol: "BTC/USDT", timeframe: "15m" },
  { id: "ranging", label: "Ranging Market", desc: "Chop & mean reversion", icon: Waves, tags: ["regime:ranging"], market: "forex", symbol: "EUR/USD", timeframe: "15m" },
  { id: "high_vol", label: "High Volatility", desc: "News, spikes, wide ranges", icon: Zap, tags: ["vol:high"], market: "crypto", symbol: "BTC/USDT", timeframe: "5m" },
  { id: "low_vol", label: "Low Volatility", desc: "Compression & breakouts", icon: Waves, tags: ["vol:low"], market: "forex", symbol: "AUD/USD", timeframe: "1H" },
  { id: "random", label: "Random Scenario", desc: "Roll the dice", icon: Dices, tags: ["random"] },
  { id: "manual", label: "Manual Date", desc: "Pick your own setup", icon: Calendar, tags: [] },
];

function randomWeekday(): string {
  const now = Date.now();
  const spanDays = 365 * 2;
  let day = new Date(now - Math.floor(Math.random() * spanDays) * 86400_000);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day = new Date(day.getTime() - 86400_000);
  return day.toISOString().slice(0, 10);
}

export function ScenarioPicker({
  open,
  onOpenChange,
  mode = "free",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mode?: "free" | "day";
}) {
  const [scenario, setScenario] = useState<ScenarioId>("london_open");
  const [market, setMarket] = useState<ReplayMarket>("forex");
  const [symbol, setSymbol] = useState("EUR/USD");
  const [tf, setTf] = useState<Timeframe>("5m");
  const [date, setDate] = useState(randomWeekday());
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [hideFuture, setHideFuture] = useState(mode === "day");

  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: useServerFn(createReplaySession),
    onSuccess: (row: any) => {
      onOpenChange(false);
      navigate({ to: "/replay/session", search: { id: row.id } as any });
    },
  });

  const selected = SCENARIOS.find((s) => s.id === scenario)!;
  const symbols = useMemo(
    () => SYMBOL_CATALOG.filter((s) => s.market === market || (market === "futures" && s.market === "indices")),
    [market],
  );

  function applyScenario(s: Scenario) {
    setScenario(s.id);
    if (s.market) setMarket(s.market);
    if (s.symbol) setSymbol(s.symbol);
    if (s.timeframe) setTf(s.timeframe);
    if (s.id === "random") {
      const markets: ReplayMarket[] = ["forex", "crypto", "metals", "indices"];
      const m = markets[Math.floor(Math.random() * markets.length)];
      setMarket(m);
      const pool = SYMBOL_CATALOG.filter((x) => x.market === m);
      setSymbol(pool[Math.floor(Math.random() * pool.length)]?.symbol ?? "EUR/USD");
      const tfs: Timeframe[] = ["5m", "15m", "1H"];
      setTf(tfs[Math.floor(Math.random() * tfs.length)]);
      setDate(randomWeekday());
    }
  }

  function start() {
    const tags = [...selected.tags, `difficulty:${difficulty}`];
    create.mutate({
      data: {
        title: `${selected.label} · ${symbol}`,
        mode,
        market,
        symbol,
        timeframe: tf,
        replay_date: date,
        provider: "historical",
        tags,
      } as any,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Smart Scenario Picker</DialogTitle>
          <DialogDescription>Pick a preset or configure your own setup.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SCENARIOS.map((s) => {
            const Icon = s.icon;
            const active = scenario === s.id;
            return (
              <button
                key={s.id}
                onClick={() => applyScenario(s)}
                className={cn(
                  "flex items-start gap-2 rounded-[3px] border p-3 text-left transition",
                  active ? "border-primary bg-primary/10" : "border-border/60 hover:border-primary/50",
                )}
              >
                <Icon className={cn("h-4 w-4 mt-0.5", active ? "text-primary" : "text-muted-foreground")} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold">{s.label}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2">{s.desc}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Market</Label>
            <div className="flex flex-wrap gap-1">
              {MARKETS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMarket(m.id)}
                  className={cn(
                    "rounded-[3px] border px-2 py-1 text-[11px] transition",
                    market === m.id ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Symbol</Label>
            <select
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="h-8 w-full rounded-[3px] border border-border/60 bg-background px-2 text-xs"
            >
              {symbols.map((s) => (
                <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Timeframe</Label>
            <div className="flex flex-wrap gap-1">
              {TIMEFRAMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={cn(
                    "rounded-[3px] border px-2 py-1 text-[11px] transition",
                    tf === t ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Difficulty</Label>
            <div className="flex gap-1">
              {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    "flex-1 rounded-[3px] border px-2 py-1 text-[11px] capitalize transition",
                    difficulty === d ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-2">
              <input type="checkbox" checked={hideFuture} onChange={(e) => setHideFuture(e.target.checked)} />
              Hide future candles (Challenge)
            </Label>
            <div className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" /> {market} · {symbol} · {tf} · {date}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={start} disabled={create.isPending}>
            {create.isPending ? "Starting…" : "Start Replay"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
