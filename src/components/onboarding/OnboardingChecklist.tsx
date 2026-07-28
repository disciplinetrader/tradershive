import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Sparkles, Trophy } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CHECKLIST_ITEMS,
  checklistProgress,
  readChecklist,
  type ChecklistItemId,
} from "@/lib/onboarding/checklist";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "thv:onboarding:checklist-dismissed";

/**
 * Compact activation checklist rendered on the dashboard until every item
 * is complete (or the user dismisses it). Reads state from localStorage
 * and refreshes on the `thv:checklist-changed` custom event.
 */
export function OnboardingChecklist() {
  const [state, setState] = useState<Record<ChecklistItemId, boolean>>(() => readChecklist());
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });

  useEffect(() => {
    const refresh = () => setState(readChecklist());
    window.addEventListener("thv:checklist-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("thv:checklist-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const progress = checklistProgress(state);
  const allDone = progress === 100;

  if (dismissed) return null;

  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {allDone ? (
              <Trophy className="h-4 w-4 text-warning" aria-hidden />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            )}
            {allDone ? "You've activated TradersHIVE" : "Getting started"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {allDone
              ? "Every activation milestone complete. You've earned the First Steps badge."
              : "Finish these steps to unlock the full arena."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              window.localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
            setDismissed(true);
          }}
          className="text-[11px] uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
        >
          Dismiss
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Progress value={progress} className="h-1.5 flex-1" />
        <span className="text-xs font-medium tabular-nums text-muted-foreground">{progress}%</span>
      </div>

      <ul className="mt-4 divide-y divide-border/60">
        {CHECKLIST_ITEMS.map((item) => {
          const done = !!state[item.id];
          return (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <span
                className={cn(
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full border transition",
                  done
                    ? "border-success bg-success text-success-foreground"
                    : "border-border bg-card text-muted-foreground",
                )}
                aria-hidden
              >
                {done ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-medium",
                    done ? "text-muted-foreground line-through" : "text-foreground",
                  )}
                >
                  {item.label}
                </p>
                <p className="truncate text-xs text-muted-foreground">{item.description}</p>
              </div>
              {!done ? (
                <Button asChild size="sm" variant="ghost" className="h-8 gap-1 px-2 text-xs">
                  <Link to={item.href as never}>
                    {item.cta}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}
