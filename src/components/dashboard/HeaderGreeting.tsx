import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Bell, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

function partOfDay(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HeaderGreeting({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { profile, user } = useAuth();
  const tz = profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const first =
    profile?.first_name ||
    profile?.display_name?.split(" ")[0] ||
    profile?.username ||
    user?.email?.split("@")[0] ||
    "Trader";
  const greeting = partOfDay(
    Number(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: tz })),
  );
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-wrap items-end justify-between gap-4"
    >
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
          {greeting}, {first}
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          <span>{dateStr}</span>
          <span aria-hidden className="mx-1.5">·</span>
          <span className="font-mono tabular-nums">{timeStr}</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="hidden items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:flex"
          aria-label="Open quick search"
        >
          <Search className="h-4 w-4" />
          <span>Quick search</span>
          <kbd className="ml-2 rounded border border-border/60 bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
            ⌘K
          </kbd>
        </button>
        <Button size="icon" variant="outline" aria-label="Notifications">
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}
