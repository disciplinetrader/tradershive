import { Bell, Flame, Menu, Moon, Sparkles, Sun } from "lucide-react";
import { InlineSearch } from "@/components/ui/inline-search";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useEffect, useState } from "react";
import { xpForLevel } from "@/lib/constants";
import { XPBar } from "@/components/ui/xp-bar";
import { toast } from "sonner";

export function Topbar({
  onMenuClick,
  onSearchClick,
}: {
  onMenuClick: () => void;
  onSearchClick: () => void;
}) {
  const { profile, user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(/mac/i.test(navigator.platform));
  }, []);

  const displayName = profile?.display_name || profile?.username || user?.email || "Trader";
  const initials =
    displayName
      .split(" ")
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "T";

  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl safe-top">
      <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <button
          onClick={onMenuClick}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        {/* Search — inline expandable on mobile, palette pill on desktop */}
        <InlineSearch onOpenPalette={onSearchClick} isMac={isMac} />


        {/* XP / Level / Streak — desktop */}
        <div className="hidden items-center gap-4 lg:flex">
          <div className="w-48">
            <XPBar
              level={profile?.level ?? 1}
              xp={profile?.xp ?? 0}
              needed={xpForLevel(profile?.level ?? 1)}
            />
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1.5 text-xs font-semibold">
            <Flame className="h-3.5 w-3.5 text-warning" />
            <span>{profile?.streak ?? 0}</span>
            <span className="text-muted-foreground">day streak</span>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface/60 text-muted-foreground transition hover:text-foreground"
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
        </button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="relative grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface/60 text-muted-foreground transition hover:text-foreground"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" aria-hidden />
              <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 glass-strong">
            <DropdownMenuLabel className="flex items-center justify-between">
              Notifications
              <span className="text-[10px] font-normal text-muted-foreground">Realtime</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary" />
              You&apos;re all caught up.
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Avatar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button aria-label="Account menu" className="rounded-full ring-offset-background transition hover:ring-2 hover:ring-primary/50 hover:ring-offset-2">
              <Avatar className="h-10 w-10 border border-border">
                <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                <AvatarFallback className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64 glass-strong">
            <div className="px-2 py-2">
              <p className="truncate text-sm font-semibold">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/profile">Profile</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/settings">Settings</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/support">Support</Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await signOut();
                toast.success("Signed out");
                await navigate({ to: "/auth", replace: true });
              }}
              className="text-danger focus:text-danger"
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
