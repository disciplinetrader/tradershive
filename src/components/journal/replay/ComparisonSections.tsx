/**
 * JOURNAL X — PHASE 4 · comparison sections.
 *
 * Presentation only: every number arrives pre-computed from
 * `lib/journal/replay-compare`. Missing inputs render as "not measurable"
 * rather than a zero.
 */
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Award, Check, HelpCircle, Info, Minus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MissingData } from "@/components/journal/story/primitives";
import { formatDate, formatDuration, formatNumber } from "@/lib/journal/format";
import {
  fmtDelta,
  PRACTICE_MODES,
  READINESS_LABEL,
  VERDICT_LABEL,
  type AdherenceRow,
  type AttemptReflection,
  type DeltaRow,
  type EvaluationBlock,
  type MistakeComparisonRow,
  type NextAction,
  type OutcomeRow,
  type ProcessOutcome,
  type PsychRow,
  type Readiness,
  type Side,
} from "@/lib/journal/replay-compare";
import { cn } from "@/lib/utils";

const num = (v: number | null | undefined, d = 2) => (v == null ? "—" : formatNumber(v, d));

function deltaTone(v: number | null | undefined) {
  if (v == null) return "text-muted-foreground";
  return v > 0 ? "text-emerald-400" : v < 0 ? "text-rose-400" : "text-muted-foreground";
}

/* ------------------------------------------------------------------ */

export function ComparisonHeader({
  entryId,
  symbol,
  attemptNumber,
  totalAttempts,
  mode,
  completedAt,
  po,
  readiness,
  isBest,
  onMarkBest,
}: {
  entryId: string;
  symbol: string;
  attemptNumber: number;
  totalAttempts: number;
  mode: string;
  completedAt: string | null;
  po: ProcessOutcome;
  readiness: { verdict: Readiness; why: string };
  isBest: boolean;
  onMarkBest: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[4px] border border-border/60 bg-card/30 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium tabular-nums">{symbol}</span>
          <Badge variant="outline" className="h-4 rounded-[2px] px-1 text-[10px]">
            Attempt {attemptNumber} of {totalAttempts}
          </Badge>
          <Badge variant="outline" className="h-4 rounded-[2px] px-1 text-[10px] capitalize">
            {PRACTICE_MODES.find((m) => m.value === mode)?.label ?? mode.replace(/_/g, " ")}
          </Badge>
          {isBest && (
            <Badge variant="outline" className="h-4 gap-1 rounded-[2px] border-amber-500/40 px-1 text-[10px] text-amber-400">
              <Award className="h-3 w-3" /> Best
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {completedAt ? `Completed ${formatDate(completedAt)}` : "Not completed"} ·{" "}
          <Link to="/journal/$entryId" params={{ entryId }} className="underline underline-offset-2 hover:text-foreground">
            Back to the original trade
          </Link>
        </div>
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-end gap-4">
        <HeadStat label="Process" value={po.processDelta} original={po.processOriginal} replay={po.processReplay} />
        <HeadStat label="Outcome" value={po.outcomeDelta} original={null} replay={null} digits={2} />
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Readiness</div>
          <div className="text-xs font-medium">{READINESS_LABEL[readiness.verdict]}</div>
        </div>
        {!isBest && (
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onMarkBest}>
            <Award className="mr-1 h-3.5 w-3.5" /> Mark best
          </Button>
        )}
      </div>
    </div>
  );
}

function HeadStat({
  label,
  value,
  original,
  replay,
  digits = 0,
}: {
  label: string;
  value: number | null;
  original: number | null;
  replay: number | null;
  digits?: number;
}) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label} Δ</div>
      <div className={cn("text-sm font-medium tabular-nums", deltaTone(value))}>{fmtDelta(value, digits)}</div>
      {original != null && replay != null && (
        <div className="text-[10px] tabular-nums text-muted-foreground">
          {original} → {replay}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ImprovementDeltaTable({ rows }: { rows: DeltaRow[] }) {
  const measurable = rows.filter((r) => r.delta != null);
  return (
    <div className="space-y-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="py-1.5 pr-2 text-left font-normal">Dimension</th>
            <th className="py-1.5 pr-2 text-right font-normal">Original</th>
            <th className="py-1.5 pr-2 text-right font-normal">Replay</th>
            <th className="py-1.5 pr-2 text-right font-normal">Delta</th>
            <th className="py-1.5 text-left font-normal">How it is scored</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/30 last:border-0 align-top">
              <td className="py-1.5 pr-2">{r.label}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{r.original ?? "—"}</td>
              <td className="py-1.5 pr-2 text-right tabular-nums text-muted-foreground">{r.replay ?? "—"}</td>
              <td className={cn("py-1.5 pr-2 text-right tabular-nums", deltaTone(r.delta))}>
                {r.delta == null ? "Not measurable" : r.delta === 0 ? "No change" : fmtDelta(r.delta)}
              </td>
              <td className="py-1.5 text-[10px] leading-snug text-muted-foreground">{r.how}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground">
        Process score is the mean of the {measurable.length} measurable dimension{measurable.length === 1 ? "" : "s"} above. Dimensions
        without data are excluded rather than scored as zero.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ProcessVsOutcomeCard({ po, outcome }: { po: ProcessOutcome; outcome: OutcomeRow[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded-[3px] border border-border/50 bg-muted/10 p-2.5">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Process improvement</div>
        <div className={cn("text-sm font-medium", po.tone === "up" ? "text-emerald-400" : po.tone === "down" ? "text-rose-400" : "")}>
          {po.processDelta == null ? "Not measurable" : `${po.processOriginal} → ${po.processReplay} (${fmtDelta(po.processDelta)})`}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{po.headline}</p>
      </div>
      <div className="rounded-[3px] border border-border/50 bg-muted/10 p-2.5">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Outcome change</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {outcome.map((o) => (
            <div key={o.key} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{o.label}</span>
              <span className="tabular-nums">
                {num(o.original)} → {num(o.replay)}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">A better financial result is never treated as improvement on its own.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ExecutionComparison({ a, b }: { a: Side; b: Side }) {
  const rows: { label: string; a: string; b: string }[] = [
    { label: "Direction", a: a.direction ?? "—", b: b.direction ?? "—" },
    { label: "Entry time", a: a.openedAt ? new Date(a.openedAt).toUTCString().slice(17, 22) : "—", b: b.openedAt ? new Date(b.openedAt).toUTCString().slice(17, 22) : "—" },
    { label: "Entry price", a: num(a.entryPrice, 5), b: num(b.entryPrice, 5) },
    { label: "Stop", a: num(a.stop, 5), b: num(b.stop, 5) },
    { label: "Target", a: num(a.target, 5), b: num(b.target, 5) },
    { label: "Initial R:R", a: num(a.plannedRR), b: num(b.plannedRR) },
    { label: "Actual R", a: num(a.realizedR), b: num(b.realizedR) },
    { label: "Position size", a: num(a.lotSize), b: num(b.lotSize) },
    { label: "Risk %", a: a.riskPct == null ? "—" : `${num(a.riskPct)}%`, b: b.riskPct == null ? "—" : `${num(b.riskPct)}%` },
    { label: "Entry efficiency", a: a.entryEfficiency == null ? "—" : `${Math.round(a.entryEfficiency)}%`, b: b.entryEfficiency == null ? "—" : `${Math.round(b.entryEfficiency)}%` },
    { label: "Exit efficiency", a: a.exitEfficiency == null ? "—" : `${Math.round(a.exitEfficiency)}%`, b: b.exitEfficiency == null ? "—" : `${Math.round(b.exitEfficiency)}%` },
    { label: "MFE", a: num(a.mfe, 5), b: num(b.mfe, 5) },
    { label: "MAE", a: num(a.mae, 5), b: num(b.mae, 5) },
    { label: "Hold time", a: formatDuration(a.holdSeconds), b: formatDuration(b.holdSeconds) },
    { label: "Management events", a: a.stopChanges == null ? "—" : `${a.stopChanges} stop change(s)`, b: b.stopChanges == null ? "—" : `${b.stopChanges} stop change(s), ${b.partials ?? 0} partial(s)` },
  ];
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border/50 text-[10px] uppercase tracking-wide text-muted-foreground">
          <th className="py-1.5 pr-2 text-left font-normal">Metric</th>
          <th className="py-1.5 pr-2 text-right font-normal">Original</th>
          <th className="py-1.5 text-right font-normal">Replay</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b border-border/30 last:border-0">
            <td className="py-1 pr-2 text-muted-foreground">{r.label}</td>
            <td className="py-1 pr-2 text-right tabular-nums">{r.a}</td>
            <td className="py-1 text-right tabular-nums">{r.b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ------------------------------------------------------------------ */

const ADHERENCE_TONE = {
  followed: "border-emerald-500/40 text-emerald-400",
  minor: "border-amber-500/40 text-amber-400",
  major: "border-rose-500/40 text-rose-400",
  missing: "border-border/60 text-muted-foreground",
} as const;

export function PlanAdherenceComparison({
  originalRows,
  replayRows,
}: {
  originalRows: AdherenceRow[];
  replayRows: AdherenceRow[];
}) {
  const byArea = new Map<string, { o?: AdherenceRow; r?: AdherenceRow }>();
  for (const row of originalRows) byArea.set(row.area, { ...(byArea.get(row.area) ?? {}), o: row });
  for (const row of replayRows) byArea.set(row.area, { ...(byArea.get(row.area) ?? {}), r: row });

  return (
    <div className="space-y-2">
      {[...byArea.entries()].map(([area, { o, r }]) => {
        const state =
          !o || !r
            ? "Not measurable"
            : o.verdict === r.verdict
            ? r.verdict === "followed"
              ? "Held"
              : "Repeated"
            : r.verdict === "followed"
            ? "Corrected"
            : o.verdict === "followed"
            ? "New deviation"
            : "Changed";
        return (
          <div key={area} className="rounded-[3px] border border-border/50 p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{area}</span>
              <Badge
                variant="outline"
                className={cn(
                  "h-4 rounded-[2px] px-1 text-[10px]",
                  state === "Corrected" || state === "Held" ? "border-emerald-500/40 text-emerald-400" : state === "Repeated" || state === "New deviation" ? "border-rose-500/40 text-rose-400" : "border-border/60 text-muted-foreground",
                )}
              >
                {state}
              </Badge>
            </div>
            <div className="grid gap-2 text-[11px] sm:grid-cols-2">
              <PlanCell title="Original" row={o} />
              <PlanCell title="Replay" row={r} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlanCell({ title, row }: { title: string; row?: AdherenceRow }) {
  if (!row) return <div className="text-muted-foreground">{title}: not recorded</div>;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{title}</span>
        <Badge variant="outline" className={cn("h-3.5 rounded-[2px] px-1 text-[9px] capitalize", ADHERENCE_TONE[row.verdict])}>
          {row.verdict}
        </Badge>
      </div>
      <div className="text-muted-foreground">
        Plan: <span className="text-foreground">{row.planned}</span>
      </div>
      <div className="text-muted-foreground">
        Actual: <span className="text-foreground">{row.actual}</span>
      </div>
      <div className="text-[10px] text-muted-foreground">{row.why}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const MISTAKE_ICON = {
  corrected: Check,
  partial: Minus,
  repeated: X,
  not_tested: HelpCircle,
  insufficient: Info,
} as const;

const MISTAKE_TONE = {
  corrected: "text-emerald-400",
  partial: "text-amber-400",
  repeated: "text-rose-400",
  not_tested: "text-muted-foreground",
  insufficient: "text-muted-foreground",
} as const;

export function MistakeComparison({ rows, introduced }: { rows: MistakeComparisonRow[]; introduced: MistakeComparisonRow[] }) {
  if (!rows.length && !introduced.length) {
    return <MissingData label="No mistakes were recorded on the original trade, so there is nothing to verify against this attempt." />;
  }
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const Icon = MISTAKE_ICON[r.verdict];
        return (
          <div key={r.value} className="flex items-start gap-2 rounded-[3px] border border-border/50 p-2">
            <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", MISTAKE_TONE[r.verdict])} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs">{r.label}</span>
                <span className={cn("text-[10px] uppercase tracking-wide", MISTAKE_TONE[r.verdict])}>{VERDICT_LABEL[r.verdict]}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">Evidence: {r.evidence}</div>
            </div>
          </div>
        );
      })}
      {introduced.map((r) => (
        <div key={`new-${r.value}`} className="flex items-start gap-2 rounded-[3px] border border-rose-500/30 bg-rose-500/5 p-2">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
          <div>
            <div className="text-xs">
              {r.label} <span className="text-[10px] uppercase tracking-wide text-rose-400">New in replay</span>
            </div>
            <div className="text-[10px] text-muted-foreground">Evidence: {r.evidence}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PsychologyComparison({ rows }: { rows: PsychRow[] }) {
  if (!rows.length) return <MissingData label="No psychology data was recorded on either side." />;
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-border/30 py-1 text-xs last:border-0">
          <span className="text-muted-foreground">{r.label}</span>
          <span className="tabular-nums">
            {r.original} <ArrowRight className="inline h-3 w-3 text-muted-foreground" /> {r.replay}
          </span>
          <span className="text-[10px] text-muted-foreground">{r.note}</span>
        </div>
      ))}
      <p className="pt-1 text-[10px] text-muted-foreground">
        These are self-reported associations observed between the two attempts, not proven causes of the result.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function EvaluationPanel({
  blocks,
  missing,
  onFeedback,
}: {
  blocks: EvaluationBlock[];
  missing: string[];
  onFeedback: (v: "helpful" | "incorrect") => void;
}) {
  const [sent, setSent] = useState<"helpful" | "incorrect" | null>(null);
  return (
    <div className="space-y-2">
      {missing.length > 0 && (
        <div className="rounded-[3px] border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-300/90">
          Missing data for this evaluation: {missing.join(", ")}. Those areas are reported as not measurable.
        </div>
      )}
      {blocks.map((b) => (
        <div key={b.title} className="rounded-[3px] border border-border/50 p-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{b.title}</div>
          <p className="mt-0.5 text-xs">{b.body}</p>
          {b.evidence.filter(Boolean).length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {b.evidence.filter(Boolean).map((e, i) => (
                <li key={i} className="text-[10px] text-muted-foreground">
                  · {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[10px] text-muted-foreground">Was this evaluation useful?</span>
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-6 px-2 text-[11px]", sent === "helpful" && "text-emerald-400")}
          onClick={() => {
            setSent("helpful");
            onFeedback("helpful");
          }}
        >
          Yes
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-6 px-2 text-[11px]", sent === "incorrect" && "text-rose-400")}
          onClick={() => {
            setSent("incorrect");
            onFeedback("incorrect");
          }}
        >
          Something is wrong
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function NextActionCard({
  action,
  readiness,
  onStart,
  onHomework,
  onDismiss,
  dismissed,
}: {
  action: NextAction;
  readiness: { verdict: Readiness; why: string };
  onStart: () => void;
  onHomework: () => void;
  onDismiss: () => void;
  dismissed: boolean;
}) {
  if (dismissed) return <MissingData label="Next action dismissed for this attempt." />;
  return (
    <div className="rounded-[3px] border border-border/50 bg-muted/10 p-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium">{action.title}</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{action.detail}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Readiness: {READINESS_LABEL[readiness.verdict]} — {readiness.why}
          </p>
        </div>
        <div className="flex gap-1.5">
          <Button size="sm" className="h-7 px-2 text-xs" onClick={onStart}>
            Start now
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={onHomework}>
            Add to homework
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ReflectionCard({
  value,
  onChange,
  saving,
}: {
  value: AttemptReflection;
  onChange: (patch: AttemptReflection) => void;
  saving: boolean;
}) {
  const set = <K extends keyof AttemptReflection>(k: K, v: AttemptReflection[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Cell label="What felt different?">
        <Textarea className="min-h-[52px] text-xs" value={value.felt_different ?? ""} onChange={(e) => set("felt_different", e.target.value)} />
      </Cell>
      <Cell label="What was done better?">
        <Textarea className="min-h-[52px] text-xs" value={value.done_better ?? ""} onChange={(e) => set("done_better", e.target.value)} />
      </Cell>
      <Cell label="What still went wrong?">
        <Textarea className="min-h-[52px] text-xs" value={value.still_wrong ?? ""} onChange={(e) => set("still_wrong", e.target.value)} />
      </Cell>
      <div className="space-y-2">
        <Cell label="Was the original mistake avoided?">
          <div className="flex flex-wrap gap-1">
            {(["yes", "partly", "no", "not_tested"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => set("original_mistake_avoided", v)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[11px] capitalize transition",
                  value.original_mistake_avoided === v ? "border-primary/40 bg-primary/10 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground",
                )}
              >
                {v.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </Cell>
        <Cell label={`Confidence after${value.confidence_after != null ? ` · ${value.confidence_after}/10` : ""}`}>
          <Slider min={1} max={10} step={1} value={[value.confidence_after ?? 5]} onValueChange={([v]) => set("confidence_after", v)} />
        </Cell>
      </div>
      <div className="sm:col-span-2 text-[10px] text-muted-foreground">{saving ? "Saving…" : "Saved automatically."}</div>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export { Input, Tooltip, TooltipContent, TooltipTrigger };
