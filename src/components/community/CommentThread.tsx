import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Heart, MessageSquare, Trash2, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addComment, deleteComment, listComments, toggleReaction } from "@/lib/community.functions";
import { renderMarkdownSafe } from "@/lib/community/constants";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CommentThread({ postId }: { postId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fn = useServerFn(listComments);
  const add = useServerFn(addComment);
  const del = useServerFn(deleteComment);
  const react = useServerFn(toggleReaction);
  const [body, setBody] = useState("");

  const q = useQuery({
    queryKey: ["community", "comments", postId],
    queryFn: () => fn({ data: { post_id: postId } }),
  });

  const mut = useMutation({
    mutationFn: (input: { body: string; parent_id?: string | null }) =>
      add({ data: { post_id: postId, parent_id: input.parent_id ?? null, body_md: input.body } }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: ["community", "comments", postId] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community", "comments", postId] }),
  });
  const reactMut = useMutation({
    mutationFn: (id: string) => react({ data: { comment_id: id, kind: "like" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["community", "comments", postId] }),
  });

  const all = q.data?.comments ?? [];
  const byParent = new Map<string | null, any[]>();
  for (const c of all) {
    const k = c.parent_id ?? null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(c);
  }
  const roots = byParent.get(null) ?? [];

  return (
    <div className="space-y-4">
      {user ? (
        <div className="flex gap-3">
          <div className="flex-1">
            <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" maxLength={4000} />
            <div className="mt-2 flex justify-end">
              <Button size="sm" disabled={!body.trim() || mut.isPending} onClick={() => mut.mutate({ body })}>
                {mut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Comment
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        {q.isLoading ? <div className="text-sm text-muted-foreground">Loading comments…</div> : null}
        {!q.isLoading && roots.length === 0 ? <div className="text-sm text-muted-foreground">No comments yet — be the first to reply.</div> : null}
        {roots.map((c) => (
          <CommentNode
            key={c.id}
            comment={c}
            replies={byParent.get(c.id) ?? []}
            byParent={byParent}
            depth={0}
            currentUserId={user?.id}
            onReply={(parentId, body) => mut.mutate({ body, parent_id: parentId })}
            onDelete={(id) => delMut.mutate(id)}
            onLike={(id) => reactMut.mutate(id)}
          />
        ))}
      </div>
    </div>
  );
}

function CommentNode({
  comment, replies, byParent, depth, currentUserId, onReply, onDelete, onLike,
}: {
  comment: any; replies: any[]; byParent: Map<string | null, any[]>; depth: number;
  currentUserId?: string;
  onReply: (parentId: string, body: string) => void;
  onDelete: (id: string) => void;
  onLike: (id: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [body, setBody] = useState("");
  const author = comment.author ?? {};
  const html = comment.body_html || renderMarkdownSafe(comment.body_md ?? "");

  return (
    <div className={cn("flex gap-3", depth > 0 && "ml-6 border-l border-border/60 pl-4")}>
      <Avatar className="h-8 w-8 border border-border">
        <AvatarImage src={author.avatar_url ?? undefined} />
        <AvatarFallback>{(author.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="font-semibold">{author.display_name || author.username}</span>
          <span className="text-muted-foreground">@{author.username}</span>
          <span className="text-muted-foreground">· {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}</span>
        </div>
        <div className="prose prose-sm mt-1 max-w-none text-sm" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
          <button className={cn("inline-flex items-center gap-1 hover:text-primary", comment.viewer_liked && "text-primary")} onClick={() => onLike(comment.id)}>
            <Heart className={cn("h-3.5 w-3.5", comment.viewer_liked && "fill-current")} /> {comment.like_count ?? 0}
          </button>
          {depth < 4 ? (
            <button className="inline-flex items-center gap-1 hover:text-primary" onClick={() => setReplying((v) => !v)}>
              <MessageSquare className="h-3.5 w-3.5" /> Reply
            </button>
          ) : null}
          {currentUserId === comment.author_id ? (
            <button className="inline-flex items-center gap-1 hover:text-rose-500" onClick={() => onDelete(comment.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          ) : null}
        </div>
        {replying ? (
          <div className="mt-2 flex flex-col gap-2">
            <Textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a reply…" />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setReplying(false)}>Cancel</Button>
              <Button size="sm" disabled={!body.trim()} onClick={() => { onReply(comment.id, body); setBody(""); setReplying(false); }}>Reply</Button>
            </div>
          </div>
        ) : null}
        <div className="mt-3 space-y-3">
          {replies.map((r) => (
            <CommentNode
              key={r.id}
              comment={r}
              replies={byParent.get(r.id) ?? []}
              byParent={byParent}
              depth={depth + 1}
              currentUserId={currentUserId}
              onReply={onReply}
              onDelete={onDelete}
              onLike={onLike}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
