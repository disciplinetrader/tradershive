/**
 * Trader Intelligence panels — pure presentational components that render
 * the deterministic output of buildIntelligence(). No LLM, no fabricated
 * numbers.
 */
import { motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Compass, Flame, Info, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Breakdown, TraderIntelligence, Weakness } from "@/lib/ai/intelligence";

function fmtMoney(n: number) {
  const sign = n >= 0 ? "" : "-";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function toneFor(n: number) {
  if (n > 0) return "text-success";
  if (n < 0) return "text-destructive";
  return "text-muted-foreground";
}

export function TodaysInsightCard({ intel }: { intel: TraderIntelligence }) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <Flame className="h-3.5 w-3.5 text-primary" /> Today&rsquo;s insight
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-base font-semibold leading-snug">{intel.todaysInsight}</p>
        {!intel.hasEnoughData && (
          <p className="mt-2 text-xs text-muted-foreground">
            Insights improve dramatically once you log 20+ closed trades.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function KpiStrip({ intel }: { intel: TraderIntelligence }) {
  const k = intel.kpis;
  const tiles = [
    { label: "Trades", value: String(k.n) },
    { label: "Win rate", value: `${k.winRate}%` },
    { label: "Net P&L", value: fmtMoney(k.netPnl), tone: toneFor(k.netPnl) },
    { label: "Profit factor", value: k.profitFactor === 999 ? "∞" : String(k.profitFactor) },
    { label: "Expectancy", value: fmtMoney(k.expectancy), tone: toneFor(k.expectancy) },
    { label: "Avg R", value: `${k.avgR}R`, tone: toneFor(k.avgR) },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border/60 bg-background/50 p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.label}</div>
          <div className={`text-lg font-black tabular-nums ${t.tone ?? ""}`}>{t.value}</div>
        </div>
      ))}
    </div>
  );
}

export function StrengthsCard({ intel }: { intel: TraderIntelligence }) {
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" /> Your strengths
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {intel.strengths.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No strengths surfaced yet — trade more and I&rsquo;ll celebrate what&rsquo;s working.
          </p>
        )}
        {intel.strengths.map((s) => (
          <div key={s} className="flex items-start gap-2 rounded-md border border-success/20 bg-success/5 p-2 text-sm">
            <TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
            <span>{s}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function impactColor(i: Weakness["impact"]) {
  return i === "critical"
    ? "border-destructive/40 bg-destructive/10"
    : i === "high"
    ? "border-warning/40 bg-warning/10"
    : "border-border/60 bg-background/40";
}

export function WeaknessesCard({ intel }: { intel: TraderIntelligence }) {
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-warning" /> Weaknesses to fix
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {intel.weaknesses.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing critical detected. Keep your process tight.</p>
        )}
        {intel.weaknesses.map((w, i) => (
          <motion.div
            key={w.title + i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`rounded-lg border p-3 ${impactColor(w.impact)}`}
          >
            <div className="flex items-center gap-2">
              <Badge variant={w.impact === "critical" || w.impact === "high" ? "destructive" : "secondary"}>
                {w.impact}
              </Badge>
              <span className="font-semibold text-sm">{w.title}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">Evidence:</span> {w.evidence}
            </p>
            <p className="mt-1 text-xs">
              <span className="font-medium text-primary">Fix:</span> {w.suggestion}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground italic">{w.expected}</p>
          </motion.div>
        ))}
      </CardContent>
    </Card>
  );
}

function BreakdownTable({ rows, moneyCol = true }: { rows: Breakdown[]; moneyCol?: boolean }) {
  if (!rows.length) return <p className="text-xs text-muted-foreground">Not enough data yet.</p>;
  return (
    <div className="overflow-hidden rounded-md border border-border/60">
      <table className="w-full text-xs">
        <thead className="bg-background/60 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left">Name</th>
            <th className="px-2 py-1.5 text-right">Trades</th>
            <th className="px-2 py-1.5 text-right">Win%</th>
            <th className="px-2 py-1.5 text-right">Exp.</th>
            <th className="px-2 py-1.5 text-right">PF</th>
            {moneyCol && <th className="px-2 py-1.5 text-right">Net</th>}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 8).map((r) => (
            <tr key={r.key} className="border-t border-border/50">
              <td className="px-2 py-1.5 font-medium">{r.label}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.trades}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.winRate}%</td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${toneFor(r.expectancy)}`}>{fmtMoney(r.expectancy)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{r.profitFactor === 999 ? "∞" : r.profitFactor}</td>
              {moneyCol && (
                <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${toneFor(r.netPnl)}`}>{fmtMoney(r.netPnl)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StrategyIntelligenceCard({ intel }: { intel: TraderIntelligence }) {
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Compass className="h-4 w-4 text-primary" /> Strategy intelligence
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BreakdownTable rows={intel.byStrategy} />
      </CardContent>
    </Card>
  );
}

export function InstrumentIntelligenceCard({ intel }: { intel: TraderIntelligence }) {
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" /> Instrument intelligence
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BreakdownTable rows={intel.byInstrument} />
      </CardContent>
    </Card>
  );
}

export function SessionWeekdayCard({ intel }: { intel: TraderIntelligence }) {
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Info className="h-4 w-4 text-primary" /> Sessions &amp; weekdays
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">By session</div>
          <BreakdownTable rows={intel.bySession} />
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">By weekday</div>
          <BreakdownTable rows={intel.byWeekday} />
        </div>
      </CardContent>
    </Card>
  );
}

export function BehaviorCard({ intel }: { intel: TraderIntelligence }) {
  const b = intel.behaviors;
  const items = [
    { label: "Moves stop loss", value: b.movedStopLossPct, warn: b.movedStopLossPct >= 25 },
    { label: "Cuts winners early", value: b.cutWinnersEarlyPct, warn: b.cutWinnersEarlyPct >= 40 },
    { label: "Holds losers past stop", value: b.heldLosersPct, warn: b.heldLosersPct >= 25 },
    { label: "FOMO signals", value: b.fomoRate, warn: b.fomoRate >= 20 },
    { label: "Revenge signals", value: b.revengeRate, warn: b.revengeRate >= 20 },
  ];
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingDown className="h-4 w-4 text-warning" /> Behavior analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((it) => (
          <div key={it.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium">{it.label}</span>
              <span className={`tabular-nums ${it.warn ? "text-warning" : "text-muted-foreground"}`}>{it.value}%</span>
            </div>
            <Progress value={Math.min(100, it.value)} className={it.warn ? "[&>div]:bg-warning" : ""} />
          </div>
        ))}
        <div className="pt-1 text-xs text-muted-foreground">
          Avg {b.avgTradesPerDay} trades/day · {b.overtradingDays} overtrading day{b.overtradingDays === 1 ? "" : "s"}
          {b.mostCommonMistake && (
            <>
              {" · "}top mistake <span className="text-foreground/80 font-medium">{b.mostCommonMistake.name}</span> ({b.mostCommonMistake.count}x)
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function RoadmapCard({ intel }: { intel: TraderIntelligence }) {
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Target className="h-4 w-4 text-primary" /> Improvement roadmap
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {intel.roadmap.length === 0 && (
          <p className="text-sm text-muted-foreground">No changes needed right now — stay consistent.</p>
        )}
        {intel.roadmap.map((r) => (
          <div key={r.priority} className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              {r.priority}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{r.title}</p>
              <p className="text-xs text-muted-foreground">{r.why}</p>
              <p className="mt-0.5 text-[11px] italic text-muted-foreground">{r.metric}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function WeeklySummaryCard({ intel }: { intel: TraderIntelligence }) {
  const w = intel.weekly;
  return (
    <Card className="bg-card/60 backdrop-blur-md">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ArrowUpRight className="h-4 w-4 text-primary" /> Weekly summary
        </CardTitle>
        <Badge variant="secondary" className="font-black tracking-wider">{w.grade}</Badge>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="font-medium">{w.headline}</p>
        {w.bestTrade && (
          <p className="text-xs text-muted-foreground">
            Best trade: <span className="text-success font-medium">{w.bestTrade.symbol}</span> {fmtMoney(Number(w.bestTrade.pnl ?? 0))}
          </p>
        )}
        {w.worstTrade && (
          <p className="text-xs text-muted-foreground">
            Worst trade: <span className="text-destructive font-medium">{w.worstTrade.symbol}</span> {fmtMoney(Number(w.worstTrade.pnl ?? 0))}
          </p>
        )}
        {w.mostCommonMistake && (
          <p className="text-xs text-muted-foreground">Most common mistake: {w.mostCommonMistake}</p>
        )}
      </CardContent>
    </Card>
  );
}
