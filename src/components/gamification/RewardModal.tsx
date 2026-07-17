import { AnimatePresence, motion } from "framer-motion";
import { Coins, Sparkles, Trophy, Zap } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type RewardPayload = {
  title: string;
  subtitle?: string;
  icon?: string | null;
  xp?: number;
  coins?: number;
  leveledUp?: boolean;
  level?: number;
  league?: string;
} | null;

export function RewardModal({ reward, onClose }: { reward: RewardPayload; onClose: () => void }) {
  const open = !!reward;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm overflow-hidden border-primary/30 bg-background/95 p-0">
        <AnimatePresence>
          {reward && (
            <motion.div
              key={reward.title}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-transparent to-fuchsia-500/20" />
              <div className="relative p-6 text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 14 }}
                  className="mx-auto grid h-20 w-20 place-items-center rounded-2xl bg-primary/15 text-4xl shadow-elegant"
                >
                  {reward.icon ?? "🎉"}
                </motion.div>
                <DialogTitle className="mt-4 text-xl font-bold">
                  {reward.leveledUp ? "Level Up!" : reward.title}
                </DialogTitle>
                {reward.subtitle && (
                  <p className="mt-1 text-sm text-muted-foreground">{reward.subtitle}</p>
                )}
                {reward.leveledUp && reward.level && (
                  <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs text-primary">
                    <Trophy className="h-3.5 w-3.5" /> You reached level {reward.level}
                  </p>
                )}
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <RewardStat icon={<Zap className="h-4 w-4 text-primary" />}
                    label="XP" value={`+${reward.xp ?? 0}`} />
                  <RewardStat icon={<Coins className="h-4 w-4 text-warning" />}
                    label="Coins" value={`+${reward.coins ?? 0}`} />
                </div>
                <Button onClick={onClose} className="mt-6 w-full gradient-primary text-primary-foreground">
                  <Sparkles className="mr-1 h-4 w-4" /> Continue
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

function RewardStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="glass rounded-xl px-3 py-2 text-left">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
