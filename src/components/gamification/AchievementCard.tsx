import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ShareToCommunityButton } from "@/components/sharing/ShareToCommunityButton";

export function AchievementCard({ a }: { a: any }) {
  const pct = Math.min(100, Math.round((Number(a.progress ?? 0) / Math.max(1, Number(a.target))) * 100));
  const unlocked = !!a.unlocked;
  const hidden = a.secret && !unlocked;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <GlassCard className={cn(
        "relative overflow-hidden p-4 text-center transition h-full",
        unlocked ? "border-primary/40 shadow-elegant" : "opacity-90",
      )}>
        {unlocked && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-fuchsia-500/15" />
        )}
        <div className="relative">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-background/60 text-3xl">
            {hidden ? <Lock className="h-5 w-5 text-muted-foreground" /> : (a.icon ?? "🏅")}
          </div>
          <div className="mt-2 truncate text-sm font-semibold">{hidden ? "Secret Achievement" : a.title}</div>
          <div className="mt-1 line-clamp-2 min-h-[2rem] text-[11px] text-muted-foreground">
            {hidden ? "Unlock this one to reveal it." : a.description}
          </div>
          <Badge variant="outline" className="mt-2 border-border/60 text-[10px] capitalize">{a.category}</Badge>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{unlocked ? "Unlocked" : "Progress"}</span>
              <span className="tabular-nums">{a.progress ?? 0} / {a.target}</span>
            </div>
            <Progress value={pct} className="h-1" />
          </div>
          <div className="mt-2 flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
            <span>+{a.xp_reward} XP</span> · <span>+{a.coin_reward} 🪙</span>
          </div>
          {unlocked && a.user_achievement_id ? (
            <div className="mt-3 flex justify-center">
              <ShareToCommunityButton sourceType="achievement" sourceId={a.user_achievement_id} label="Share" size="sm" variant="outline" />
            </div>
          ) : null}
        </div>
      </GlassCard>
    </motion.div>
  );
}
