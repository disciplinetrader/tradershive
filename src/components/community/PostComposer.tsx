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
import { Send, Loader2, LineChart, Target, BookOpen, HelpCircle, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const DRAFT_KEY = "th_community_composer_draft_v1";

/** Quick-pick post types, shown as chips like the "what's on your mind" actions. */
const QUICK_TYPES = [
  { value: "text", label: "Post", icon: MessageSquare },
  { value: "chart", label: "Chart", icon: LineChart },
  { value: "trade_idea", label: "Idea", icon: Target },
  { value: "journal", label: "Journal", icon: BookOpen },
  { value: "question", label: "Question", icon: HelpCircle },
] as const;

export function PostComposer({
  compact = false,
  bare = false,
  onCreated,
}: {
  compact?: boolean;
  /** Render without the card chrome (used inside the create-post dialog). */
  bare?: boolean;
  onCreated?: (id: string) => void;
}) {
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

  const body_ = (
    <div className={cn("flex items-start gap-3", bare && "gap-0")}>
      {!bare ? (
        <Avatar className="h-10 w-10 border border-border">
          <AvatarImage src={profile.avatar_url ?? undefined} />
          <AvatarFallback>{(profile.username ?? "T").slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      ) : null}
      <div className="min-w-0 flex-1 space-y-3">
        {!expanded ? (
          <div className="space-y-2.5">
            <button
              className="w-full rounded-full border border-border/60 bg-background/50 px-4 py-2.5 text-left text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-background"
              onClick={() => setExpanded(true)}
            >
              Share a trade idea, chart or lesson…
            </button>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {QUICK_TYPES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.value}
                    onClick={() => { setPostType(t.value); setExpanded(true); }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/50 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                  >
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {QUICK_TYPES.map((t) => {
                const Icon = t.icon;
                const active = postType === t.value;
                return (
                  <button
                    key={t.value}
                    onClick={() => setPostType(t.value)}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                      active
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>

            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your post. Use $BTC for tickers, #ict for hashtags, @user for mentions."
              rows={bare ? 7 : 5}
              maxLength={20000}
              className="resize-y border-border/60 bg-background/40 text-sm"
              autoFocus
            />
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Headline (optional)"
              className="border-border/60 bg-background/40 text-sm"
              maxLength={200}
            />

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Select value={postType} onValueChange={setPostType}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POST_TYPES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={categorySlug || "__none__"} onValueChange={(v) => setCategorySlug(v === "__none__" ? "" : v)}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No category</SelectItem>
                  {(cats.data?.categories ?? []).map((c: any) => <SelectItem key={c.id} value={c.slug}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                className="text-xs"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="Symbol (BTC)"
              />
              <Select value={visibility} onValueChange={setVisibility}>
                <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISIBILITY.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {hashtags.length ? (
              <div className="flex flex-wrap gap-1 text-xs text-primary">
                {hashtags.slice(0, 8).map((h) => <span key={h}>#{h}</span>)}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="text-[11px] text-muted-foreground">Autosaved · Markdown & hashtags supported</div>
              <div className="flex items-center gap-2">
                {compact ? <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>Cancel</Button> : null}
                <Button size="sm" variant="outline" disabled={mut.isPending || (!body && !title)} onClick={() => mut.mutate(true)}>
                  Save draft
                </Button>
                <Button size="sm" className="rounded-full px-4" disabled={mut.isPending || (!body && !title)} onClick={() => mut.mutate(false)}>
                  {mut.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-1.5 h-3.5 w-3.5" />}
                  Post
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (bare) return body_;
  return <GlassCard className="p-4">{body_}</GlassCard>;
}
