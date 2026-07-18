import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { listCategories, listTrending } from "@/lib/community.functions";
import { Flame, Hash, TrendingUp } from "lucide-react";

export function CommunitySidebar({ activeCategory }: { activeCategory?: string }) {
  const catsFn = useServerFn(listCategories);
  const trendFn = useServerFn(listTrending);
  const cats = useQuery({ queryKey: ["community", "categories"], queryFn: () => catsFn(), staleTime: 5 * 60_000 });
  const trend = useQuery({ queryKey: ["community", "trending-sidebar"], queryFn: () => trendFn(), refetchInterval: 60_000 });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Hash className="h-3.5 w-3.5" /> Categories
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {cats.isLoading ? (
            Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)
          ) : (
            (cats.data?.categories ?? []).map((c: any) => (
              <Link
                key={c.id}
                to="/community"
                search={{ category: c.slug } as any}
                className={`truncate rounded-lg px-2 py-1.5 text-xs font-medium transition hover:bg-muted ${
                  activeCategory === c.slug ? "bg-primary/10 text-primary" : "text-muted-foreground"
                }`}
                style={activeCategory === c.slug ? { color: c.color } : undefined}
              >
                {c.name}
                <span className="ml-1 text-[10px] opacity-60">{c.post_count}</span>
              </Link>
            ))
          )}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Flame className="h-3.5 w-3.5" /> Trending traders
        </div>
        <div className="space-y-2.5">
          {trend.isLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />) : null}
          {(trend.data?.traders ?? []).map((t: any) => {
            const p = t.profile ?? {};
            return (
              <Link key={t.user_id} to="/community/profile/$username" params={{ username: p.username ?? "" }} className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted">
                <Avatar className="h-7 w-7 border border-border">
                  <AvatarImage src={p.avatar_url ?? undefined} />
                  <AvatarFallback>{(p.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{p.display_name || p.username}</div>
                  <div className="truncate text-[10px] text-muted-foreground">Lvl {p.level ?? 0} · {t.reputation_score} rep</div>
                </div>
              </Link>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" /> Popular tags
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(trend.data?.tags ?? []).map((t: any) => (
            <Link key={t.slug} to="/community" search={{ hashtag: t.slug } as any} className="rounded-md bg-muted px-2 py-1 text-xs font-medium hover:bg-primary/10 hover:text-primary">
              #{t.name} <span className="opacity-60">{t.post_count}</span>
            </Link>
          ))}
          {!trend.data?.tags?.length ? <div className="text-xs text-muted-foreground">No trending tags yet.</div> : null}
        </div>
      </GlassCard>
    </div>
  );
}
