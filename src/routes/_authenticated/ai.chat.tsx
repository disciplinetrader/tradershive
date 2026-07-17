import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listChatSessions, createChatSession, deleteChatSession, getChatMessages } from "@/lib/ai.functions";
import { CoachChat } from "@/components/ai/CoachChat";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import type { UIMessage } from "ai";

export const Route = createFileRoute("/_authenticated/ai/chat")({ component: ChatPage });

function ChatPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listChatSessions);
  const createFn = useServerFn(createChatSession);
  const delFn = useServerFn(deleteChatSession);
  const msgsFn = useServerFn(getChatMessages);

  const sessions = useQuery({ queryKey: ["ai", "chat", "sessions"], queryFn: () => listFn() });
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId && sessions.data && sessions.data.length > 0) {
      setActiveId(sessions.data[0].id);
    }
  }, [sessions.data, activeId]);

  const active = useQuery({
    queryKey: ["ai", "chat", "session", activeId],
    queryFn: () => msgsFn({ data: { sessionId: activeId! } }),
    enabled: !!activeId,
  });

  const create = useMutation({
    mutationFn: () => createFn({ data: {} }),
    onSuccess: (row: any) => { setActiveId(row.id); qc.invalidateQueries({ queryKey: ["ai", "chat", "sessions"] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: (_, id) => {
      if (activeId === id) setActiveId(null);
      qc.invalidateQueries({ queryKey: ["ai", "chat", "sessions"] });
    },
  });

  const initialMessages: UIMessage[] = (active.data?.messages ?? [])
    .filter((m: any) => m.role === "user" || m.role === "assistant")
    .map((m: any) => ({
      id: m.id,
      role: m.role,
      parts: Array.isArray(m.parts) && m.parts.length > 0 ? m.parts : [{ type: "text", text: m.content ?? "" }],
    }));

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-md p-3">
        <Button size="sm" className="w-full mb-3" onClick={() => create.mutate()}>
          <Plus className="mr-1.5 h-4 w-4" /> New chat
        </Button>
        <div className="space-y-1 max-h-[65vh] overflow-y-auto">
          {(sessions.data ?? []).map((s: any) => (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-2 rounded-md border border-transparent p-2 text-sm transition hover:bg-background/40",
                activeId === s.id && "border-primary/40 bg-primary/10",
              )}
            >
              <button className="flex-1 text-left" onClick={() => setActiveId(s.id)}>
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="line-clamp-1">{s.title || "New conversation"}</span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {formatDistanceToNow(new Date(s.updated_at), { addSuffix: true })}
                </div>
              </button>
              <button onClick={() => del.mutate(s.id)} className="text-muted-foreground hover:text-destructive p-1">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {(sessions.data ?? []).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No chats yet</p>}
        </div>
      </aside>

      <div className="min-h-[70vh]">
        {activeId ? (
          <CoachChat sessionId={activeId} initialMessages={initialMessages} />
        ) : (
          <Card className="bg-card/60 backdrop-blur-md h-full">
            <CardContent className="flex items-center justify-center h-full text-muted-foreground">
              Start a new chat to talk to your Coach.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
