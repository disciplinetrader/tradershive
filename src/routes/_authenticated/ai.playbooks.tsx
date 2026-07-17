import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { generatePlaybook, listPlaybooks, togglePlaybookPin, deletePlaybook } from "@/lib/ai.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pin, PinOff, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ai/playbooks")({ component: PlaybooksPage });

function PlaybooksPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listPlaybooks);
  const genFn = useServerFn(generatePlaybook);
  const pinFn = useServerFn(togglePlaybookPin);
  const delFn = useServerFn(deletePlaybook);
  const [topic, setTopic] = useState("");

  const q = useQuery({ queryKey: ["ai", "playbooks"], queryFn: () => listFn() });
  const gen = useMutation({
    mutationFn: () => genFn({ data: { topic } }),
    onSuccess: () => { toast.success("Playbook generated"); setTopic(""); qc.invalidateQueries({ queryKey: ["ai", "playbooks"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const pin = useMutation({
    mutationFn: (v: { id: string; pinned: boolean }) => pinFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "playbooks"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai", "playbooks"] }),
  });

  return (
    <div className="space-y-6">
      <Card className="bg-card/60 backdrop-blur-md">
        <CardHeader><CardTitle>Generate a new playbook</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. My EURUSD London breakout strategy" />
          <Button onClick={() => gen.mutate()} disabled={!topic.trim() || gen.isPending}>
            <Sparkles className="mr-1.5 h-4 w-4" /> {gen.isPending ? "Generating…" : "Generate"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(q.data ?? []).map((pb: any) => (
          <Card key={pb.id} className="bg-card/60 backdrop-blur-md">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{pb.title}</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{pb.category} · review {pb.review_frequency}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => pin.mutate({ id: pb.id, pinned: !pb.pinned })}>
                  {pb.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => del.mutate(pb.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{pb.description}</p>
              <Section title="Rules" items={pb.rules as string[]} />
              <Section title="Checklist" items={pb.checklist as string[]} />
              <Section title="Mistakes to avoid" items={pb.mistakes_to_avoid as string[]} />
            </CardContent>
          </Card>
        ))}
        {(q.data ?? []).length === 0 && (
          <Card className="bg-card/60 backdrop-blur-md md:col-span-2 xl:col-span-3">
            <CardContent className="p-8 text-center text-muted-foreground text-sm">No playbooks yet. Generate one above.</CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
      <ul className="list-disc pl-5 space-y-1">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}
