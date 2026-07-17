import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import {
  createLovableAiGatewayProvider,
  getLovableAiGatewayRunId,
  getLovableAiGatewayResponseHeaders,
  withLovableAiGatewayRunIdHeader,
} from "@/lib/ai-gateway.server";
import { COACH_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "@/lib/ai/constants";
import { Errors, guardRoute } from "@/lib/server-errors";

const chatBodySchema = z.object({
  messages: z.array(z.any()).min(1).max(200),
  sessionId: z.string().uuid().optional(),
});

type ChatBody = {
  messages: UIMessage[];
  sessionId?: string;
};

async function loadContext(supabase: ReturnType<typeof createClient<Database>>, userId: string) {
  const [{ data: trades }, { data: journals }, { data: score }, { data: recs }, { data: challenges }, { data: profile }] = await Promise.all([
    supabase
      .from("paper_trades")
      .select("symbol, direction, pnl, opened_at, closed_at, rr_realized")
      .eq("user_id", userId)
      .eq("status", "closed")
      .is("deleted_at", null)
      .order("closed_at", { ascending: false })
      .limit(20),
    supabase
      .from("journal_entries")
      .select("notes, rating, mistakes, emotions_pre, emotions_post, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("ai_score_snapshots")
      .select("*")
      .eq("user_id", userId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("ai_recommendations")
      .select("title, priority, description")
      .eq("user_id", userId)
      .eq("status", "open")
      .limit(10),
    supabase
      .from("user_challenges")
      .select("status")
      .eq("user_id", userId),
    supabase
      .from("profiles")
      .select("display_name, username, experience, preferred_market, trading_style")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  return `# Trader context (data owned by the user)
Profile: ${JSON.stringify(profile)}
AI Score: ${JSON.stringify(score)}
Open recommendations: ${JSON.stringify(recs)}
Active challenges: ${(challenges ?? []).filter((c: any) => c.status === "active").length}
Recent closed trades (20): ${JSON.stringify(trades)}
Recent journal (10): ${JSON.stringify(journals)}
`;
}

export const Route = createFileRoute("/api/ai/chat")({
  server: {
    handlers: {
      POST: guardRoute("api/ai/chat", async ({ request }) => {
        const authHeader = request.headers.get("authorization") ?? "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        if (!token) throw Errors.unauthorized();

        const supabaseUrl = process.env.SUPABASE_URL;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!supabaseUrl || !anonKey) throw Errors.internal("Auth backend misconfigured.");

        const supabase = createClient<Database>(supabaseUrl, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            headers: { Authorization: `Bearer ${token}` },
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (anonKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${anonKey}`) {
                h.set("Authorization", `Bearer ${token}`);
              }
              h.set("apikey", anonKey);
              return fetch(input, { ...init, headers: h });
            },
          },
        });

        const { data: userRes, error: authErr } = await supabase.auth.getUser(token);
        if (authErr || !userRes.user) throw Errors.unauthorized();
        const userId = userRes.user.id;

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          throw Errors.badRequest("Request body must be valid JSON.");
        }
        const body = chatBodySchema.parse(raw) as ChatBody;

        const key = process.env.LOVABLE_API_KEY;
        if (!key) throw Errors.upstream("AI service is not configured.");

        const context = await loadContext(supabase, userId);
        const initialRunId = getLovableAiGatewayRunId(request);
        const gateway = createLovableAiGatewayProvider(key, initialRunId);
        const model = gateway(DEFAULT_MODEL);

        const systemPrompt = `${COACH_SYSTEM_PROMPT}\n\n${context}`;

        const result = streamText({
          model,
          system: systemPrompt,
          messages: await convertToModelMessages(body.messages),
          onFinish: async ({ text, usage }) => {
            if (!body.sessionId) return;
            try {
              const userMsg = body.messages[body.messages.length - 1];
              const userText =
                userMsg?.parts
                  ?.filter((p) => p.type === "text")
                  .map((p) => (p as { text: string }).text)
                  .join("") ?? "";
              await supabase.from("ai_chat_messages").insert([
                {
                  session_id: body.sessionId,
                  user_id: userId,
                  role: "user",
                  content: userText,
                  parts: userMsg?.parts as any,
                  message_ref: userMsg?.id,
                },
                {
                  session_id: body.sessionId,
                  user_id: userId,
                  role: "assistant",
                  content: text,
                  parts: [{ type: "text", text }] as any,
                  tokens_in: usage?.inputTokens ?? 0,
                  tokens_out: usage?.outputTokens ?? 0,
                  model_key: DEFAULT_MODEL,
                  provider_key: DEFAULT_PROVIDER,
                },
              ]);
              await supabase
                .from("ai_chat_sessions")
                .update({
                  last_message_at: new Date().toISOString(),
                  message_count: (body.messages.length + 1) as any,
                })
                .eq("id", body.sessionId)
                .eq("user_id", userId);
              await supabase.from("ai_usage_logs").insert({
                user_id: userId,
                kind: "chat_summary",
                model_key: DEFAULT_MODEL,
                provider_key: DEFAULT_PROVIDER,
                tokens_in: usage?.inputTokens ?? 0,
                tokens_out: usage?.outputTokens ?? 0,
                ok: true,
              });
            } catch (e) {
              console.error("chat persist failed", e);
            }
          },
        });

        const response = result.toUIMessageStreamResponse({
          originalMessages: body.messages,
          headers: getLovableAiGatewayResponseHeaders(undefined, {
            ...(initialRunId ? { "X-Lovable-AIG-Run-ID": initialRunId } : {}),
          }),
        });

        return withLovableAiGatewayRunIdHeader(response, gateway);
      }),
    },
  },
});
