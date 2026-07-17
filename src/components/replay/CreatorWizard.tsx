import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { MARKETS, TIMEFRAMES } from "@/lib/replay/constants";
import type { ReplayMarket, ReplayMode, Timeframe } from "@/lib/replay/types";
import { createReplaySession } from "@/lib/replay.functions";
import { SYMBOL_CATALOG } from "@/lib/paper-trading/symbols";

const MODES: { id: ReplayMode; label: string; desc: string }[] = [
  { id: "trade", label: "Trade Replay", desc: "Replay a specific trade around its execution window." },
  { id: "session", label: "Session Replay", desc: "Replay an entire trading session." },
  { id: "free", label: "Free Replay", desc: "Practice freely on historical data." },
];

export function CreatorWizard({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [step, setStep] = useState(1);
  const [market, setMarket] = useState<ReplayMarket>("forex");
  const [symbol, setSymbol] = useState("EUR/USD");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tf, setTf] = useState<Timeframe>("5m");
  const [mode, setMode] = useState<ReplayMode>("free");
  const [title, setTitle] = useState("");
  const navigate = useNavigate();

  const create = useMutation({
    mutationFn: useServerFn(createReplaySession),
    onSuccess: (row: any) => {
      onOpenChange(false);
      setStep(1);
      navigate({ to: "/replay/session", search: { id: row.id } as any });
    },
  });

  const symbols = SYMBOL_CATALOG.filter((s) => s.market === market || (market === "futures" && s.market === "indices"));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Replay — Step {step} / 5</DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="grid grid-cols-3 gap-2">
            {MARKETS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMarket(m.id)}
                className={cn(
                  "rounded-xl border p-3 text-sm transition",
                  market === m.id ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="max-h-72 overflow-y-auto grid grid-cols-2 gap-2">
            {symbols.map((s) => (
              <button
                key={s.symbol}
                onClick={() => setSymbol(s.symbol)}
                className={cn(
                  "rounded-lg border p-2 text-left text-xs transition",
                  symbol === s.symbol ? "border-primary bg-primary/10" : "border-border/40 hover:border-primary/50",
                )}
              >
                <div className="font-medium">{s.symbol}</div>
                <div className="text-muted-foreground truncate">{s.name}</div>
              </button>
            ))}
            {!symbols.length ? <div className="col-span-2 text-sm text-muted-foreground">No symbols for this market yet.</div> : null}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <Label>Replay Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <Label>Title (optional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${symbol} · ${date}`} />
          </div>
        )}

        {step === 4 && (
          <div className="grid grid-cols-4 gap-2">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                onClick={() => setTf(t)}
                className={cn(
                  "rounded-lg border py-2 text-xs font-medium transition",
                  tf === t ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-2">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  mode === m.id ? "border-primary bg-primary/10" : "border-border/40 hover:border-primary/50",
                )}
              >
                <div className="font-medium text-sm">{m.label}</div>
                <div className="text-xs text-muted-foreground">{m.desc}</div>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-between pt-3">
          <Button variant="ghost" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>Back</Button>
          {step < 5 ? (
            <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
          ) : (
            <Button
              disabled={create.isPending}
              onClick={() =>
                create.mutate({
                  data: {
                    title: title || `${symbol} · ${date}`,
                    mode, market, symbol,
                    timeframe: tf, replay_date: date,
                    provider: "synthetic", tags: [],
                  },
                })
              }
            >
              {create.isPending ? "Creating…" : "Start Replay"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
