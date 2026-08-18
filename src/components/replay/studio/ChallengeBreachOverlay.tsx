/**
 * Phase 2 · item 3 — the breach moment.
 *
 * A prop challenge failing is not a status change, it is an event. The live
 * paper version rendered it as one line inside a HUD, which a trader mid-chart
 * can miss entirely — and "did my challenge survive that trade?" is not a
 * question the product should leave open.
 *
 * So this carries the same weight as `BattleStartIntro`'s countdown: full
 * viewport, backdrop blur, one thing to read. It differs from that one in
 * refusing to dismiss itself — the countdown is a prelude and can be skipped,
 * a failed evaluation has to be acknowledged.
 *
 * What it must state, in order: that the challenge failed, WHICH rule failed,
 * and BY HOW MUCH. A breach line that says only "daily loss limit exceeded"
 * makes the trader go and work out the number themselves.
 */

import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/prop-challenges/evaluator";
import type { ChallengeBreach } from "./useChallengeMonitor";

function marketDay(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function ChallengeBreachOverlay({
  breach,
  open,
  sessionId,
  onAcknowledge,
}: {
  breach: ChallengeBreach | null;
  open: boolean;
  sessionId: string;
  onAcknowledge: () => void;
}) {
  const over = breach ? breach.observed - breach.limit : 0;

  return (
    <AnimatePresence>
      {open && breach ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="challenge-breach-title"
          data-testid="challenge-breach"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-6 backdrop-blur-xl"
        >
          <div className="absolute inset-0 overflow-hidden opacity-20">
            <div className="absolute -top-1/2 left-1/2 h-[1000px] w-[1000px] -translate-x-1/2 rounded-full bg-destructive/30 blur-[120px]" />
          </div>

          <div className="relative flex w-full max-w-lg flex-col items-center gap-6 text-center">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-destructive/10 text-destructive shadow-2xl shadow-destructive/20 ring-1 ring-destructive/20"
            >
              <ShieldX className="h-10 w-10" />
            </motion.div>

            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground">
                Evaluation over
              </p>
              <h2
                id="challenge-breach-title"
                className="mt-2 text-4xl font-black italic tracking-tighter text-foreground sm:text-5xl"
              >
                CHALLENGE FAILED
              </h2>
            </div>

            {/* The breach itself: which rule, and by how much. */}
            <div className="w-full rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-left">
              <p
                className="text-[11px] font-semibold uppercase tracking-wider text-destructive"
                data-testid="breach-field"
              >
                {breach.field}
              </p>
              <p className="mt-1 text-sm text-foreground">{breach.detail}</p>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-destructive/20 pt-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Limit</dt>
                  <dd className="font-mono text-sm tabular-nums" data-testid="breach-limit">
                    {formatCurrency(breach.limit)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Reached</dt>
                  <dd className="font-mono text-sm tabular-nums text-destructive" data-testid="breach-observed">
                    {formatCurrency(breach.observed)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Over by</dt>
                  <dd className="font-mono text-sm tabular-nums text-destructive" data-testid="breach-over">
                    {formatCurrency(over)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid w-full grid-cols-3 gap-2 text-left">
              {[
                ["Equity", formatCurrency(breach.equity)],
                ["Peak", formatCurrency(breach.peakEquity)],
                ["Breached at", marketDay(breach.atMarketTime)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="mt-0.5 truncate font-mono text-xs tabular-nums">{value}</div>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              The session has been closed and its trades recorded. Nothing is lost — the tape is
              still reviewable.
            </p>

            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild className="sm:min-w-40">
                <Link to="/replay/review" search={{ id: sessionId }}>Review the session</Link>
              </Button>
              <Button variant="secondary" onClick={onAcknowledge} className="sm:min-w-40">
                Stay on the chart
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
