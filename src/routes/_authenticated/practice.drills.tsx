import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DRILLS } from "@/lib/practice/drills";
import { createPracticeAssignment } from "@/lib/practice.functions";

export const Route = createFileRoute("/_authenticated/practice/drills")({
  head: () => ({
    meta: [
      { title: "Trading drills — TradersHIVE" },
      { name: "description", content: "Versioned trading drills with explicit objectives, rules and objective scoring." },
      { property: "og:title", content: "Trading drills — TradersHIVE" },
      { property: "og:description", content: "Versioned drills with objective scoring on the replay engine." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DrillsPage,
});

function DrillsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const create = useServerFn(createPracticeAssignment);

  const start = useMutation({
    mutationFn: (drillId: string) => {
      const drill = DRILLS.find((d) => d.id === drillId)!;
      return create({
        data: {
          title: drill.title,
          description: drill.description,
          practice_type: "guided_drill",
          drill_id: drill.id,
          symbol: "EURUSD",
          market: "forex",
          timeframe: "5m",
          starting_balance: 10_000,
          created_source: "user",
        },
      });
    },
    onSuccess: (row: any) => {
      queryClient.invalidateQueries({ queryKey: ["practice"] });
      toast.success("Drill session created");
      if (row?.replay_session_id) navigate({ to: "/replay/studio", search: { id: row.replay_session_id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {DRILLS.map((d) => (
        <Card key={d.id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              {d.title}
              <Badge variant="outline">v{d.version}</Badge>
              <Badge variant="secondary">{d.skill.replace(/_/g, " ")}</Badge>
            </CardTitle>
            <CardDescription>{d.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1 text-sm text-muted-foreground">
              {d.objectives.map((o) => (
                <li key={o.id}>
                  • {o.label}{" "}
                  <span className="text-xs opacity-70">({o.kind === "objective" ? "measured" : "self-reported"})</span>
                </li>
              ))}
            </ul>
            <Button size="sm" disabled={start.isPending} onClick={() => start.mutate(d.id)}>
              Start drill
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
