import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  getGroup, joinGroup, leaveGroup, listGroupMessages, sendGroupMessage, listGroupResources,
} from "@/lib/community-groups.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/community/groups/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — Study Group` },
      { name: "description", content: "Realtime chat, shared replays and shared journal for the study group." },
    ],
  }),
  component: GroupPage,
});

function GroupPage() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const getFn = useServerFn(getGroup);
  const msgsFn = useServerFn(listGroupMessages);
  const resFn = useServerFn(listGroupResources);
  const sendFn = useServerFn(sendGroupMessage);
  const joinFn = useServerFn(joinGroup);
  const leaveFn = useServerFn(leaveGroup);

  const group = useQuery({ queryKey: ["community", "group", slug], queryFn: () => getFn({ data: { slug } }) });
  const groupId = group.data?.group?.id;

  const messages = useQuery({
    queryKey: ["community", "group-msgs", groupId],
    queryFn: () => msgsFn({ data: { group_id: groupId! } }),
    enabled: !!groupId,
  });
  const resources = useQuery({
    queryKey: ["community", "group-res", groupId],
    queryFn: () => resFn({ data: { group_id: groupId! } }),
    enabled: !!groupId,
  });

  // Realtime subscribe to new messages
  useEffect(() => {
    if (!groupId) return;
    const ch = supabase
      .channel(`sg-${groupId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "study_group_messages", filter: `group_id=eq.${groupId}` },
        () => qc.invalidateQueries({ queryKey: ["community", "group-msgs", groupId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [groupId, qc]);

  const [body, setBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages.data]);

  const send = useMutation({
    mutationFn: () => sendFn({ data: { group_id: groupId!, body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["community", "group-msgs", groupId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const join = useMutation({
    mutationFn: () => joinFn({ data: { group_id: groupId! } }),
    onSuccess: () => { toast.success("Joined"); qc.invalidateQueries({ queryKey: ["community", "group", slug] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const leave = useMutation({
    mutationFn: () => leaveFn({ data: { group_id: groupId! } }),
    onSuccess: () => { toast.success("Left"); qc.invalidateQueries({ queryKey: ["community", "group", slug] }); },
  });

  if (group.isLoading) return <Skeleton className="h-96" />;
  if (!group.data?.group) return <EmptyState />;
  const g = group.data.group;
  const isMember = group.data.isMember;

  return (
    <div className="space-y-4">
      <PageHeader
        title={g.name}
        description={g.description ?? "Study group"}
        actions={isMember
          ? <Button size="sm" variant="outline" onClick={() => leave.mutate()}>Leave</Button>
          : <Button size="sm" onClick={() => join.mutate()} disabled={join.isPending}>Join group</Button>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <GlassCard className="flex h-[60vh] flex-col p-0">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.isLoading ? <Skeleton className="h-40" /> : (messages.data?.messages ?? []).length === 0 ? (
              <div className="text-center text-sm text-muted-foreground pt-20">No messages yet — say hi 👋</div>
            ) : (messages.data!.messages.map((m: any) => (
              <div key={m.id} className="flex items-start gap-2">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={m.author?.avatar_url ?? undefined} />
                  <AvatarFallback>{(m.author?.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="font-semibold">{m.author?.display_name ?? m.author?.username ?? "user"}</span>
                    <span className="text-muted-foreground">{new Date(m.created_at).toLocaleTimeString()}</span>
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm">{m.body}</div>
                </div>
              </div>
            )))}
          </div>
          {isMember && (
            <form
              className="flex gap-2 border-t border-border/50 p-3"
              onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}
            >
              <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message the group…" />
              <Button type="submit" size="sm" disabled={!body.trim() || send.isPending}><Send className="h-4 w-4" /></Button>
            </form>
          )}
        </GlassCard>

        <aside className="space-y-4">
          <GlassCard className="p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Users className="h-3.5 w-3.5" /> Members · {g.member_count}
            </div>
            <div className="mt-3 space-y-2">
              {(group.data.members ?? []).slice(0, 20).map((m: any) => (
                <div key={m.user_id} className="flex items-center gap-2 text-xs">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                    <AvatarFallback>{(m.profile?.username ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">{m.profile?.display_name ?? m.profile?.username}</span>
                  <Badge variant="outline" className="text-[10px] capitalize">{m.role}</Badge>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Shared resources</div>
            <div className="mt-3 space-y-2">
              {(resources.data?.resources ?? []).length === 0 ? (
                <div className="text-xs text-muted-foreground">No resources yet.</div>
              ) : (resources.data!.resources.map((r: any) => (
                <div key={r.id} className="rounded-lg border border-border/40 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{r.title ?? r.kind}</div>
                    <Badge variant="outline" className="text-[9px] capitalize">{r.kind}</Badge>
                  </div>
                  {r.note ? <div className="mt-1 text-muted-foreground">{r.note}</div> : null}
                  {r.url ? <a className="mt-1 block truncate text-primary hover:underline" href={r.url} target="_blank" rel="noreferrer">{r.url}</a> : null}
                </div>
              )))}
            </div>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}

function EmptyState() {
  return <GlassCard className="p-8 text-center text-sm text-muted-foreground">Group not found.</GlassCard>;
}
