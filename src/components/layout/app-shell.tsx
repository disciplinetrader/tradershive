import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bot,
  BookOpen,
  GraduationCap,
  Home,
  LineChart,
  Menu,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  Swords,
  Film,
  Trophy,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Topbar } from "./topbar";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { APP_NAME } from "@/lib/constants";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ProductTourProvider } from "@/components/tour/ProductTour";


type NavItem = { to: string; label: string; icon: typeof Home; admin?: boolean };

// UX Sprint 1 — flat, 8-item information architecture.
// Old destinations that are no longer surfaced in the sidebar remain
// reachable via deep links, command palette, and in-page entry points:
//   • /paper-trading  → redirects to /trading (Trading Workspace)
//   • /goals          → accessible from Dashboard & Analytics
//   • /mistakes       → accessible from AI Coach
//   • /playbooks, /strategies/playbooks → accessible from AI Coach
//   • /achievements   → accessible from Profile / Community
//   • /education      → moved to Help / Docs surface
//   • /marketplace    → hidden until production
const PRIMARY: NavItem[] = [{ to: "/dashboard", label: "Dashboard", icon: Home }];

const TRADING: NavItem[] = [
  { to: "/trading", label: "Trading Workspace", icon: LineChart },
  { to: "/replay", label: "Replay Studio", icon: Film },
  { to: "/practice", label: "Practice", icon: Dumbbell },
];

const WORK: NavItem[] = [
  { to: "/journal", label: "Journal", icon: BookOpen },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/ai/coach", label: "AI Coach", icon: Bot },
];

const COMPETE: NavItem[] = [
  { to: "/prop-challenges", label: "Prop Firm", icon: GraduationCap },
  { to: "/championship", label: "Championships", icon: Trophy },
  { to: "/battle-arena", label: "Battle Arena", icon: Swords },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
];

const COMMUNITY: NavItem[] = [
  { to: "/community", label: "Community", icon: MessageSquare },
];

const SYSTEM_ITEMS: NavItem[] = [
  { to: "/settings", label: "Settings", icon: Settings },
];

const ADMIN_ITEMS: NavItem[] = [{ to: "/admin", label: "Admin", icon: Shield, admin: true }];

/** Sidebar links tagged so the product tour can spotlight them. */
const TOUR_TARGETS: Record<string, string | undefined> = {
  "/replay": "nav-replay",
  "/trading": "nav-trading",
  "/journal": "nav-journal",
  "/analytics": "nav-analytics",
  "/community": "nav-community",
  "/ai/coach": "nav-ai-coach",
};

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [railHovered, setRailHovered] = useState(false);
  const { isAdmin, profile, loading } = useAuth();
  const { open, setOpen } = useCommandPalette();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();

  // Immersive workspaces: chart is the hero; sidebar shrinks to icon rail
  // (hover-to-expand overlay) and page chrome is minimized.
  const immersive =
    pathname === "/trading" ||
    pathname.startsWith("/trading/") ||
    pathname === "/replay/studio" ||
    pathname.startsWith("/replay/studio/");

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
    setRailHovered(false);
  }, [pathname]);

  // Redirect users who haven't completed onboarding
  useEffect(() => {
    if (loading) return;
    if (profile && profile.onboarded === false && pathname !== "/onboarding") {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [loading, profile, pathname, navigate]);

  const effectiveCollapsed = immersive ? !railHovered : collapsed;

  return (
    <ProductTourProvider>
    <div className="relative flex min-h-dvh w-full bg-background">

      <a href="#main" className="skip-link">Skip to content</a>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[700px] app-aurora opacity-90" aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-0 grid-bg opacity-30 [mask-image:radial-gradient(60%_50%_at_50%_20%,black,transparent)]" aria-hidden />


      {/* Desktop sidebar — sticky on standard routes, floating icon rail with hover-expand on immersive routes */}
      <aside
        data-app-shell-sidebar
        onMouseEnter={immersive ? () => setRailHovered(true) : undefined}
        onMouseLeave={immersive ? () => setRailHovered(false) : undefined}
        className={cn(
          "hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:block",
          immersive
            ? cn(
                "fixed left-0 top-0 z-40 h-dvh",
                railHovered ? "w-[248px] shadow-2xl" : "w-[64px]",
              )
            : cn(
                "sticky top-0 z-30 h-dvh shrink-0",
                collapsed ? "w-[72px]" : "w-[248px]",
              ),
        )}
        aria-label="Primary"
      >
        <SidebarInner
          collapsed={effectiveCollapsed}
          onToggle={() => setCollapsed((v) => !v)}
          showAdmin={isAdmin}
          currentPath={pathname}
          hideToggle={immersive}
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
            className="absolute inset-y-0 left-0 w-[280px] border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl"
          >
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" aria-hidden />
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

      {/* Main column — pushed right by the icon rail on immersive routes */}
      <div
        data-app-shell-main
        className={cn(
          "relative z-10 flex min-w-0 flex-1 flex-col",
          immersive && "md:pl-[64px]",
        )}
      >
        {!immersive && (
          <div data-app-shell-topbar>
            <Topbar
              onMenuClick={() => setMobileOpen(true)}
              onSearchClick={() => setOpen(true)}
            />
          </div>
        )}
        <main
          id="main"
          className={cn(
            "flex-1",
            immersive ? "pb-20 md:pb-0" : "page-x page-y pb-28 md:pb-10",
          )}
        >
          <div className={cn("mx-auto w-full", immersive ? "max-w-none" : "max-w-[1600px]")}>{children}</div>
        </main>
        {/* Mobile bottom nav */}
        <div data-app-shell-mobilenav>
          <MobileBottomNav currentPath={pathname} onMenuClick={() => setMobileOpen(true)} />
        </div>
      </div>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
    </ProductTourProvider>
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
  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={80}>
      <div className="flex h-full flex-col">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-4">
          <Link to="/dashboard" className="flex min-w-0 items-center gap-2">
            <img
              src="/logo.png"
              alt="TradersHIVE Arena"
              className="h-8 w-8 shrink-0 rounded-full object-cover shadow-elegant"
            />

            {!collapsed ? (
              <span className="truncate text-sm font-bold tracking-tight text-sidebar-foreground">{APP_NAME}</span>
            ) : null}
          </Link>
          {!hideToggle ? (
            <button
              onClick={onToggle}
              className="ml-auto hidden h-8 w-8 place-items-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:grid"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          ) : null}
        </div>

        <nav className={cn("flex-1 overflow-y-auto", collapsed ? "px-2 py-3" : "p-3")}>
          <NavSection items={PRIMARY} collapsed={collapsed} currentPath={currentPath} />
          <NavSection label="Trading" items={TRADING} collapsed={collapsed} currentPath={currentPath} className="mt-5" />
          <NavSection items={WORK} collapsed={collapsed} currentPath={currentPath} className="mt-5" />
          <NavSection label="Compete" items={COMPETE} collapsed={collapsed} currentPath={currentPath} className="mt-5" />
          <NavSection items={COMMUNITY} collapsed={collapsed} currentPath={currentPath} className="mt-5" />
          <NavSection
            items={showAdmin ? [...SYSTEM_ITEMS, ...ADMIN_ITEMS] : SYSTEM_ITEMS}
            collapsed={collapsed}
            currentPath={currentPath}
            className="mt-5"
          />
        </nav>

        {!collapsed ? (
          <div className="m-3 rounded-md border border-sidebar-border bg-sidebar-accent/50 p-4">
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
    </TooltipProvider>
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

function NavSection({
  label,
  items,
  collapsed,
  currentPath,
  className,
}: {
  label?: string;
  items: NavItem[];
  collapsed: boolean;
  currentPath: string;
  className?: string;
}) {
  return (
    <div className={cn(collapsed ? "" : "pt-1", className)}>
      {label ? <SectionLabel collapsed={collapsed}>{label}</SectionLabel> : null}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} active={isActive(currentPath, item.to)} />
        ))}
      </ul>
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
  const tourId = TOUR_TARGETS[item.to];
  const link = (
    <Link
      to={item.to}
      data-tour={tourId}
      aria-current={active ? "page" : undefined}

      className={cn(
        "group relative flex items-center gap-3 rounded-md text-sm font-medium outline-none transition-colors duration-150",
        "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-0",
        collapsed ? "h-10 w-full justify-center px-0" : "px-3 py-2",
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      {active ? (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-y-1 left-0 w-[3px] rounded-r-full bg-primary"
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        />
      ) : null}
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-colors",
          active ? "text-primary" : "group-hover:text-foreground",
        )}
      />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
      {item.admin && !collapsed ? (
        <span className="ml-auto rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary">
          ADMIN
        </span>
      ) : null}
    </Link>
  );

  if (!collapsed) return <li>{link}</li>;

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent
          side="right"
          sideOffset={12}
          collisionPadding={8}
          className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg"
        >
          {item.label}
          {item.admin ? (
            <span className="ml-2 rounded-sm bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary">
              ADMIN
            </span>
          ) : null}
        </TooltipContent>
      </Tooltip>
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
    { to: "/trading", label: "Trade", icon: LineChart },
    { to: "/journal", label: "Journal", icon: BookOpen },
    { to: "/leaderboard", label: "Rank", icon: Trophy },
  ];
  return (
    <nav aria-label="Primary mobile" className="sticky bottom-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-xl safe-bottom md:hidden">
      <div className="mx-auto grid w-full max-w-md grid-cols-5 items-stretch px-1 pt-0">

        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(currentPath, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-tight transition",
                active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? (
                <motion.span
                  layoutId="mobile-nav-active"
                  className="absolute inset-x-4 top-0 h-[2px] rounded-full bg-primary"
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                />
              ) : null}
              <Icon className="h-[18px] w-[18px]" aria-hidden />
              {item.label}
            </Link>
          );
        })}
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-semibold uppercase tracking-tight text-muted-foreground hover:text-foreground"
        >
          <Menu className="h-[18px] w-[18px]" aria-hidden />
          More
        </button>
      </div>
    </nav>
  );
}
