import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Flame, BookOpen, Timer, Target, CheckCircle2, PartyPopper, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeSummary } from "@/lib/dashboard-home.functions";

type Props = { data: HomeSummary["focus"] };

/**
 * Section 1 — Today's Focus.
 * Answers: "What should I do today?"
 */
export function TodayFocusCard({ data }: Props) {
  const items = [
    { icon: Timer, label: "Replay practice today", value: `${data.replayMinutesToday} min`, href: "/replay", tone: data.replayMinutesToday > 0 ? "success" : "muted" as const },
    { icon: BookOpen, label: "Journal entries remaining", value: data.journalMissingToday === 0 ? "All logged" : `${data.journalMissingToday} missing`, href: "/journal", tone: data.journalMissingToday === 0 ? "success" : "warning" as const },
    { icon: Flame, label: "Current trading streak", value: `${data.streakDays} day${data.streakDays === 1 ? "" : "s"}`, href: "/analytics", tone: data.streakDays >= 3 ? "success" : "muted" as const },
    { icon: Target, label: "Active goals", value: data.totalTasks === 0 ? "None yet" : `${data.completedTasks}/${data.totalTasks} on track`, href: "/goals", tone: data.totalTasks > 0 && data.completedTasks === data.totalTasks ? "success" : "muted" as const },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-elegant"
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/80">Today's focus</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            {data.allClear ? "Great work! Today's trading plan is complete." : "Here's what needs your attention today"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.allClear
              ? "Take a review pass, or plan tomorrow while things are fresh."
              : "Small, deliberate actions compound — knock these out and step away."}
          </p>
        </div>
        {data.allClear && (
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-success/15 text-success">
            <PartyPopper className="h-6 w-6" />
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map((it) => (
          <Link
            key={it.label}
            to={it.href}
            className="group flex items-center gap-3 rounded-2xl border border-border/50 bg-background/60 p-3 backdrop-blur transition hover:border-primary/40 hover:bg-background/80"
          >
            <div className={cn(
              "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
              it.tone === "success" && "bg-success/15 text-success",
              it.tone === "warning" && "bg-warning/15 text-warning",
              it.tone === "muted" && "bg-muted text-muted-foreground",
            )}>
              <it.icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{it.label}</p>
              <p className="truncate text-sm font-semibold">{it.value}</p>
            </div>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
          </Link>
        ))}
      </div>

      {data.allClear && data.totalTasks > 0 && (
        <div className="mt-4 flex items-center gap-2 text-xs text-success">
          <CheckCircle2 className="h-4 w-4" />
          <span>All {data.totalTasks} active goal{data.totalTasks === 1 ? "" : "s"} on track today.</span>
        </div>
      )}
    </motion.section>
  );
}
