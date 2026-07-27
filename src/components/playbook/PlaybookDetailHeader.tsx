import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as icons from "lucide-react";
import { ArrowLeft, Pencil, PlayCircle, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { togglePlaybookFavorite } from "@/lib/playbook.functions";

export function PlaybookDetailHeader({
  strategy,
  onRunChecklist,
}: {
  strategy: any;
  onRunChecklist: () => void;
}) {
  const Icon = ((icons as any)[strategy.icon] ?? icons.BookMarked) as React.ComponentType<{ className?: string }>;
  const qc = useQueryClient();
  const toggle = useServerFn(togglePlaybookFavorite);
  const favMut = useMutation({
    mutationFn: async () => toggle({ data: { id: strategy.id, value: !strategy.is_favorite } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playbook", strategy.id] });
      qc.invalidateQueries({ queryKey: ["playbook-library"] });
    },
  });

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/60">
      <div className="relative h-40 w-full" style={{ background: `linear-gradient(135deg, ${strategy.color}33, ${strategy.color}0a)` }}>
        {strategy.cover_url ? (
          <img src={strategy.cover_url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-70" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
        <Link
          to="/strategies/playbooks"
          className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-xs backdrop-blur transition hover:bg-background"
        >
          <ArrowLeft className="h-3 w-3" /> Library
        </Link>
      </div>
      <div className="-mt-14 space-y-4 px-6 pb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div
            className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl border border-border/60 bg-card shadow-lg"
            style={{ color: strategy.color }}
          >
            <Icon className="h-8 w-8" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {strategy.category ? <Badge variant="secondary" className="text-[10px]">{strategy.category}</Badge> : null}
              <Badge variant="outline" className="text-[10px]">v{strategy.version}</Badge>
              {(strategy.markets ?? []).slice(0, 3).map((m: string) => (
                <Badge key={m} variant="outline" className="text-[10px]">{m}</Badge>
              ))}
              {(strategy.timeframes ?? []).slice(0, 4).map((tf: string) => (
                <Badge key={tf} className="bg-primary/10 text-[10px] text-primary hover:bg-primary/15">{tf}</Badge>
              ))}
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{strategy.name}</h1>
            {strategy.description ? (
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{strategy.description}</p>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => favMut.mutate()} aria-label="Favorite">
              <Star className={cn("h-4 w-4", strategy.is_favorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
            </Button>
            <Button variant="secondary" asChild>
              <Link to="/strategies/$id" params={{ id: strategy.id }}>
                <Pencil className="mr-2 h-4 w-4" /> Edit
              </Link>
            </Button>
            <Button onClick={onRunChecklist}>
              <PlayCircle className="mr-2 h-4 w-4" /> Run checklist
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
