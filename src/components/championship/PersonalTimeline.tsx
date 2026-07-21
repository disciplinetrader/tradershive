import { Trophy, Flag, Play, TrendingUp, TrendingDown, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type Milestone = {
  id: string;
  label: string;
  hint?: string;
  at?: string | null;
  achieved: boolean;
  tone?: "success" | "warning" | "danger" | "primary";
  icon?: any;
};

/** Builds a canonical personal timeline for a tournament from the participant + ranking + activity slice. */
export function buildPersonalTimeline(input: {
  champ: { start_at: string; end_at: string; status: string };
  participant?: { created_at?: string; status?: string } | null;
  myRank?: { rank?: number | null; total_trades?: number; pnl?: number; last_trade_at?: string | null } | null;
  activity?: Array<{ id: string; kind?: string | null; message: string; created_at: string; user_id?: string | null; metadata?: any }>;
  userId?: string | null;
}): Milestone[] {
  const { champ, participant, myRank, activity, userId } = input;
  const started = new Date(champ.start_at).getTime() <= Date.now();
  const ended = new Date(champ.end_at).getTime() <= Date.now() || champ.status === "completed";
  const mine = (activity ?? []).filter((a) => a.user_id && a.user_id === userId);
  const firstTrade = mine.find((a) => a.kind === "trade" || /first trade|opened/i.test(a.message));
  const top100 = mine.find((a) => /top\s?100/i.test(a.message));
  const top50 = mine.find((a) => /top\s?50/i.test(a.message));
  const top10 = mine.find((a) => /top\s?10/i.test(a.message));
  const bestTrade = mine.find((a) => /best trade|largest win/i.test(a.message));
  const worstTrade = mine.find((a) => /worst trade|largest loss/i.test(a.message));

  return [
    {
      id: "registered",
      label: "Registered",
      hint: participant?.created_at ? new Date(participant.created_at).toLocaleString() : undefined,
      at: participant?.created_at,
      achieved: !!participant,
      icon: Flag,
      tone: "primary",
    },
    {
      id: "started",
      label: "Tournament started",
      at: champ.start_at,
      achieved: started,
      icon: Play,
      tone: "primary",
    },
    {
      id: "first-trade",
      label: "First trade",
      at: firstTrade?.created_at ?? myRank?.last_trade_at,
      achieved: (myRank?.total_trades ?? 0) > 0 || !!firstTrade,
      icon: TrendingUp,
      tone: "success",
    },
    {
      id: "top100",
      label: "Reached Top 100",
      at: top100?.created_at,
      achieved: (myRank?.rank ?? Infinity) <= 100 || !!top100,
      icon: Trophy,
      tone: "primary",
    },
    {
      id: "top50",
      label: "Reached Top 50",
      at: top50?.created_at,
      achieved: (myRank?.rank ?? Infinity) <= 50 || !!top50,
      icon: Trophy,
      tone: "warning",
    },
    {
      id: "top10",
      label: "Reached Top 10",
      at: top10?.created_at,
      achieved: (myRank?.rank ?? Infinity) <= 10 || !!top10,
      icon: Trophy,
      tone: "warning",
    },
    {
      id: "best",
      label: "Best trade",
      hint: bestTrade?.message,
      at: bestTrade?.created_at,
      achieved: !!bestTrade,
      icon: TrendingUp,
      tone: "success",
    },
    {
      id: "worst",
      label: "Worst trade",
      hint: worstTrade?.message,
      at: worstTrade?.created_at,
      achieved: !!worstTrade,
      icon: TrendingDown,
      tone: "danger",
    },
    {
      id: "finished",
      label: "Tournament finished",
      at: champ.end_at,
      achieved: ended,
      icon: CheckCircle2,
      tone: ended ? "success" : "primary",
    },
  ];
}

const TONE_TEXT: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  primary: "text-primary",
};
const TONE_BG: Record<string, string> = {
  success: "bg-success/15 border-success/30",
  warning: "bg-warning/15 border-warning/30",
  danger: "bg-danger/15 border-danger/30",
  primary: "bg-primary/15 border-primary/30",
};

/** Vertical timeline. Achieved milestones are highlighted; pending are dimmed. */
export function PersonalTimeline({ milestones }: { milestones: Milestone[] }) {
  return (
    <ol className="relative space-y-3 border-l-2 border-dashed border-border pl-5">
      {milestones.map((m) => {
        const Icon = m.icon ?? Circle;
        const tone = m.tone ?? "primary";
        return (
          <li key={m.id} className="relative">
            <span
              className={cn(
                "absolute -left-[29px] top-0.5 grid h-6 w-6 place-items-center rounded-full border-2",
                m.achieved ? TONE_BG[tone] : "border-border bg-muted",
              )}
            >
              <Icon className={cn("h-3 w-3", m.achieved ? TONE_TEXT[tone] : "text-muted-foreground")} />
            </span>
            <div className={cn("rounded-lg border bg-card px-3 py-2", !m.achieved && "opacity-60")}>
              <div className="flex items-center justify-between gap-2">
                <div className={cn("text-sm font-medium", m.achieved ? "text-foreground" : "text-muted-foreground")}>
                  {m.label}
                </div>
                {m.at ? (
                  <div className="text-[10px] text-muted-foreground">{new Date(m.at).toLocaleString()}</div>
                ) : null}
              </div>
              {m.hint ? <div className="mt-0.5 text-[11px] text-muted-foreground">{m.hint}</div> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
