import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bookmark, Compass, Flame, Home, Users, Lightbulb, GraduationCap,
  UsersRound, Video, Trophy, Star, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: LucideIcon; exact?: boolean };

export const COMMUNITY_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Feed",
    items: [
      { to: "/community", label: "Home", icon: Home, exact: true },
      { to: "/community/explore", label: "Explore", icon: Compass },
      { to: "/community/following", label: "Following", icon: Users },
      { to: "/community/trending", label: "Trending", icon: Flame },
      { to: "/community/bookmarks", label: "Saved", icon: Bookmark },
    ],
  },
  {
    label: "Trading",
    items: [
      { to: "/community/ideas", label: "Ideas", icon: Lightbulb },
      { to: "/community/reviews", label: "Reviews", icon: Star },
    ],
  },
  {
    label: "People",
    items: [
      { to: "/community/mentors", label: "Mentors", icon: GraduationCap },
      { to: "/community/groups", label: "Study Groups", icon: UsersRound },
    ],
  },
  {
    label: "Events",
    items: [
      { to: "/community/live", label: "Live", icon: Video },
      { to: "/community/challenges", label: "Challenges", icon: Trophy },
    ],
  },
];

const FLAT = COMMUNITY_GROUPS.flatMap((g) => g.items);

function useIsActive() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (item: NavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
}

/** Desktop vertical rail — the familiar left column of a social app. */
export function CommunityNavRail() {
  const isActive = useIsActive();
  return (
    <nav className="space-y-5">
      {COMMUNITY_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
            {group.label}
          </div>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )}
                >
                  <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-primary")} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Mobile / tablet chip strip. */
export function CommunityNavStrip() {
  const isActive = useIsActive();
  return (
    <nav className="no-scrollbar -mx-1 overflow-x-auto px-1 lg:hidden">
      <div className="inline-flex snap-x items-center gap-1.5">
        {FLAT.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/60 bg-card/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
