import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  Bookmark, Compass, Flame, Home, Users, Lightbulb, GraduationCap,
  UsersRound, Video, Trophy, Star,
} from "lucide-react";

const TABS = [
  { to: "/community", label: "Home", icon: Home, exact: true },
  { to: "/community/explore", label: "Explore", icon: Compass },
  { to: "/community/ideas", label: "Ideas", icon: Lightbulb },
  { to: "/community/mentors", label: "Mentors", icon: GraduationCap },
  { to: "/community/groups", label: "Study Groups", icon: UsersRound },
  { to: "/community/live", label: "Live", icon: Video },
  { to: "/community/challenges", label: "Challenges", icon: Trophy },
  { to: "/community/reviews", label: "Reviews", icon: Star },
  { to: "/community/following", label: "Following", icon: Users },
  { to: "/community/trending", label: "Trending", icon: Flame },
  { to: "/community/bookmarks", label: "Bookmarks", icon: Bookmark },
];

export const Route = createFileRoute("/_authenticated/community")({
  head: () => ({
    meta: [
      { title: "Community — TradersHIVE Arena" },
      { name: "description", content: "Trade ideas, mentors, study groups, live sessions and community challenges for serious traders." },
    ],
  }),
  component: Layout,
});

function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4">
      <nav className="no-scrollbar -mx-1 overflow-x-auto px-1">
        <div className="inline-flex snap-x items-center gap-1 rounded-md border border-border/60 bg-card/60 p-1.5">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
            const Icon = t.icon;
            return (
              <Link key={t.to} to={t.to}
                className={cn(
                  "inline-flex shrink-0 snap-start items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition",
                  active ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:bg-background/40 hover:text-foreground",
                )}>
                <Icon className="h-4 w-4" /> {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
