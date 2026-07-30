import { Link } from "@tanstack/react-router";
import { MapPin, Pencil, Sparkles, TrendingUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";

function completion(profile: ReturnType<typeof useAuth>["profile"]): number {
  if (!profile) return 0;
  const checks = [
    !!profile.display_name,
    !!profile.avatar_url,
    !!profile.country,
    !!profile.timezone,
    !!profile.experience,
    !!profile.trading_style,
    !!profile.preferred_market,
    !!(profile.preferred_markets && profile.preferred_markets.length),
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function ProfileSummary() {
  const { profile, user } = useAuth();
  const name = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Trader";
  const initials = name.slice(0, 2).toUpperCase();
  const pct = completion(profile);
  const league = (profile?.league ?? "bronze").toString();

  return (
    <div>
      <div className="flex items-center gap-3">
        <Avatar className="h-14 w-14 ring-2 ring-primary/30">
          {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt={name} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{name}</div>
          <div className="truncate text-xs text-muted-foreground">@{profile?.username}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary capitalize">{league}</Badge>
            <Badge variant="outline">{(profile?.xp ?? 0).toLocaleString()} XP</Badge>
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-1.5 text-xs">
        {profile?.country ? (
          <div className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {profile.country}</div>
        ) : null}
        {profile?.trading_style ? (
          <div className="flex items-center gap-2 text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" /> <span className="capitalize">{profile.trading_style}</span></div>
        ) : null}
        {profile?.preferred_market ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Sparkles className="h-3.5 w-3.5" /> <span className="capitalize">{profile.preferred_market}</span></div>
        ) : null}
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Profile completion</span>
          <span className="font-mono tabular-nums">{pct}%</span>
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>
      <Button asChild size="sm" variant="outline" className="mt-4 w-full">
        <Link to="/profile"><Pencil className="mr-2 h-3.5 w-3.5" /> Edit profile</Link>
      </Button>
    </div>
  );
}
