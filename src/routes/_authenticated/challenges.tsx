import { createFileRoute } from "@tanstack/react-router";
import { Award, Clock, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_authenticated/challenges")({
  head: () => ({ meta: [{ title: "Challenges — TradersHIVE Arena" }] }),
  component: ChallengesPage,
});

const CHALLENGES = [
  {
    id: "daily-3",
    title: "Log 3 trades today",
    reward: 120,
    type: "Daily",
    difficulty: "Easy",
  },
  {
    id: "weekly-r",
    title: "Achieve +3R in a single week",
    reward: 500,
    type: "Weekly",
    difficulty: "Medium",
  },
  {
    id: "no-revenge",
    title: "Zero revenge trades for 7 days",
    reward: 800,
    type: "Weekly",
    difficulty: "Hard",
  },
  {
    id: "prop-firm",
    title: "Prop firm: 8% profit / 5% max drawdown",
    reward: 5000,
    type: "Elite",
    difficulty: "Elite",
  },
];

function ChallengesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Challenges"
        description="Complete objectives to earn XP, coins, and league promotions."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
        {CHALLENGES.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.05 }}
          >
            <GlassCard className="hover-lift p-6">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  <Sparkles className="mr-1 h-3 w-3" />
                  {c.type}
                </Badge>
                <Badge variant="outline" className="border-border">
                  {c.difficulty}
                </Badge>
              </div>
              <h3 className="text-lg font-semibold">{c.title}</h3>
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Award className="h-4 w-4 text-warning" />
                  <span className="font-semibold text-foreground">+{c.reward}</span> XP
                </div>
                <Button size="sm" className="gradient-primary text-primary-foreground">
                  Join
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <GlassCard className="p-5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Clock className="h-4 w-4 text-primary" />
          Weekly challenges reset every Monday at 00:00 UTC.
        </div>
      </GlassCard>
    </div>
  );
}
