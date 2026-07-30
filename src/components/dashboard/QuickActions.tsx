import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, BookOpen, LineChart, PlayCircle, Sparkles, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

type Action = {
  to: "/paper-trading" | "/journal" | "/challenges" | "/leaderboard" | "/analytics";
  title: string;
  description: string;
  icon: LucideIcon;
  tint: string;
  cta: string;
};

const ACTIONS: Action[] = [
  { to: "/paper-trading", title: "Start Paper Trading", description: "Practice risk-free with live-feel charts.", icon: LineChart, tint: "from-success/20 to-success/0", cta: "Open chart" },
  { to: "/paper-trading", title: "Continue Session", description: "Resume where you left off.", icon: PlayCircle, tint: "from-sky-500/20 to-sky-500/0", cta: "Resume" },
  { to: "/journal", title: "Open Journal", description: "Log setups, mistakes, and lessons.", icon: BookOpen, tint: "from-violet-500/20 to-violet-500/0", cta: "Write entry" },
  { to: "/challenges", title: "Today's Challenge", description: "Earn XP and climb the ladder.", icon: Sparkles, tint: "from-warning/20 to-warning/0", cta: "Play now" },
  { to: "/leaderboard", title: "Leaderboard", description: "See where you rank this season.", icon: Trophy, tint: "from-danger/20 to-danger/0", cta: "View ranks" },
  { to: "/analytics", title: "Analytics", description: "Deep dive into your edge.", icon: BarChart3, tint: "from-teal-500/20 to-teal-500/0", cta: "Open analytics" },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {ACTIONS.map((a, i) => (
        <motion.div
          key={a.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.04 }}
        >
          <Link to={a.to} className="block h-full">
            <GlassCard className="group relative h-full overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-elegant">
              <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70", a.tint)} />
              <div className="relative flex h-full flex-col">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-background/60 text-primary ring-1 ring-border/50">
                  <a.icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-semibold leading-tight">{a.title}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.description}</p>
                <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-90 transition group-hover:gap-2">
                  {a.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </div>
              </div>
            </GlassCard>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
