import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAnnouncements, upsertAnnouncement, deleteAnnouncement,
} from "@/lib/admin/settings.functions";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Megaphone, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/announcements")({
  component: AdminAnnouncements,
});

function AdminAnnouncements() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAnnouncements);
  const upFn = useServerFn(upsertAnnouncement);
  const delFn = useServerFn(deleteAnnouncement);

  const q = useQuery({ queryKey: ["admin-announcements"], queryFn: () => listFn({}) });
  const up = useMutation({
    mutationFn: (v: any) => upFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-announcements"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-announcements"] }); toast.success("Deleted"); },
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Announcements</h3>
          <p className="text-xs text-muted-foreground">Banners, popups, news, maintenance notices and release notes.</p>
        </div>
        <EditDialog trigger={<Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> New</Button>} onSave={up.mutate} />
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2">
        {q.isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)
          : (q.data ?? []).map((a: any) => (
              <GlassCard key={a.id} className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-3.5 w-3.5 text-primary" />
                      <div className="text-sm font-semibold">{a.title}</div>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                  </div>
                  <Badge variant="outline">{a.kind}</Badge>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <div className="flex items-center gap-2">
                    <span className={"rounded-full px-2 py-0.5 " + severityClass(a.severity)}>{a.severity}</span>
                    {a.published ? <Badge className="bg-success/10 text-success">Published</Badge> : <Badge variant="outline">Draft</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <EditDialog trigger={<Button size="sm" variant="outline">Edit</Button>} initial={a} onSave={up.mutate} />
                    <Button size="sm" variant="ghost" onClick={() => del.mutate(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </GlassCard>
            ))}
      </div>
    </div>
  );
}

function severityClass(sev: string) {
  switch (sev) {
    case "critical": return "bg-danger/10 text-danger";
    case "warning": return "bg-warning/10 text-warning";
    case "success": return "bg-success/10 text-success";
    default: return "bg-primary/10 text-primary";
  }
}

function EditDialog({ trigger, initial, onSave }: { trigger: React.ReactNode; initial?: any; onSave: (v: any) => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({
    id: initial?.id ?? null,
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    kind: initial?.kind ?? "banner",
    severity: initial?.severity ?? "info",
    cta_label: initial?.cta_label ?? "",
    cta_url: initial?.cta_url ?? "",
    starts_at: initial?.starts_at ?? null,
    ends_at: initial?.ends_at ?? null,
    published: initial?.published ?? false,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{initial ? "Edit announcement" : "New announcement"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Title" value={state.title} onChange={(e) => setState({ ...state, title: e.target.value })} />
          <Textarea placeholder="Body" rows={4} value={state.body ?? ""} onChange={(e) => setState({ ...state, body: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Select value={state.kind} onValueChange={(v) => setState({ ...state, kind: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["banner", "popup", "notification", "news", "maintenance", "release"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={state.severity} onValueChange={(v) => setState({ ...state, severity: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["info", "success", "warning", "critical"].map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="CTA label" value={state.cta_label ?? ""} onChange={(e) => setState({ ...state, cta_label: e.target.value })} />
            <Input placeholder="CTA URL" value={state.cta_url ?? ""} onChange={(e) => setState({ ...state, cta_url: e.target.value })} />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={state.published} onCheckedChange={(v) => setState({ ...state, published: v })} /> Published
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onSave(state); setOpen(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
