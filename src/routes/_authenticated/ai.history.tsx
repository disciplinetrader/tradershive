import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAiHistory } from "@/lib/ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GRADE_COLORS } from "@/lib/ai/constants";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/ai/history")({ component: HistoryPage });

function HistoryPage() {
  const fn = useServerFn(listAiHistory);
  const q = useQuery({ queryKey: ["ai", "history"], queryFn: () => fn() });
  const d = q.data;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Section title="Trade reviews">
        {(d?.trades ?? []).map((r: any) => (
          <div key={r.id} className="flex items-start justify-between gap-2 rounded-md border border-border/60 bg-background/40 p-2 text-sm">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {r.grade && <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold border", GRADE_COLORS[r.grade])}>{r.grade}</span>}
                <Link to="/ai/trade-review" className="line-clamp-1 hover:underline">{r.summary}</Link>
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
            </div>
          </div>
        ))}
      </Section>
      <Section title="Reports">
        {(d?.reports ?? []).map((r: any) => (
          <div key={r.id} className="rounded-md border border-border/60 bg-background/40 p-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{r.period}</Badge>
              <span className="font-medium">{r.title}</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{r.summary}</p>
          </div>
        ))}
      </Section>
      <Section title="Psychology">
        {(d?.psychology ?? []).map((r: any) => (
          <div key={r.id} className="rounded-md border border-border/60 bg-background/40 p-2 text-sm">
            <p className="line-clamp-2">{r.summary}</p>
            <div className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
          </div>
        ))}
      </Section>
      <Section title="Performance">
        {(d?.performance ?? []).map((r: any) => (
          <div key={r.id} className="rounded-md border border-border/60 bg-background/40 p-2 text-sm">
            <p className="line-clamp-2">{r.summary}</p>
            <div className="text-[10px] text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</div>
          </div>
        ))}
      </Section>
      <Section title="Recommendations" className="md:col-span-2">
        {(d?.recommendations ?? []).map((r: any) => (
          <div key={r.id} className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2 text-sm">
            <Badge variant={r.priority === "critical" || r.priority === "high" ? "destructive" : "secondary"}>{r.priority}</Badge>
            <span className="flex-1">{r.title}</span>
            <Badge variant="outline">{r.status}</Badge>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("bg-card/60 backdrop-blur-md", className)}>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">{children}</CardContent>
    </Card>
  );
}
