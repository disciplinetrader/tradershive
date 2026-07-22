import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Video, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createLiveSession, listLiveSessions, rsvpLive } from "@/lib/community-live.functions";

export const Route = createFileRoute("/_authenticated/community/live")({
  head: () => ({
    meta: [
      { title: "Live Sessions — Community" },
      { name: "description", content: "Upcoming and live trading sessions: analysis, review, Q&A, workshops." },
    ],
  }),
  component: LivePage,
});

const SCOPES = ["upcoming", "live", "past", "mine"] as const;

function LivePage() {
  const fn = useServerFn(listLiveSessions);
  const [scope, setScope] = useState<(typeof SCOPES)[number]>("upcoming");
  const q = useQuery({ queryKey: ["community", "live", scope], queryFn: () => fn({ data: { scope } }), refetchInterval: 60_000 });

  return (
    <div className="space-y-4">
      <PageHeader title="Live sessions" description="Analysis, reviews, Q&A and workshops from mentors and community leaders."
        actions={<HostSessionDialog />} />

      <div className="inline-flex overflow-hidden rounded-lg border border-border/60 bg-card/60">
        {SCOPES.map((s) => (
          <button key={s} onClick={() => setScope(s)}
            className={`px-3 py-1.5 text-xs capitalize ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
            {s}
          </button>
        ))}
      </div>

      {q.isLoading ? <Skeleton className="h-40" /> : (q.data?.sessions ?? []).length === 0 ? (
        <EmptyState icon={Video} title="Nothing scheduled" description="Be the first to host a session." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {q.data!.sessions.map((s: any) => <SessionCard key={s.id} session={s} />)}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: any }) {
  const fn = useServerFn(rsvpLive);
  const qc = useQueryClient();
  const rsvp = useMutation({
    mutationFn: (r: "going" | "maybe" | "declined") => fn({ data: { session_id: session.id, rsvp: r } }),
    onSuccess: () => { toast.success("RSVP updated"); qc.invalidateQueries({ queryKey: ["community", "live"] }); },
  });
  const isLive = session.status === "live";
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{session.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="capitalize">{session.session_type.replace(/_/g, " ")}</span>
            {session.instrument ? <><span>·</span><span>{session.instrument}</span></> : null}
            <span>·</span>
            <span>{formatDistanceToNow(new Date(session.start_at), { addSuffix: true })}</span>
          </div>
        </div>
        <Badge className={isLive ? "bg-danger text-danger-foreground" : ""} variant={isLive ? "default" : "outline"}>
          {isLive ? "LIVE" : session.status}
        </Badge>
      </div>
      {session.description ? <div className="mt-2 line-clamp-3 text-xs text-muted-foreground">{session.description}</div> : null}
      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Avatar className="h-5 w-5">
            <AvatarImage src={session.host?.avatar_url ?? undefined} />
            <AvatarFallback>{(session.host?.username ?? "H").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          {session.host?.display_name ?? session.host?.username ?? "Host"} · {session.attendee_count ?? 0} going
        </div>
        <div className="flex gap-1">
          {isLive && session.stream_url ? (
            <Button asChild size="sm"><a href={session.stream_url} target="_blank" rel="noreferrer">Watch</a></Button>
          ) : (
            <>
              <Button size="sm" variant="outline" onClick={() => rsvp.mutate("going")}>Going</Button>
              <Button size="sm" variant="ghost" onClick={() => rsvp.mutate("maybe")}>Maybe</Button>
            </>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function HostSessionDialog() {
  const qc = useQueryClient();
  const fn = useServerFn(createLiveSession);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [instrument, setInstrument] = useState("");
  const [startAt, setStartAt] = useState("");
  const [stream, setStream] = useState("");
  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        title, description: desc || undefined, instrument: instrument || null,
        session_type: "analysis", start_at: new Date(startAt).toISOString(),
        stream_url: stream || null, visibility: "public",
      },
    }),
    onSuccess: () => {
      toast.success("Session scheduled");
      qc.invalidateQueries({ queryKey: ["community", "live"] });
      setOpen(false); setTitle(""); setDesc(""); setStartAt("");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" />Host session</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Host a live session</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Title *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label className="text-xs">Description</Label><Textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Instrument</Label><Input value={instrument} onChange={(e) => setInstrument(e.target.value)} placeholder="EURUSD" /></div>
            <div><Label className="text-xs">Start time *</Label><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Stream URL (Zoom, YouTube, Twitch…)</Label><Input value={stream} onChange={(e) => setStream(e.target.value)} /></div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={!title || !startAt || mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Scheduling…" : "Schedule"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
