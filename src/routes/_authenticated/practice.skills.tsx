import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { listSkillProgress } from "@/lib/practice.functions";

export const Route = createFileRoute("/_authenticated/practice/skills")({
  head: () => ({
    meta: [
      { title: "Skill progression — TradersHIVE" },
      { name: "description", content: "Skill progression derived from scored practice attempts, with sample sizes and confidence." },
      { property: "og:title", content: "Skill progression — TradersHIVE" },
      { property: "og:description", content: "Evidence-based trading skill progression from your practice history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SkillsPage,
});

function SkillsPage() {
  const fn = useServerFn(listSkillProgress);
  const q = useQuery({ queryKey: ["practice", "skills"], queryFn: () => fn({}) });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  const rows = q.data ?? [];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No skill data yet"
        description="Complete a scored drill and your progression will build here — derived from attempts, never a stored guess."
        action={{ label: "Browse drills", href: "/practice/drills" }}
      />
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map((s: any) => (
        <Card key={s.skill}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base capitalize">
              {String(s.skill).replace(/_/g, " ")}
              <Badge variant={s.confidence === "insufficient" ? "secondary" : "outline"}>{s.confidence}</Badge>
            </CardTitle>
            <CardDescription>
              {s.attempts} attempt(s) · {s.scoreVersion ?? "unversioned"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={typeof s.latest === "number" ? s.latest : 0} />
            <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
              <div>Latest<div className="text-sm text-foreground">{s.latest ?? "—"}</div></div>
              <div>Best<div className="text-sm text-foreground">{s.best ?? "—"}</div></div>
              <div>Average<div className="text-sm text-foreground">{s.average ?? "—"}</div></div>
              <div>Delta<div className="text-sm text-foreground">{s.delta ?? "—"}</div></div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
