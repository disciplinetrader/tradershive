import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Film,
  FolderKanban,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Home,
  LifeBuoy,
  LineChart,
  Menu,
  Settings,
  Shield,
  Sparkles,
  Trophy,
  User as UserIcon,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Topbar } from "./topbar";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { APP_NAME } from "@/lib/constants";

type NavItem = { to: string; label: string; icon: typeof Home; admin?: boolean };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/paper-trading", label: "Paper Trading", icon: LineChart },
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/challenges", label: "Challenges", icon: Sparkles },
  { to: "/achievements", label: "Achievements", icon: Award },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/users", label: "Discover", icon: Users },
  { to: "/statistics", label: "Statistics", icon: BarChart3 },
  { to: "/ai", label: "AI Coach", icon: BrainCircuit },
  { to: "/replay", label: "Replay", icon: Film },
  { to: "/strategies", label: "Strategies", icon: FolderKanban },
  { to: "/market", label: "Market Data", icon: Bell },
];

const SECONDARY: NavItem[] = [
  { to: "/profile", label: "Profile", icon: UserIcon },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/support", label: "Support", icon: LifeBuoy },
];

const ADMIN: NavItem[] = [{ to: "/admin", label: "Admin", icon: Shield, admin: true }];

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAdmin, profile, loading } = useAuth();
  const { open, setOpen } = useCommandPalette();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Redirect users who haven't completed onboarding
  useEffect(() => {
    if (loading) return;
    if (profile && profile.onboarded === false && pathname !== "/onboarding") {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, profile, pathname, navigate]);

  return (
    <div className="relative flex min-h-screen w-full bg-background">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[500px] gradient-radial-glow opacity-40" />

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 border-r border-border/60 bg-sidebar/80 backdrop-blur-xl transition-[width] duration-300 md:block",
          collapsed ? "w-[76px]" : "w-[248px]",
        )}
      >
        <SidebarInner
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          showAdmin={isAdmin}
          currentPath={pathname}
        />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-y-0 left-0 w-[280px] border-r border-border/60 bg-sidebar shadow-2xl"
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarInner
              collapsed={false}
              onToggle={() => {}}
              showAdmin={isAdmin}
              currentPath={pathname}
              hideToggle
            />
          </motion.aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setMobileOpen(true)}
          onSearchClick={() => setOpen(true)}
        />
        <main className="flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-10 md:pt-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
        {/* Mobile bottom nav */}
        <MobileBottomNav currentPath={pathname} onMenuClick={() => setMobileOpen(true)} />
      </div>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}

function SidebarInner({
  collapsed,
  onToggle,
  showAdmin,
  currentPath,
  hideToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
  showAdmin: boolean;
  currentPath: string;
  hideToggle?: boolean;
}) {
  const items = [...NAV, ...SECONDARY, ...(showAdmin ? ADMIN : [])];
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border/80 px-4">
        <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground shadow-elegant">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path d="M4 17l5-5 4 4 7-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          {!collapsed ? (
            <span className="truncate text-sm font-bold tracking-tight">{APP_NAME}</span>
          ) : null}
        </Link>
        {!hideToggle ? (
          <button
            onClick={onToggle}
            className="ml-auto hidden h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground md:grid"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <SectionLabel collapsed={collapsed}>Arena</SectionLabel>
        <ul className="space-y-1">
          {NAV.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} active={isActive(currentPath, item.to)} />
          ))}
        </ul>
        <SectionLabel collapsed={collapsed} className="mt-6">Account</SectionLabel>
        <ul className="space-y-1">
          {SECONDARY.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} active={isActive(currentPath, item.to)} />
          ))}
        </ul>
        {showAdmin ? (
          <>
            <SectionLabel collapsed={collapsed} className="mt-6">System</SectionLabel>
            <ul className="space-y-1">
              {ADMIN.map((item) => (
                <SidebarLink key={item.to} item={item} collapsed={collapsed} active={isActive(currentPath, item.to)} />
              ))}
            </ul>
          </>
        ) : null}
      </nav>

      {!collapsed ? (
        <div className="m-3 rounded-2xl border border-sidebar-border/80 bg-sidebar-accent/40 p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Season 1 · Live
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Weekly challenges reset every Monday at 00:00 UTC.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function SectionLabel({
  children,
  collapsed,
  className,
}: {
  children: ReactNode;
  collapsed: boolean;
  className?: string;
}) {
  if (collapsed) return <div className={cn("h-4", className)} />;
  return (
    <div
      className={cn(
        "px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

function isActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function SidebarLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.to}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
        )}
      >
        {active ? (
          <motion.span
            layoutId="sidebar-active"
            className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : null}
        <Icon
          className={cn(
            "h-4 w-4 shrink-0 transition",
            active ? "text-primary" : "group-hover:text-primary",
          )}
        />
        {!collapsed ? <span className="truncate">{item.label}</span> : null}
        {item.admin && !collapsed ? (
          <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            ADMIN
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function MobileBottomNav({
  currentPath,
  onMenuClick,
}: {
  currentPath: string;
  onMenuClick: () => void;
}) {
  const items: NavItem[] = [
    { to: "/dashboard", label: "Home", icon: Home },
    { to: "/paper-trading", label: "Trade", icon: LineChart },
    { to: "/journal", label: "Journal", icon: BookOpen },
    { to: "/leaderboard", label: "Rank", icon: Trophy },
  ];
  return (
    <div className="sticky bottom-0 z-30 border-t border-border/60 bg-background/85 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2 py-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(currentPath, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-medium transition",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={onMenuClick}
          className="flex flex-col items-center gap-1 rounded-xl py-1.5 text-[10px] font-medium text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          More
        </button>
      </div>
    </div>
  );
}
