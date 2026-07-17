import { motion } from "framer-motion";
import { BarChart3, Flame, Shield, Trophy, Users } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { APP_NAME } from "@/lib/constants";

const PILLARS = [
  {
    icon: Users,
    title: "Join thousands of traders",
    body: "A global arena of traders sharpening their edge every day.",
  },
  {
    icon: Shield,
    title: "Practice risk free",
    body: "Paper trade real markets with live data — zero capital at risk.",
  },
  {
    icon: Trophy,
    title: "Compete daily",
    body: "Ladders, seasons, and challenges reset every Monday.",
  },
  {
    icon: BarChart3,
    title: "Improve consistency",
    body: "Journal every setup and let analytics find your leaks.",
  },
];

export function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-sidebar/70 p-10 lg:flex lg:flex-col lg:justify-between">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
      <div className="pointer-events-none absolute -left-40 top-0 h-[500px] w-[500px] rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[500px] w-[500px] rounded-full bg-primary-glow/20 blur-3xl" />

      <div className="relative flex items-center gap-2 text-sm font-bold tracking-tight">
        <div className="grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-elegant">
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path
              d="M4 17l5-5 4 4 7-9"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        {APP_NAME}
      </div>

      <div className="relative space-y-5">
        <motion.h2
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-3xl font-bold leading-tight tracking-tight xl:text-4xl"
        >
          The arena where traders <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">forge consistency</span>.
        </motion.h2>
        <div className="grid gap-3">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 + i * 0.06 }}
            >
              <GlassCard className="flex items-start gap-3 p-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <p.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.body}</p>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="relative flex items-center gap-2 text-[11px] text-muted-foreground">
        <Flame className="h-3 w-3 text-primary" />
        Season 1 · Live · Weekly resets Mondays 00:00 UTC
      </div>
    </div>
  );
}
