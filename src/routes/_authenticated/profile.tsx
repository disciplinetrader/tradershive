import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { xpForLevel, ROLE_LABEL, MARKETS, TRADING_STYLES } from "@/lib/constants";
import { XPBar } from "@/components/ui/xp-bar";
import { AvatarUpload } from "@/components/auth/AvatarUpload";
import { Flame, Sparkles, Trophy, MapPin, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "Profile — TradersHIVE Arena" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, user, roles } = useAuth();
  const name =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    profile?.display_name ||
    profile?.username ||
    "Trader";
  const initials = name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const marketLabel = (v: string | null | undefined) =>
    MARKETS.find((m) => m.value === v)?.label ?? null;
  const styleLabel = (v: string | null | undefined) =>
    TRADING_STYLES.find((s) => s.value === v)?.label ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your public trader identity." />

      <GlassCard className="relative overflow-hidden p-6 md:p-8">
        <div className="pointer-events-none absolute inset-0 gradient-radial-glow opacity-50" />
        <div className="relative grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <AvatarUpload fallbackText={initials} size={96} />
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
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {profile?.country ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {profile.country}
                </span>
              ) : null}
              {profile?.timezone ? (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {profile.timezone}
                </span>
              ) : null}
              {styleLabel(profile?.trading_style) ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
                  {styleLabel(profile?.trading_style)}
                </span>
              ) : null}
            </div>
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

      {profile?.preferred_markets && profile.preferred_markets.length > 0 ? (
        <GlassCard className="p-6">
          <h3 className="text-sm font-semibold">Markets you trade</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {profile.preferred_markets.map((m) => (
              <Badge key={m} variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                {marketLabel(m) ?? m}
              </Badge>
            ))}
          </div>
        </GlassCard>
      ) : null}
    </div>
  );
}
