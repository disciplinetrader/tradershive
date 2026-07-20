import { useMemo } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AI Coach avatar — animated pulsing orb.
 * Reused across dashboard, chat, and hero sections.
 */
export function AiAvatar({
  size = 56,
  active = false,
  className,
}: {
  size?: number;
  active?: boolean;
  className?: string;
}) {
  const glow = useMemo(() => Math.round(size * 0.6), [size]);
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 90deg, color-mix(in oklab, var(--primary) 90%, transparent), color-mix(in oklab, var(--accent) 70%, transparent), color-mix(in oklab, var(--primary) 90%, transparent))",
          filter: `blur(${glow / 6}px)`,
        }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: active ? 4 : 12, ease: "linear" }}
      />
      <motion.div
        aria-hidden
        className="absolute rounded-full bg-primary/20"
        style={{ inset: 4 }}
        animate={{ scale: active ? [1, 1.08, 1] : [1, 1.02, 1] }}
        transition={{ repeat: Infinity, duration: 2.4, ease: "easeInOut" }}
      />
      <div
        className="relative flex items-center justify-center rounded-full bg-background/80 backdrop-blur-md border border-primary/40 shadow-[0_0_40px_-10px_color-mix(in oklab, var(--primary) 60%, transparent)]"
        style={{ width: size - 8, height: size - 8 }}
      >
        <Sparkles className="text-primary" style={{ width: size * 0.4, height: size * 0.4 }} />
      </div>
    </div>
  );
}
