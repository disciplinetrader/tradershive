import { motion } from "framer-motion";
import { Sparkles, Brain, GraduationCap, HeartPulse, ShieldAlert, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeCoachTip } from "@/lib/dashboard-home.functions";

type Props = { tips: HomeCoachTip[] };

const TAG_ICON = {
  review: GraduationCap,
  practice: Brain,
  psychology: HeartPulse,
  risk: ShieldAlert,
  consistency: TrendingUp,
} as const;

/**
 * Section 4 — Continuous Improvement.
 * Rule-based coach tips today, AI-powered later. Shape is provider-agnostic.
 */
export function CoachTipsCard({ tips }: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Continuous improvement</h2>
          <p className="text-[11px] text-muted-foreground/80">Rule-based today · AI Coach coming soon.</p>
        </div>
      </div>

      {tips.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/50 bg-card/40 p-6 text-center text-sm text-muted-foreground">
          Trade a few more sessions and coaching insights will appear here.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tips.map((tip, i) => {
            const Icon = TAG_ICON[tip.tag] ?? Sparkles;
            return (
              <motion.article
                key={tip.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-card/80 to-card p-4 transition hover:border-primary/40"
              >
                <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-primary/5 blur-2xl transition group-hover:bg-primary/10" />
                <div className="flex items-start gap-3">
                  <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary")}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/70">{tip.tag}</p>
                    <h3 className="mt-0.5 text-sm font-semibold leading-snug">{tip.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{tip.body}</p>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </section>
  );
}
