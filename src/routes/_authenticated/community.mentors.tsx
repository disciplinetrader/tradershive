import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, GraduationCap, MessageSquarePlus, Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GlassCard } from "@/components/ui/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { listMentors, requestMentorship, upsertMentorProfile, getMyMentorProfile } from "@/lib/community-mentors.functions";

export const Route = createFileRoute("/_authenticated/community/mentors")({
  head: () => ({
    meta: [
      { title: "Mentors — Community" },
      { name: "description", content: "Find a trading mentor: personalized reviews, homework, live sessions and study plans." },
    ],
  }),
  component: MentorsPage,
});

function MentorsPage() {
  const listFn = useServerFn(listMentors);
  const meFn = useServerFn(getMyMentorProfile);
  const [q, setQ] = useState("");

  const list = useQuery({ queryKey: ["community", "mentors", q], queryFn: () => listFn({ data: { q } }) });
  const me = useQuery({ queryKey: ["community", "mentor-me"], queryFn: () => meFn() });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mentors"
        description="Verified traders offering reviews, homework and one-on-one guidance."
        actions={<BecomeMentorDialog current={me.data?.profile ?? null} />}
      />

      <Input placeholder="Search mentors…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />

      {list.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      ) : (list.data?.mentors ?? []).length === 0 ? (
        <EmptyState icon={GraduationCap} title="No mentors yet" description="Be the first — apply above." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.data!.mentors.map((m: any) => <MentorCard key={m.user_id} mentor={m} />)}
        </div>
      )}
    </div>
  );
}

function MentorCard({ mentor }: { mentor: any }) {
  const fn = useServerFn(requestMentorship);
  const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(false);
  const mut = useMutation({
    mutationFn: () => fn({ data: { mentor_id: mentor.user_id, message: msg || undefined } }),
    onSuccess: () => { toast.success("Request sent"); setOpen(false); setMsg(""); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12">
          <AvatarImage src={mentor.profile?.avatar_url ?? undefined} />
          <AvatarFallback>{(mentor.profile?.username ?? "M").slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-sm font-semibold">{mentor.profile?.display_name ?? mentor.profile?.username}</div>
            {mentor.verified ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : null}
          </div>
          {mentor.headline ? <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{mentor.headline}</div> : null}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" /> {Number(mentor.rating).toFixed(1)}
            <span>·</span>
            <span>{mentor.reviews_count} reviews</span>
            <span>·</span>
            <span>{mentor.mentees_count} mentees</span>
          </div>
        </div>
      </div>
      {mentor.bio ? <div className="mt-3 line-clamp-3 text-sm text-muted-foreground">{mentor.bio}</div> : null}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(mentor.markets ?? []).map((m: string) => (
          <Badge key={m} variant="outline" className="text-[10px] capitalize">{m}</Badge>
        ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" className="mt-3 w-full"><MessageSquarePlus className="mr-1 h-4 w-4" />Request mentorship</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Request mentorship</DialogTitle></DialogHeader>
          <Label className="text-xs">Message (optional)</Label>
          <Textarea rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Introduce yourself and what you'd like help with…" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Sending…" : "Send"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </GlassCard>
  );
}

function BecomeMentorDialog({ current }: { current: any }) {
  const qc = useQueryClient();
  const fn = useServerFn(upsertMentorProfile);
  const [open, setOpen] = useState(false);
  const [headline, setHeadline] = useState(current?.headline ?? "");
  const [bio, setBio] = useState(current?.bio ?? "");
  const [markets, setMarkets] = useState(((current?.markets ?? []) as string[]).join(", "));
  const [specialties, setSpecialties] = useState(((current?.specialties ?? []) as string[]).join(", "));
  const mut = useMutation({
    mutationFn: () => fn({
      data: {
        headline: headline || null, bio: bio || null,
        markets: markets.split(",").map((s) => s.trim()).filter(Boolean),
        specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean),
        languages: ["en"], active: true,
      },
    }),
    onSuccess: () => {
      toast.success(current ? "Profile updated" : "You're now listed as a mentor");
      qc.invalidateQueries({ queryKey: ["community", "mentors"] });
      qc.invalidateQueries({ queryKey: ["community", "mentor-me"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">{current ? "Edit mentor profile" : "Become a mentor"}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{current ? "Edit mentor profile" : "Become a mentor"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Headline"><Input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="ICT specialist · 8 years trading" /></Field>
          <Field label="Bio"><Textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Your background, approach, what mentees learn." /></Field>
          <Field label="Markets (comma separated)"><Input value={markets} onChange={(e) => setMarkets(e.target.value)} placeholder="forex, crypto, indices" /></Field>
          <Field label="Specialties (comma separated)"><Input value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="risk management, psychology, ICT" /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={mut.isPending} onClick={() => mut.mutate()}>{mut.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: any) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
