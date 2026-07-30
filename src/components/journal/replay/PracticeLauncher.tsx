/**
 * JOURNAL X — PHASE 4 · practice entry points.
 *
 * One launcher used by every surface that can start a replay attempt:
 * Trade Story, Mistakes panel, AI review, Improvement plan, Similar trades.
 * The launcher only offers modes the entry actually has data for, captures a
 * compact Intent Card, then spawns a normal replay session.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Dumbbell, EyeOff, Loader2, Play, Repeat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import type { JournalEntry } from "@/lib/journal/api";
import { attemptKeys, startAttempt } from "@/lib/journal/replay-attempts";
import { PRACTICE_MODES, type AttemptIntent, type PracticeMode } from "@/lib/journal/replay-compare";
import { mistakeLabel, setupLabel } from "@/lib/journal/story";
import { cn } from "@/lib/utils";

type Pending = { mode: PracticeMode; mistake?: string } | null;

/** Modes are only offered when the entry carries the data they need. */
export function availableModes(entry: JournalEntry): PracticeMode[] {
  const out: PracticeMode[] = [];
  const hasWindow = Boolean(entry.symbol && (entry.opened_at || entry.created_at));
  if (hasWindow) out.push("standard");
  if (hasWindow && (entry.stop_loss != null || entry.take_profit != null)) out.push("retry_plan");
  if (hasWindow && entry.direction) out.push("blind");
  if (hasWindow && (entry.mistakes ?? []).length) out.push("mistake_drill");
  return out;
}

export function usePracticeLauncher(entry: JournalEntry | null | undefined) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pending, setPending] = useState<Pending>(null);

  const mutation = useMutation({
    mutationFn: async (input: { mode: PracticeMode; intent: AttemptIntent; mistake?: string }) => {
      if (!entry || !user) throw new Error("Sign in to start a practice attempt.");
      return startAttempt({ userId: user.id, entry, mode: input.mode, intent: input.intent, mistake: input.mistake });
    },
    onSuccess: ({ sessionId, attempt }) => {
      if (entry) qc.invalidateQueries({ queryKey: attemptKeys.forEntry(entry.id) });
      setPending(null);
      toast.success(`Attempt ${attempt.attempt_number} ready — future candles are hidden.`);
      navigate({ to: "/replay/session", search: { id: sessionId } as never });
    },
    onError: (e) => toast.error((e as Error).message || "Could not start the practice attempt."),
  });

  return {
    pending,
    open: (mode: PracticeMode, mistake?: string) => setPending({ mode, mistake }),
    close: () => setPending(null),
    start: (intent: AttemptIntent) => pending && mutation.mutate({ ...pending, intent }),
    isPending: mutation.isPending,
  };
}

/* ------------------------------------------------------------------ */
/* Intent card                                                         */
/* ------------------------------------------------------------------ */

export function IntentDialog({
  entry,
  pending,
  onClose,
  onStart,
  busy,
}: {
  entry: JournalEntry;
  pending: Pending;
  onClose: () => void;
  onStart: (intent: AttemptIntent) => void;
  busy: boolean;
}) {
  const mode = pending?.mode ?? "standard";
  const blind = mode === "blind";
  const meta = PRACTICE_MODES.find((m) => m.value === mode);

  const [intent, setIntent] = useState<AttemptIntent>({});
  const set = <K extends keyof AttemptIntent>(k: K, v: AttemptIntent[K]) => setIntent((p) => ({ ...p, [k]: v }));

  // Reference is only shown when the mode allows it.
  const reference = useMemo(() => {
    if (blind || !pending) return [];
    const rows: { label: string; value: string }[] = [];
    if (entry.symbol) rows.push({ label: "Symbol", value: entry.symbol });
    if (entry.setup) rows.push({ label: "Setup", value: setupLabel(entry.setup) });
    if (entry.session) rows.push({ label: "Session", value: entry.session });
    if (mode === "retry_plan") {
      if (entry.stop_loss != null) rows.push({ label: "Original stop", value: `${entry.stop_loss}` });
      if (entry.take_profit != null) rows.push({ label: "Original target", value: `${entry.take_profit}` });
      if (entry.risk_pct != null) rows.push({ label: "Original risk", value: `${entry.risk_pct}%` });
    }
    if (pending.mistake) rows.push({ label: "Drill focus", value: mistakeLabel(pending.mistake) });
    return rows;
  }, [blind, entry, mode, pending]);

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg gap-3 rounded-[4px] border-border/60">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-sm font-medium">{meta?.label ?? "Practice attempt"}</DialogTitle>
          <DialogDescription className="text-xs">{meta?.blurb}</DialogDescription>
        </DialogHeader>

        {reference.length > 0 && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-[3px] border border-border/50 bg-muted/20 p-2 text-[11px]">
            {reference.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="tabular-nums">{r.value}</span>
              </div>
            ))}
          </div>
        )}
        {blind && (
          <p className="rounded-[3px] border border-border/50 bg-muted/20 p-2 text-[11px] text-muted-foreground">
            Direction, entry, exit, P/L and annotations from the original trade are hidden for this attempt.
          </p>
        )}

        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Intended setup">
            <Input className="h-7 text-xs" value={intent.setup ?? ""} onChange={(e) => set("setup", e.target.value)} placeholder="e.g. London sweep" />
          </Field>
          <Field label="Rule focus">
            <Input className="h-7 text-xs" value={intent.rule_focus ?? ""} onChange={(e) => set("rule_focus", e.target.value)} placeholder="One rule to hold" />
          </Field>
          <Field label="Entry condition" full>
            <Textarea className="min-h-[46px] text-xs" value={intent.entry_condition ?? ""} onChange={(e) => set("entry_condition", e.target.value)} placeholder="What must print before risk goes on?" />
          </Field>
          <Field label="Invalidation">
            <Input className="h-7 text-xs" value={intent.invalidation ?? ""} onChange={(e) => set("invalidation", e.target.value)} placeholder="What kills the idea" />
          </Field>
          <Field label="Risk %">
            <Input
              className="h-7 text-xs tabular-nums"
              type="number"
              step="0.1"
              value={intent.risk_pct ?? ""}
              onChange={(e) => set("risk_pct", e.target.value === "" ? null : Number(e.target.value))}
              placeholder="1.0"
            />
          </Field>
          <Field label="Stop plan">
            <Input className="h-7 text-xs" value={intent.stop_plan ?? ""} onChange={(e) => set("stop_plan", e.target.value)} placeholder="Below the sweep" />
          </Field>
          <Field label="Target plan">
            <Input className="h-7 text-xs" value={intent.target_plan ?? ""} onChange={(e) => set("target_plan", e.target.value)} placeholder="Prior day high" />
          </Field>
          <Field label="Management plan" full>
            <Input className="h-7 text-xs" value={intent.management_plan ?? ""} onChange={(e) => set("management_plan", e.target.value)} placeholder="No stop moves before 1R" />
          </Field>
          <Field label="Mistake to avoid">
            <Input className="h-7 text-xs" value={intent.mistake_to_avoid ?? (pending?.mistake ? mistakeLabel(pending.mistake) : "")} onChange={(e) => set("mistake_to_avoid", e.target.value)} />
          </Field>
          <Field label={`Confidence${intent.confidence != null ? ` · ${intent.confidence}/10` : ""}`}>
            <Slider className="mt-2" min={1} max={10} step={1} value={[intent.confidence ?? 5]} onValueChange={([v]) => set("confidence", v)} />
          </Field>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <span className="text-[11px] text-muted-foreground">Nothing here is required — you can start immediately.</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={() => onStart(intent)} disabled={busy}>
              {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
              Start attempt
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={cn("space-y-1", full && "sm:col-span-2")}>
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

const MODE_ICON: Record<PracticeMode, typeof Play> = {
  standard: Play,
  retry_plan: Repeat,
  blind: EyeOff,
  mistake_drill: Dumbbell,
};

/** Primary CTA + mode menu. Modes without data simply don't appear. */
export function PracticeButton({
  entry,
  launcher,
  label = "Replay this trade",
  size = "sm",
  variant = "default",
  className,
}: {
  entry: JournalEntry;
  launcher: ReturnType<typeof usePracticeLauncher>;
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost" | "secondary";
  className?: string;
}) {
  const modes = availableModes(entry);
  if (!modes.length) return null;
  const primary = modes[0];
  const rest = modes.slice(1);

  return (
    <div className={cn("inline-flex", className)}>
      <Button
        size={size}
        variant={variant}
        className={cn("h-7 px-2 text-xs", rest.length && "rounded-r-none")}
        onClick={() => launcher.open(primary)}
        disabled={launcher.isPending}
      >
        <Play className="mr-1 h-3.5 w-3.5" /> {label}
      </Button>
      {rest.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={size} variant={variant} className="h-7 rounded-l-none border-l border-background/20 px-1.5" aria-label="More practice modes">
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {rest.map((m) => {
              const meta = PRACTICE_MODES.find((x) => x.value === m)!;
              const Icon = MODE_ICON[m];
              return (
                <DropdownMenuItem key={m} onClick={() => launcher.open(m)} className="flex-col items-start gap-0.5">
                  <span className="flex items-center gap-1.5 text-xs">
                    <Icon className="h-3.5 w-3.5" /> {meta.label}
                  </span>
                  <span className="pl-5 text-[10px] text-muted-foreground">{meta.blurb}</span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

/** "Fix this mistake" — used from the Mistakes panel and AI surfaces. */
export function FixMistakeButton({
  mistake,
  launcher,
  entry,
}: {
  mistake: string;
  launcher: ReturnType<typeof usePracticeLauncher>;
  entry: JournalEntry;
}) {
  if (!availableModes(entry).includes("mistake_drill")) return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 px-2 text-[11px]"
      onClick={() => launcher.open("mistake_drill", mistake)}
      disabled={launcher.isPending}
    >
      <Dumbbell className="mr-1 h-3 w-3" /> Fix this mistake
    </Button>
  );
}
