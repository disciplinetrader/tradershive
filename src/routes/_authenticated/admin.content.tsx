import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listContentPages, upsertContentPage, deleteContentPage,
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
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/content")({
  component: AdminContent,
});

const KINDS = ["faq", "help", "terms", "privacy", "tutorial", "guide", "banner", "feature"] as const;

function AdminContent() {
  const qc = useQueryClient();
  const listFn = useServerFn(listContentPages);
  const upFn = useServerFn(upsertContentPage);
  const delFn = useServerFn(deleteContentPage);

  const q = useQuery({ queryKey: ["admin-content"], queryFn: () => listFn({}) });

  const upsert = useMutation({
    mutationFn: (v: any) => upFn({ data: v }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-content"] }); toast.success("Saved"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-content"] }); toast.success("Deleted"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <div className="space-y-4">
      <GlassCard className="p-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Content pages</h3>
          <p className="text-xs text-muted-foreground">FAQ, help articles, terms, privacy, tutorials, banners.</p>
        </div>
        <EditorDialog trigger={<Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> New page</Button>} onSave={(v) => upsert.mutate(v)} />
      </GlassCard>

      <GlassCard className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/60 bg-surface/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Title</th>
                <th className="p-3 text-left">Slug</th>
                <th className="p-3 text-left">Kind</th>
                <th className="p-3 text-left">Published</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading
                ? Array.from({ length: 5 }).map((_, i) => <tr key={i}><td colSpan={5} className="p-2"><Skeleton className="h-8 w-full" /></td></tr>)
                : (q.data ?? []).map((p: any) => (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-surface/50">
                      <td className="p-3 font-semibold">{p.title}</td>
                      <td className="p-3 text-xs text-muted-foreground">/{p.slug}</td>
                      <td className="p-3"><Badge variant="outline">{p.kind}</Badge></td>
                      <td className="p-3">{p.published ? <Badge className="bg-emerald-500/10 text-emerald-400">Live</Badge> : <Badge variant="outline">Draft</Badge>}</td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <EditorDialog trigger={<Button size="sm" variant="outline">Edit</Button>} initial={p} onSave={(v) => upsert.mutate(v)} />
                          <Button size="sm" variant="ghost" onClick={() => del.mutate(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

function EditorDialog({ trigger, initial, onSave }: { trigger: React.ReactNode; initial?: any; onSave: (v: any) => void }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [kind, setKind] = useState<string>(initial?.kind ?? "faq");
  const [published, setPublished] = useState<boolean>(initial?.published ?? false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{initial ? "Edit page" : "New page"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="Body (Markdown supported)" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={published} onCheckedChange={setPublished} /> Published
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => { onSave({ id: initial?.id, slug, title, body, kind, published }); setOpen(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
