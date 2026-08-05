import { Link, useRouterState } from "@tanstack/react-router";
import { 
  LayoutDashboard, 
  LineChart, 
  PieChart, 
  BarChart3,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";

export const DASHBOARD_TABS = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/sessions", label: "Sessions", icon: LineChart },
  { to: "/dashboard/trades", label: "Trades", icon: PieChart },
  { to: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
] as const;

export function DashboardSubNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Dashboard sections" className="h-scroll -mx-1 flex items-center gap-1 overflow-x-auto px-1">
      {DASHBOARD_TABS.map((item) => {
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
