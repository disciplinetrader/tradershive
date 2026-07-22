import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GlassCard } from "@/components/ui/glass-card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPost, listCategories } from "@/lib/community.functions";
import { POST_TYPES, VISIBILITY, extractHashtags } from "@/lib/community/constants";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Loader2 } from "lucide-react";

const DRAFT_KEY = "th_community_composer_draft_v1";

export function PostComposer({ compact = false, onCreated }: { compact?: boolean; onCreated?: (id: string) => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const catsFn = useServerFn(listCategories);
  const cats = useQuery({ queryKey: ["community", "categories"], queryFn: () => catsFn(), staleTime: 5 * 60_000 });
  const create = useServerFn(createPost);

  const [expanded, setExpanded] = useState(!compact);
  const [postType, setPostType] = useState<string>("text");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [symbol, setSymbol] = useState("");
  const [visibility, setVisibility] = useState<string>("public");
  const [categorySlug, setCategorySlug] = useState<string>("");

  // Autosave draft
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setPostType(d.postType ?? "text");
        setTitle(d.title ?? "");
        setBody(d.body ?? "");
        setSymbol(d.symbol ?? "");
        setVisibility(d.visibility ?? "public");
        setCategorySlug(d.categorySlug ?? "");
      }
    } catch {}
  }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ postType, title, body, symbol, visibility, categorySlug }));
    }, 400);
    return () => clearTimeout(t);
  }, [postType, title, body, symbol, visibility, categorySlug]);

  const hashtags = useMemo(() => extractHashtags(title + " " + body), [title, body]);

  const mut = useMutation({
    mutationFn: async (draft: boolean) =>
      create({
        data: {
          post_type: postType,
          title: title.trim() || null,
          body_md: body,
          symbol: symbol.trim() || null,
          visibility: visibility as any,
          category_slug: categorySlug || null,
          is_draft: draft,
          media: [],
          attachments: [],
        },
      }),
    onSuccess: (r, draft) => {
      qc.invalidateQueries({ queryKey: ["community"] });
      toast.success(draft ? "Draft saved" : "Post published");
      localStorage.removeItem(DRAFT_KEY);
      setTitle(""); setBody(""); setSymbol(""); setCategorySlug("");
      setExpanded(!compact);
      onCreated?.(r.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to post"),
  });

  if (!profile) return null;

  return (
    <GlassCard className="p-4">
      <div className="flex items-start gap-3">
        <Avatar className="h-10 w-10 border border-border">
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback>{(profile.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 space-y-3">
          {!expanded ? (
            <button
              className="w-full rounded-lg border border-border/60 bg-background/40 px-4 py-3 text-left text-sm text-muted-foreground hover:border-primary/40"
              onClick={() => setExpanded(true)}
            >
              Share a trade idea, chart, or lesson…
            </button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={postType} onValueChange={setPostType}>
                  <SelectTrigger className="w-full sm:w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POST_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={categorySlug || "__none__"} onValueChange={(v) => setCategorySlug(v === "__none__" ? "" : v)}>
                  <SelectTrigger className="w-full sm:w-[170px]"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No category</SelectItem>
                    {(cats.data?.categories ?? []).map((c: any) => <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  className="w-full sm:w-[140px]"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="Symbol (BTC)"
                />
                <Select value={visibility} onValueChange={setVisibility}>
                  <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VISIBILITY.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional)"
                className="text-sm"
                maxLength={200}
              />
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write your post. Use $BTC for tickers, #ict for hashtags, @user for mentions."
                rows={5}
                maxLength={20000}
                className="resize-y"
              />
              {hashtags.length ? (
                <div className="flex flex-wrap gap-1 text-xs text-primary">
                  {hashtags.slice(0, 8).map((h) => <span key={h}>#{h}</span>)}
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="text-xs text-muted-foreground">Autosaved · Markdown & hashtags supported</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setExpanded(false); }}>Cancel</Button>
                  <Button size="sm" variant="outline" disabled={mut.isPending || (!body && !title)} onClick={() => mut.mutate(true)}>
                    Save draft
                  </Button>
                  <Button size="sm" disabled={mut.isPending || (!body && !title)} onClick={() => mut.mutate(false)}>
                    {mut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                    Post
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </GlassCard>
  );
}
