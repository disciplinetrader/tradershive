import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { xpForLevel, ROLE_LABEL } from "@/lib/constants";
import { XPBar } from "@/components/ui/xp-bar";
import { Flame, Sparkles, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — TradersHIVE Arena" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, user, roles } = useAuth();
  const name = profile?.display_name || profile?.username || "Trader";
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your public trader identity." />

      <GlassCard className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 gradient-radial-glow opacity-50" />
        <div className="relative grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <Avatar className="h-24 w-24 border border-border shadow-elegant">
            <AvatarImage src={profile?.avatar_url ?? undefined} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary-glow text-2xl font-bold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-bold">{name}</h2>
              {roles.map((r) => (
                <Badge key={r} variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                  {ROLE_LABEL[r]}
                </Badge>
              ))}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">@{profile?.username}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
            <div className="mt-4 max-w-md">
              <XPBar
                level={profile?.level ?? 1}
                xp={profile?.xp ?? 0}
                needed={xpForLevel(profile?.level ?? 1)}
              />
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Level" value={profile?.level ?? 1} icon={Sparkles} hint="Season 1" />
        <StatCard label="XP" value={(profile?.xp ?? 0).toLocaleString()} icon={Sparkles} />
        <StatCard label="League" value={(profile?.league ?? "bronze").toString().toUpperCase()} icon={Trophy} />
        <StatCard label="Streak" value={`${profile?.streak ?? 0}d`} icon={Flame} />
      </div>
    </div>
  );
}
