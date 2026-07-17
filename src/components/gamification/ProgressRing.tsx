import { motion } from "framer-motion";

export function ProgressRing({
  value,
  size = 88,
  stroke = 8,
  children,
}: {
  value: number; // 0..100
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
          className="fill-none stroke-border/40" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke}
          className="fill-none stroke-primary"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-sm font-semibold">
        {children ?? `${Math.round(clamped)}%`}
      </div>
    </div>
  );
}
