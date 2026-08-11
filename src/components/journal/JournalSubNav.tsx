import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  FileBarChart,
  BookOpen,
  FileText,
  Brain,
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  ListChecks,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const JOURNAL_NAV = [
  { to: "/journal", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/journal/trades", label: "Trades", icon: ListChecks },
  { to: "/journal/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/journal/daily", label: "Daily", icon: CalendarRange },
  { to: "/journal/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/journal/reports", label: "Reports", icon: FileBarChart },
  { to: "/journal/playbooks", label: "Playbooks", icon: BookOpen },
  { to: "/journal/notebook", label: "Notebook", icon: FileText },
  { to: "/journal/psychology", label: "Psychology", icon: Brain },
  { to: "/journal/coach", label: "AI Coach", icon: Sparkles },
] as const;

export function JournalSubNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Journal sections" className="h-scroll -mx-1 flex items-center gap-1 overflow-x-auto px-1">
      {JOURNAL_NAV.map((item) => {
        const active =
          "exact" in item && item.exact ? pathname === item.to : pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
