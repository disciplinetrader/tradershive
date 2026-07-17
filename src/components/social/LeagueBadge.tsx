import { motion } from "framer-motion";
import { LEAGUE_META } from "@/lib/social/constants";
import { cn } from "@/lib/utils";

export function LeagueBadge({
  league,
  size = "sm",
  className,
  showLabel = true,
}: {
  league: string | null | undefined;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  showLabel?: boolean;
}) {
  const meta = LEAGUE_META[String(league ?? "bronze")] ?? LEAGUE_META.bronze;
  const sz = {
    xs: "h-5 px-1.5 text-[9px]",
    sm: "h-6 px-2 text-[10px]",
    md: "h-7 px-2.5 text-xs",
    lg: "h-9 px-3 text-sm",
  }[size];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wider text-white shadow-sm",
        sz,
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${meta.from}, ${meta.to})`,
        borderColor: `${meta.color}55`,
      }}
    >
      <span aria-hidden>{meta.icon}</span>
      {showLabel ? meta.label : null}
    </span>
  );
}

export function AnimatedRankBadge({ rank, league }: { rank: number; league: string | null | undefined }) {
  const meta = LEAGUE_META[String(league ?? "bronze")] ?? LEAGUE_META.bronze;
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative grid place-items-center"
    >
      <div
        className="absolute inset-0 rounded-full blur-2xl opacity-40"
        style={{ background: `radial-gradient(circle, ${meta.color}, transparent 70%)` }}
      />
      <div
        className="relative flex h-24 w-24 items-center justify-center rounded-full border-2 shadow-xl"
        style={{
          background: `linear-gradient(135deg, ${meta.from}, ${meta.to})`,
          borderColor: meta.color,
        }}
      >
        <div className="text-center leading-tight text-white drop-shadow">
          <div className="text-[10px] uppercase tracking-widest opacity-80">Rank</div>
          <div className="font-mono text-2xl font-black">#{rank}</div>
        </div>
      </div>
    </motion.div>
  );
}
