import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Share2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { previewShare, publishShare } from "@/lib/sharing.functions";
import { SharedContentCard } from "./SharedContentCard";
import type { ShareSourceType } from "@/lib/sharing/snapshot.server";

export function ShareToCommunityDialog({
  open, onOpenChange, sourceType, sourceId, sourceRef, defaultNote,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sourceType: ShareSourceType;
  sourceId?: string | null;
  sourceRef?: string | null;
  defaultNote?: string;
}) {
  const qc = useQueryClient();
  const preview = useServerFn(previewShare);
  const publish = useServerFn(publishShare);

  const enabled = open;
  const q = useQuery({
    queryKey: ["share-preview", sourceType, sourceId ?? null, sourceRef ?? null],
    queryFn: () => preview({ data: { source_type: sourceType, source_id: sourceId ?? null, source_ref: sourceRef ?? null } }),
    enabled,
    staleTime: 30_000,
  });

  const [title, setTitle] = useState("");
  const [note, setNote] = useState(defaultNote ?? "");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"public" | "followers" | "private" | "draft">("public");

  useEffect(() => {
    if (q.data) {
      setTitle((q.data as any).title ?? "");
      setTags(((q.data as any).tags ?? []).map((t: string) => `#${t}`).join(" "));
    }
  }, [q.data]);

  const preview_share = useMemo(() => q.data ? {
    source_type: sourceType, title, summary: (q.data as any).summary, snapshot: (q.data as any).snapshot,
    cover_url: (q.data as any).cover, source_id: sourceId ?? null,
  } : null, [q.data, title, sourceType, sourceId]);

  const mut = useMutation({
    mutationFn: async () =>
      publish({
        data: {
          source_type: sourceType, source_id: sourceId ?? null, source_ref: sourceRef ?? null,
          title, note, visibility,
          tags: tags.split(/[\s,]+/).map((t) => t.replace(/^#/, "")).filter(Boolean),
        },
      }),
    onSuccess: (r) => {
      toast.success("Shared to Community");
      qc.invalidateQueries({ queryKey: ["community"] });
      onOpenChange(false);
      if (typeof window !== "undefined") window.location.assign(`/community/post/${r.post_id}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to share"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Share2 className="h-4 w-4" /> Share to Community</DialogTitle>
        </DialogHeader>

        {q.isLoading ? (
          <div className="space-y-3"><Skeleton className="h-40 w-full rounded-xl" /><Skeleton className="h-24 w-full rounded-xl" /></div>
        ) : q.error ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
            {(q.error as any)?.message ?? "Failed to load preview"}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label>Your note (optional)</Label>
              <Textarea
                value={note} onChange={(e) => setNote(e.target.value)}
                placeholder="Add context, lessons, or your thinking… Supports #tags, @mentions, $BTC tickers."
                rows={4} maxLength={20000}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tags</Label>
                <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="#eurusd #smc #breakout" />
              </div>
              <div className="space-y-1.5">
                <Label>Visibility</Label>
                <Select value={visibility} onValueChange={(v) => setVisibility(v as any)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public — anyone</SelectItem>
                    <SelectItem value="followers">Followers only</SelectItem>
                    <SelectItem value="private">Only me</SelectItem>
                    <SelectItem value="draft">Save as draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Preview</div>
              <SharedContentCard share={preview_share} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={mut.isPending || q.isLoading || !!q.error} onClick={() => mut.mutate()}>
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
            {visibility === "draft" ? "Save draft" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
