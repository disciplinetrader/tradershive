import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { supabase } from "@/integrations/supabase/client";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { AiAvatar } from "./AiAvatar";
import { SUGGESTED_PROMPTS } from "@/lib/ai/constants";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Coach Chat — streaming, session-aware.
 * Attaches the Supabase bearer token to /api/ai/chat and persists messages
 * server-side after streaming finishes (see /api/ai/chat handler).
 */
export function CoachChat({
  sessionId,
  initialMessages = [],
  onFirstMessage,
}: {
  sessionId?: string;
  initialMessages?: UIMessage[];
  onFirstMessage?: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        prepareSendMessagesRequest: async ({ messages, id }) => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return {
            body: { messages, sessionId },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          };
        },
      }),
    [sessionId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: sessionId ?? "default",
    messages: initialMessages,
    transport,
    onError: (e) => toast.error(e.message || "AI request failed"),
  });

  useEffect(() => {
    composerRef.current?.focus();
  }, [sessionId]);

  const busy = status === "submitted" || status === "streaming";

  const submit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    void sendMessage({ text: trimmed });
    onFirstMessage?.(trimmed);
    setInput("");
  };

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-xl border border-border/60 bg-card/60 backdrop-blur-md overflow-hidden">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              icon={<AiAvatar size={64} active />}
              title="Ask your Coach anything"
              description="I can review your trades, spot emotional patterns, generate playbooks and set weekly goals — using your real trading data."
            >
              <div className="mt-6 grid w-full max-w-xl grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => submit(p)}
                    className="rounded-lg border border-border/60 bg-background/40 p-3 text-left text-sm hover:bg-primary/10 hover:border-primary/40 transition"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role === "user" ? "user" : "assistant"}>
                <MessageContent>
                  {m.parts.map((part, i) => {
                    if (part.type === "text") {
                      return m.role === "assistant" ? (
                        <MessageResponse key={i}>{part.text}</MessageResponse>
                      ) : (
                        <span key={i} className="whitespace-pre-wrap">{part.text}</span>
                      );
                    }
                    return null;
                  })}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && (
            <Message from="assistant">
              <MessageContent>
                <Shimmer>Coach is thinking…</Shimmer>
              </MessageContent>
            </Message>
          )}
          {error && (
            <div className="text-sm text-destructive px-4">
              {error.message}
              <Button size="sm" variant="ghost" onClick={() => submit(input || "Retry")}>Retry</Button>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <PromptInput
        onSubmit={(msg) => submit(msg.text ?? input)}
        className="border-t border-border/60"
      >
        <PromptInputTextarea
          ref={composerRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your AI Coach…"
          disabled={busy}
        />
        <PromptInputFooter className="justify-end">
          <PromptInputSubmit status={status} disabled={busy || !input.trim()} />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
