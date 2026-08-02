import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { listCategories, listTrending } from "@/lib/community.functions";
import { Flame, Hash, TrendingUp } from "lucide-react";

function RailSection({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/50 bg-card/40 p-4">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      {children}
    </section>
  );
}

/** Right-hand discovery rail: categories, people to follow, trending tags. */
export function CommunitySidebar({ activeCategory }: { activeCategory?: string }) {
  const catsFn = useServerFn(listCategories);
  const trendFn = useServerFn(listTrending);
  const cats = useQuery({ queryKey: ["community", "categories"], queryFn: () => catsFn(), staleTime: 5 * 60_000 });
  const trend = useQuery({ queryKey: ["community", "trending-sidebar"], queryFn: () => trendFn(), refetchInterval: 60_000 });

  return (
    <div className="space-y-4">
      <RailSection icon={Hash} label="Categories">
        <div className="flex flex-wrap gap-1.5">
          {cats.isLoading
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)
            : (cats.data?.categories ?? []).map((c: any) => (
                <Link
                  key={c.id}
                  to="/community"
                  search={{ category: c.slug } as any}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    activeCategory === c.slug
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  }`}
                >
                  {c.name}
                  <span className="ml-1 opacity-50">{c.post_count}</span>
                </Link>
              ))}
        </div>
      </RailSection>

      <RailSection icon={Flame} label="Traders to follow">
        <div className="space-y-1">
          {trend.isLoading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />) : null}
          {(trend.data?.traders ?? []).map((t: any) => {
            const p = t.profile ?? {};
            return (
              <Link
                key={t.user_id}
                to="/community/profile/$username"
                params={{ username: p.username ?? "" }}
                className="flex items-center gap-2.5 rounded-xl p-1.5 transition hover:bg-muted/60"
              >
                <Avatar className="h-8 w-8 ring-1 ring-border/70">
                  <AvatarImage src={p.avatar_url ?? undefined} />
                  <AvatarFallback className="text-[10px]">{(p.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{p.display_name || p.username}</div>
                  <div className="truncate text-[10px] text-muted-foreground">Lvl {p.level ?? 0} · {t.reputation_score} rep</div>
                </div>
              </Link>
            );
          })}
          {!trend.isLoading && !trend.data?.traders?.length ? (
            <div className="text-xs text-muted-foreground">No active traders yet — be the first to post.</div>
          ) : null}
        </div>
      </RailSection>

      <RailSection icon={TrendingUp} label="Trending tags">
        <div className="flex flex-wrap gap-1.5">
          {(trend.data?.tags ?? []).map((t: any) => (
            <Link
              key={t.slug}
              to="/community"
              search={{ hashtag: t.slug } as any}
              className="rounded-full bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-primary/10 hover:text-primary"
            >
              #{t.name} <span className="opacity-50">{t.post_count}</span>
            </Link>
          ))}
          {!trend.data?.tags?.length ? <div className="text-xs text-muted-foreground">Nothing trending yet.</div> : null}
        </div>
      </RailSection>
    </div>
  );
}
