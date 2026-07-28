import { Link, useRouterState } from "@tanstack/react-router";
import { ReactNode } from "react";
import {
  Activity, AlertTriangle, Award, BarChart3, Bell, BookOpen, Boxes,
  Cog, CreditCard, Database, DollarSign, FileText, Flag, HeartPulse,
  LayoutDashboard, LineChart, LifeBuoy, Mail, Megaphone, Shield, ShieldAlert,
  Sparkles, Trophy, Users, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isPlatformAdmin } from "@/lib/admin/permissions";
import { useAuth } from "@/hooks/use-auth";
import { NotificationBell } from "./NotificationBell";
import { AdminSearchPalette } from "./AdminSearchPalette";

type Item = { to: string; label: string; icon: typeof Users };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Overview",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/admin/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/roles", label: "Roles & Permissions", icon: Shield },
      { to: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
      { to: "/admin/revenue", label: "Revenue", icon: DollarSign },
    ],
  },
  {
    label: "Trading",
    items: [
      { to: "/admin/trades", label: "Trades", icon: LineChart },
      { to: "/admin/journal", label: "Journal", icon: BookOpen },
    ],
  },
  {
    label: "Engagement",
    items: [
      { to: "/admin/challenges", label: "Challenges", icon: Sparkles },
      { to: "/admin/achievements", label: "Achievements", icon: Award },
      { to: "/admin/leaderboards", label: "Leaderboards", icon: Trophy },
      { to: "/admin/championships", label: "Championships", icon: Trophy },
      { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
      { to: "/admin/content", label: "Content", icon: FileText },
    ],
  },
  {
    label: "Support",
    items: [
      { to: "/admin/support", label: "Support Centre", icon: LifeBuoy },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/admin/reports", label: "Reports", icon: BarChart3 },
      { to: "/admin/logs", label: "Audit Logs", icon: Activity },
      { to: "/admin/security", label: "Security Centre", icon: ShieldAlert },
      { to: "/admin/health", label: "System Health", icon: HeartPulse },
      { to: "/admin/database", label: "Database", icon: Database },
      { to: "/admin/storage", label: "Storage", icon: Boxes },
      { to: "/admin/market-data", label: "Market Data", icon: Zap },
      { to: "/admin/historical", label: "Historical Data", icon: Database },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/admin/feature-flags", label: "Feature Flags", icon: Flag },
      { to: "/admin/settings", label: "Settings", icon: Cog },
    ],
  },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { roles } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!isPlatformAdmin(roles)) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-danger" />
          <h2 className="text-lg font-semibold">Access denied</h2>
          <p className="text-sm text-muted-foreground">You need an admin role to view this area.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="hidden md:block">
        <div className="sticky top-4 space-y-5 rounded-2xl border border-border/60 bg-surface/40 p-3">
          <div className="flex items-center gap-2 px-2 pt-1">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Admin Console</span>
          </div>
          {GROUPS.map((g) => (
            <div key={g.label}>
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((it) => {
                  const active = pathname.startsWith(it.to);
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      className={cn(
                        "flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm transition",
                        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-surface hover:text-foreground",
                      )}
                    >
                      <it.icon className="h-4 w-4" /> {it.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <main className="min-w-0 space-y-5">
        <div className="flex items-center justify-between gap-2 rounded-2xl border border-border/60 bg-surface/40 p-2">
          <div className="flex gap-2 overflow-x-auto md:hidden">
            {GROUPS.flatMap((g) => g.items).slice(0, 8).map((it) => {
              const active = pathname.startsWith(it.to);
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "shrink-0 rounded-xl px-3 py-1.5 text-xs font-medium",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {it.label}
                </Link>
              );
            })}
          </div>
          <div className="hidden md:flex text-[11px] text-muted-foreground">
            Admin console · signed in as {roles?.join(", ")}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <AdminSearchPalette />
            <NotificationBell />
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
