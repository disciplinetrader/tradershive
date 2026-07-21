import { createFileRoute, Link } from "@tanstack/react-router";
import { Brain, ArrowUpRight } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

/**
 * Entry point to the AI-driven analytics layer. The heavy tooling
 * (Coach Hub, Chat, Trade Reviews, Performance Reviews) lives under
 * `/ai/*`; this page surfaces those experiences from the Analytics Center.
 */
export const Route = createFileRoute("/_authenticated/analytics/ai")({
  component: AiHub,
});

const LINKS = [
  { to: "/ai/dashboard", title: "AI Dashboard", desc: "Composite scores, alerts, latest recommendations." },
  { to: "/ai/performance", title: "Performance Coach", desc: "Best/worst sessions, pairs, days and time slots." },
  { to: "/ai/coach", title: "Replay Coach", desc: "Deterministic patterns, trader profile, coach memory." },
  { to: "/ai/chat", title: "Coach Chat", desc: "Ask questions about your own trading history." },
  { to: "/ai/trade-review", title: "Trade Reviews", desc: "AI review of an individual trade." },
  { to: "/ai/journal-review", title: "Journal Review", desc: "AI summary of journal entries." },
];

function AiHub() {
  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        <Brain className="h-3.5 w-3.5" /> AI analytics
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="group flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-background/40 p-3 transition hover:border-primary/40 hover:bg-primary/5"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold">{l.title}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">{l.desc}</div>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
          </Link>
        ))}
      </div>
    </GlassCard>
  );
}
