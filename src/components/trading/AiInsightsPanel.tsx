import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle, BrainCircuit, ChevronDown, MessageSquare,
  ShieldAlert, Sparkles, Target, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePaper } from "@/components/paper-trading/context";
import { listTrades } from "@/lib/paper-trading.functions";
import { useActivePropChallenge } from "@/lib/prop-challenges/active-session";

/**
 * INSIGHTS — locally ranked, single-primary surface.
 *
 * No new AI calls. Insights are derived from data already cached in the
 * workspace (open positions, account, active prop challenge). They are
 * ranked by priority — risk/rule violation > behavioural > execution >
 * positive reinforcement > general — and only the top card is shown by
 * default. The rest fold behind "Show N more insights".
 */

type Severity = "risk" | "behaviour" | "execution" | "positive" | "general";
type Insight = {
  id: string;
  severity: Severity;
  icon: typeof AlertTriangle;
  title: string;        // observation
  why: string;          // why it matters
  action: string;       // one clear next action
  href?: string;        // deep link for the action
};

const SEVERITY_ORDER: Record<Severity, number> = {
  risk: 0, behaviour: 1, execution: 2, positive: 3, general: 4,
};

const SEVERITY_STYLES: Record<Severity, string> = {
  risk: "bg-danger/10 text-danger",
  behaviour: "bg-warning/10 text-warning",
  execution: "bg-primary/10 text-primary",
  positive: "bg-success/10 text-success",
  general: "bg-muted text-muted-foreground",
};

type OpenTrade = {
  id: string; symbol: string; direction: "long" | "short";
  entry_price: number; stop_loss: number | null; take_profit: number | null;
  lot_size: number;
};

export function AiInsightsPanel({ symbol }: { symbol?: string }) {
  const { accountId, account } = usePaper();
  const { active: challenge } = useActivePropChallenge();
  const [expanded, setExpanded] = useState(false); // session-only, no persistence

  const fetchOpen = useServerFn(listTrades);
  const { data: openTrades } = useQuery({
    queryKey: ["paper", "trades", accountId, "open"],
    queryFn: () => fetchOpen({ data: { account_id: accountId!, status: "open" } }) as unknown as Promise<OpenTrade[]>,
    enabled: !!accountId,
    staleTime: 4_000,
    refetchIntervalInBackground: false,
  });

  const insights = useMemo<Insight[]>(() => {
    const out: Insight[] = [];
    const positions = openTrades ?? [];

    // 1 — RISK / RULE VIOLATIONS (highest priority)
    const noStop = positions.filter((p) => p.stop_loss == null);
    if (noStop.length > 0) {
      out.push({
        id: "no-stop",
        severity: "risk",
        icon: ShieldAlert,
        title: `${noStop.length} open ${noStop.length === 1 ? "position has" : "positions have"} no stop-loss`,
        why: "An unhedged position can wipe out a session's gains from a single adverse move.",
        action: "Add a stop-loss now",
      });
    }
    if (account && account.equity < account.starting_balance * 0.9) {
      const dd = ((account.starting_balance - account.equity) / account.starting_balance) * 100;
      out.push({
        id: "drawdown",
        severity: "risk",
        icon: AlertTriangle,
        title: `Account is ${dd.toFixed(1)}% below starting balance`,
        why: "You're approaching the daily/max drawdown envelope — one large loser pushes you into breach territory.",
        action: "Reduce size or pause trading",
      });
    }
    if (challenge?.id) {
      // A live prop challenge implies rule constraints; surface the panel.
      out.push({
        id: "challenge-active",
        severity: "risk",
        icon: Target,
        title: "Prop challenge is live",
        why: "Daily-loss and max-drawdown limits apply to every open trade in this account.",
        action: "Review rule progress",
        href: "/prop-firm",
      });
    }

    // 2 — BEHAVIOURAL (repeated mistakes) — placeholder tied to open-count heuristic
    if (positions.length >= 4) {
      out.push({
        id: "overtrading",
        severity: "behaviour",
        icon: AlertTriangle,
        title: `${positions.length} concurrent positions`,
        why: "Attention thins out past 3–4 open trades and correlations can compound risk silently.",
        action: "Close weakest setup",
      });
    }

    // 3 — EXECUTION
    const noTP = positions.filter((p) => p.take_profit == null && p.stop_loss != null);
    if (noTP.length > 0) {
      out.push({
        id: "no-tp",
        severity: "execution",
        icon: BrainCircuit,
        title: `${noTP.length} ${noTP.length === 1 ? "position lacks" : "positions lack"} a take-profit`,
        why: "Without a target, exits become emotional and R:R rarely gets logged consistently.",
        action: "Set a take-profit",
      });
    }

    // 4 — POSITIVE REINFORCEMENT
    if (positions.length > 0 && noStop.length === 0 && noTP.length === 0) {
      out.push({
        id: "clean-book",
        severity: "positive",
        icon: TrendingUp,
        title: "Every open position has SL and TP",
        why: "You're trading with defined risk — this is the base habit of consistent traders.",
        action: "Keep it up",
      });
    }

    // 5 — GENERAL (only if nothing else)
    if (out.length === 0) {
      out.push({
        id: "review-last",
        severity: "general",
        icon: Sparkles,
        title: "Ready when you are",
        why: "No open risk to flag. Ask the coach for a plan on the current symbol.",
        action: "Open AI Coach",
        href: "/ai/chat",
      });
    }

    out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    return out;
  }, [openTrades, account, challenge?.id]);

  const primary = insights[0];
  const rest = insights.slice(1);
  const showRest = expanded && rest.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-primary" />
        <div className="text-sm font-semibold">Insights</div>
        <div className="ml-auto flex gap-1.5">
          <Button asChild size="sm" variant="outline" className="h-7 gap-1 text-xs">
            <Link to="/ai/chat" search={{ symbol } as any}>
              <MessageSquare className="h-3 w-3" /> Ask
            </Link>
          </Button>
        </div>
      </div>

      {primary && <InsightCard insight={primary} primary />}

      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls="insights-more"
            className="flex w-full items-center justify-between rounded-md border border-border/40 bg-background/30 px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition hover:bg-background/60 hover:text-foreground"
          >
            <span>{expanded ? "Hide" : `Show ${rest.length} more insight${rest.length === 1 ? "" : "s"}`}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")} />
          </button>
          <div
            id="insights-more"
            hidden={!showRest}
            className={cn("space-y-2", showRest && "animate-in fade-in duration-150")}
          >
            {rest.map((i) => <InsightCard key={i.id} insight={i} />)}
          </div>
        </>
      )}
    </div>
  );
}

function InsightCard({ insight, primary }: { insight: Insight; primary?: boolean }) {
  const Icon = insight.icon;
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3",
        primary ? "border-border/60 bg-card/60" : "border-border/40 bg-background/40",
      )}
    >
      <div className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-md", SEVERITY_STYLES[insight.severity])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <div className={cn("font-semibold leading-snug", primary ? "text-sm" : "text-xs")}>{insight.title}</div>
        <div className={cn("text-muted-foreground leading-snug", primary ? "text-xs" : "text-[11px]")}>{insight.why}</div>
        {insight.href ? (
          <Button asChild size="sm" variant="ghost" className="h-6 -ml-1 px-2 text-[11px] font-semibold text-primary hover:bg-primary/10">
            <Link to={insight.href}>{insight.action} →</Link>
          </Button>
        ) : (
          <div className="text-[11px] font-semibold text-primary">{insight.action}</div>
        )}
      </div>
    </div>
  );
}
