import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ShieldCheck, Target } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createChallengeInstance,
  evaluateChallengeInstance,
  listChallengeInstances,
  listChallengeTemplates,
} from "@/lib/challenge.functions";

export const Route = createFileRoute("/_authenticated/practice/challenges")({
  head: () => ({
    meta: [
      { title: "Personal challenges — TradersHIVE" },
      { name: "description", content: "Rule-based personal trading challenges evaluated server-side against your closed trades." },
      { property: "og:title", content: "Personal challenges — TradersHIVE" },
      { property: "og:description", content: "Server-authoritative challenge rules with transparent enforcement labels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChallengesPage,
});

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  passed: "default",
  failed: "destructive",
  at_risk: "secondary",
  active: "outline",
};

function ChallengesPage() {
  const queryClient = useQueryClient();
  const templatesFn = useServerFn(listChallengeTemplates);
  const instancesFn = useServerFn(listChallengeInstances);
  const createFn = useServerFn(createChallengeInstance);
  const evalFn = useServerFn(evaluateChallengeInstance);

  const templates = useQuery({ queryKey: ["challenge", "templates"], queryFn: () => templatesFn({}) });
  const instances = useQuery({ queryKey: ["challenge", "instances"], queryFn: () => instancesFn({}) });

  const start = useMutation({
    mutationFn: (templateId: string) => createFn({ data: { template_id: templateId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["challenge"] });
      toast.success("Challenge started");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = useMutation({
    mutationFn: (id: string) => evalFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["challenge", "instances"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4" /> Your challenges</CardTitle>
          <CardDescription>Rules are evaluated on the server from your closed trades — the client never decides pass or fail.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {instances.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (instances.data ?? []).length === 0 ? (
            <EmptyState
              compact
              icon={Target}
              title="No active challenge"
              description="Start a challenge below to trade under explicit drawdown, loss and target rules."
            />
          ) : (
            (instances.data ?? []).map((i: any) => {
              const ev = i.evaluation ?? {};
              const rules = ev.rules ?? [];
              return (
                <div key={i.id} className="rounded-md border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium">
                      {i.name}
                      <Badge variant={STATUS_VARIANT[i.status] ?? "outline"}>{i.status}</Badge>
                      {ev.evaluatorVersion ? <span className="text-xs text-muted-foreground">{ev.evaluatorVersion}</span> : null}
                    </div>
                    <Button size="sm" variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate(i.id)}>
                      Re-evaluate
                    </Button>
                  </div>
                  {typeof ev.progress?.targetPct === "number" ? (
                    <div className="mt-2 space-y-1">
                      <Progress value={Math.max(0, Math.min(100, ev.progress.targetPct))} />
                      <p className="text-xs text-muted-foreground">Profit target progress</p>
                    </div>
                  ) : null}
                  <ul className="mt-3 space-y-1 text-sm">
                    {rules.map((r: any) => (
                      <li key={r.ruleId} className="flex items-center gap-2">
                        {r.status === "fail" ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-danger" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span>{r.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {r.status}
                          {r.enforcement === "not_verifiable" ? " · not verifiable from trade data" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Templates</CardTitle>
          <CardDescription>Each template states exactly which rules are enforced and which are informational.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {templates.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            (templates.data ?? []).map((t: any) => (
              <div key={t.id} className="rounded-md border border-border/60 p-3">
                <div className="flex items-center gap-2 font-medium">
                  {t.name}
                  <Badge variant="outline">v{t.version ?? 1}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <Button className="mt-3" size="sm" disabled={start.isPending} onClick={() => start.mutate(t.id)}>
                  Start challenge
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
