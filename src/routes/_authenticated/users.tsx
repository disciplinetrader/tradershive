import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { LeagueBadge } from "@/components/social/LeagueBadge";
import { CountryFlag } from "@/components/social/CountryFlag";
import { FollowButton } from "@/components/social/FollowButton";
import { searchUsers } from "@/lib/social.functions";
import { COUNTRIES, LEAGUES, MARKETS, TRADING_STYLES } from "@/lib/constants";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Discover Traders — TradersHIVE Arena" }] }),
  component: UsersPage,
});

const ALL = "__all__";

function UsersPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState<string | null>(null);
  const [league, setLeague] = useState<string | null>(null);
  const [market, setMarket] = useState<string | null>(null);
  const [tradingStyle, setTradingStyle] = useState<string | null>(null);
  const [sort, setSort] = useState<"xp" | "newest" | "streak">("xp");

  const fn = useServerFn(searchUsers);
  const { data, isLoading } = useQuery({
    queryKey: ["users-search", q, country, league, market, tradingStyle, sort],
    queryFn: () => fn({ data: { q, country, league, market, tradingStyle, sort, limit: 48 } }),
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Discover Traders" description="Search, filter, and follow other traders." />

      <GlassCard className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by username or name" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <PickList value={country} onChange={setCountry} placeholder="Country" options={COUNTRIES.map((c) => ({ value: c, label: c }))} width="w-[170px]" />
          <PickList value={league} onChange={setLeague} placeholder="League" options={LEAGUES.map((l) => ({ value: l, label: l.toUpperCase() }))} width="w-[140px]" />
          <PickList value={market} onChange={setMarket} placeholder="Market" options={MARKETS.map((m) => ({ value: m.value, label: m.label }))} width="w-[140px]" />
          <PickList value={tradingStyle} onChange={setTradingStyle} placeholder="Style" options={TRADING_STYLES.map((s) => ({ value: s.value, label: s.label }))} width="w-[140px]" />
          <Select value={sort} onValueChange={(v) => setSort(v as any)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="xp">Most XP</SelectItem>
              <SelectItem value="streak">Longest streak</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </GlassCard>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState title="No traders found" description="Try adjusting filters." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.map((u: any) => {
            const isMe = user?.id === u.id;
            const name = u.display_name || u.username;
            return (
              <GlassCard key={u.id} className="p-4">
                <div className="flex items-center gap-3">
                  <Link to="/profile/$username" params={{ username: u.username }}>
                    <Avatar className="h-12 w-12 border border-border">
                      <AvatarImage src={u.avatar_url ?? undefined} />
                      <AvatarFallback>{u.username.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link to="/profile/$username" params={{ username: u.username }} className="block truncate text-sm font-semibold hover:text-primary">{name}</Link>
                    <div className="truncate text-[11px] text-muted-foreground">@{u.username} · Lvl {u.level}</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <LeagueBadge league={u.league} size="xs" />
                  <CountryFlag country={u.country} />
                  <span className="ml-auto font-mono text-xs text-muted-foreground">{u.xp.toLocaleString()} XP</span>
                </div>
                <div className="mt-3">
                  <FollowButton userId={u.id} isSelf={isMe} className="w-full" />
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PickList({ value, onChange, placeholder, options, width }: {
  value: string | null; onChange: (v: string | null) => void; placeholder: string; options: { value: string; label: string }[]; width: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger className={width}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value={ALL}>{placeholder} · All</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
