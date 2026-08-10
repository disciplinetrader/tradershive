import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageSquare, Send, Trash2, Smile } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { listBattleChat, sendBattleChat, deleteBattleChat, reactBattleChat } from "@/lib/battle-arena-live.functions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";

const EMOJIS = ["🔥", "🚀", "💎", "👏", "😂", "😱"];

export function BattleChat({ battleId, canPost, isHost }: { battleId: string; canPost: boolean; isHost: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const fnList = useServerFn(listBattleChat);
  const fnSend = useServerFn(sendBattleChat);
  const fnDel = useServerFn(deleteBattleChat);
  const fnReact = useServerFn(reactBattleChat);

  const [msg, setMsg] = useState("");
  const [muted, setMuted] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ["battle-chat", battleId],
    queryFn: () => fnList({ data: { battleId, limit: 100 } }),
    refetchOnWindowFocus: false,
  });

  // We now rely on the parent (ArenaCommandRail or route) to manage the channel 
  // and invalidate the "battle-chat" query. We only need the poll as a fallback.
  useEffect(() => {
    if (autoScroll && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [q.data, autoScroll]);

  const profileById = useMemo(() => new Map((q.data?.profiles ?? []).map((p: any) => [p.id, p])), [q.data]);

  const send = async () => {
    const text = msg.trim();
    if (!text || !user) return;
    setMsg("");
    try {
      const { error } = await supabase.from("battle_chat").insert({
        battle_id: battleId,
        user_id: user.id,
        message: text,
        kind: "user"
      });
      if (error) throw error;
    } catch (e: any) {
      toast.error(e?.message ?? "Could not complete the request");
    }
  };

  return (
    <div className="flex h-[380px] flex-col rounded-2xl border border-border/40 bg-card/10 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2 bg-muted/10">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
          <MessageSquare className="h-3.5 w-3.5 text-primary" />Conversation
        </div>
        <button
          onClick={() => setMuted((m) => !m)}
          className="text-[11px] text-muted-foreground hover:text-foreground"
        >
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
        className={cn("flex-1 space-y-2 overflow-y-auto p-3", muted && "opacity-40")}
      >
        {q.data?.messages.length === 0 && (
          <div className="p-6 text-center text-sm text-muted-foreground">Say gg.</div>
        )}
        {q.data?.messages.map((m: any) => {
          const p = profileById.get(m.user_id) as any;
          const mine = m.user_id === user?.id;
          const reactions = (m.reactions ?? {}) as Record<string, string[]>;
          return (
            <div key={m.id} className={cn("group flex items-start gap-2", mine && "flex-row-reverse")}>
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarImage src={p?.avatar_url ?? undefined} />
                <AvatarFallback className="text-[10px]">{(p?.display_name ?? p?.username ?? "?").slice(0, 1)}</AvatarFallback>
              </Avatar>
              <div className={cn("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-primary/10" : "bg-background/60")}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium">{p?.display_name ?? p?.username ?? "Competitor"}</span>
                  <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                </div>
                <div className="mt-0.5 break-words">{m.message}</div>
                {Object.keys(reactions).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {Object.entries(reactions).map(([em, users]) => (
                      <button key={em} onClick={() => fnReact({ data: { messageId: m.id, emoji: em } })}
                        className="rounded-full bg-background/70 px-2 py-0.5 text-[11px] hover:bg-background">
                        {em} {users.length}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex items-center gap-0.5">
                  {EMOJIS.slice(0, 3).map((em) => (
                    <button key={em} onClick={() => fnReact({ data: { messageId: m.id, emoji: em } })}
                      className="rounded p-1 text-xs hover:bg-background/60">{em}</button>
                  ))}
                  {(mine || isHost) && (
                    <button onClick={async () => { try { await fnDel({ data: { messageId: m.id } }); } catch (e: any) { toast.error(e?.message); } }}
                      className="rounded p-1 hover:bg-background/60"><Trash2 className="h-3 w-3 text-danger" /></button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 border-t border-border/60 p-2">
        <Input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          maxLength={500}
          placeholder={canPost ? "Type a message…" : "Only participants can chat"}
          disabled={!canPost}
          className="h-9"
        />
        <Button size="sm" type="submit" disabled={!canPost || !msg.trim()}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}
