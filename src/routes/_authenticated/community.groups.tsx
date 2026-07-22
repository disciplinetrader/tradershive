import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createGroup, listGroups } from "@/lib/community-groups.functions";

export const Route = createFileRoute("/_authenticated/community/groups")({
  head: () => ({
    meta: [
      { title: "Study Groups — Community" },
      { name: "description", content: "Public and private trading study groups with realtime chat, shared replays and challenges." },
    ],
  }),
  component: GroupsPage,
});

function GroupsPage() {
  const fn = useServerFn(listGroups);
  const [scope, setScope] = useState<"discover" | "mine">("discover");
  const [q, setQ] = useState("");
  const list = useQuery({ queryKey: ["community", "groups", scope, q], queryFn: () => fn({ data: { scope, q } }) });

  return (
    <div className="space-y-4">
      <PageHeader title="Study Groups" description="Learn together — chat, share replays, set goals and run internal leaderboards."
        actions={<CreateGroupDialog />} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-border/60 bg-card/60">
          {(["discover", "mine"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-3 py-1.5 text-xs capitalize ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {s === "mine" ? "My groups" : "Discover"}
            </button>
          ))}
        </div>
        <Input placeholder="Search groups…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </div>

      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : (list.data?.groups ?? []).length === 0 ? (
        <EmptyState icon={Users} title="No groups yet"
          description={scope === "mine" ? "You haven't joined any groups yet." : "Be the first to create one."} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data!.groups.map((g: any) => (
            <Link key={g.id} to="/community/groups/$slug" params={{ slug: g.slug }}>
              <GlassCard className="h-full p-4 hover:border-primary/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{g.name}</div>
                    <div className="text-[11px] text-muted-foreground">{g.member_count} members · {g.visibility}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] capitalize">{g.visibility}</Badge>
                </div>
                {g.description ? <div className="mt-2 line-clamp-3 text-xs text-muted-foreground">{g.description}</div> : null}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(g.tags ?? []).slice(0, 6).map((t: string) => (
                    <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]">#{t}</span>
                  ))}
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateGroupDialog() {
  const qc = useQueryClient();
  const fn = useServerFn(createGroup);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "invite">("public");
  const [tags, setTags] = useState("");
  const mut = useMutation({
    mutationFn: () => fn({ data: { name, description: desc || undefined, visibility,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean) } }),
    onSuccess: () => {
      toast.success("Group created");
      qc.invalidateQueries({ queryKey: ["community", "groups"] });
      setOpen(false); setName(""); setDesc(""); setTags("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />New group</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create study group</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label className="text-xs">Description</Label><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div><Label className="text-xs">Tags (comma separated)</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="ict, forex, beginners" /></div>
          <div>
            <Label className="text-xs">Visibility</Label>
            <div className="mt-1 flex gap-1 rounded-lg border border-border/50 p-1">
              {(["public", "private", "invite"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setVisibility(v)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs capitalize ${visibility === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{v}</button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={mut.isPending || !name} onClick={() => mut.mutate()}>{mut.isPending ? "Creating…" : "Create"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
