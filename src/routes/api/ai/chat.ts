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
import { enforceAiRateLimit } from "@/lib/ai/rate-limit.server";
import {
  buildIntelligence,
  summarizeForPrompt,
  type RawJournal,
  type RawTrade,
  type StrategyRef,
} from "@/lib/ai/intelligence";

const chatBodySchema = z.object({
  messages: z.array(z.any()).min(1).max(200),
  sessionId: z.string().uuid().optional(),
});

type ChatBody = {
  messages: UIMessage[];
  sessionId?: string;
};

async function loadContext(supabase: ReturnType<typeof createClient<Database>>, userId: string) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [
    { data: tradesFull },
    { data: journalsFull },
    { data: strategies },
    { data: score },
    { data: recs },
    { data: challenges },
    { data: profile },
  ] = await Promise.all([
    supabase
      .from("paper_trades")
      .select(
        "id, symbol, market, direction, status, pnl, rr_realized, rr_planned, risk_amount, stop_loss, take_profit, entry_price, exit_price, opened_at, closed_at, strategy_id, close_reason, notes",
      )
      .eq("user_id", userId)
      .is("deleted_at", null)
      .gte("opened_at", since)
      .order("closed_at", { ascending: false })
      .limit(500),
    supabase
      .from("journal_entries")
      .select("id, trade_id, notes, rating, mistakes, emotions_pre, emotions_post, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("strategies").select("id, name").eq("user_id", userId).limit(200),
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
    supabase.from("user_challenges").select("status").eq("user_id", userId),
    supabase
      .from("profiles")
      .select("display_name, username, experience, preferred_market, trading_style")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  const intel = buildIntelligence(
    (tradesFull ?? []) as unknown as RawTrade[],
    (journalsFull ?? []) as unknown as RawJournal[],
    (strategies ?? []) as unknown as StrategyRef[],
    30,
  );

  return `# Trader context (data owned by the user, 30-day window)
Profile: ${JSON.stringify(profile)}
AI Score snapshot: ${JSON.stringify(score)}
Open recommendations: ${JSON.stringify(recs)}
Active challenges: ${(challenges ?? []).filter((c: { status: string | null }) => c.status === "active").length}

${summarizeForPrompt(intel)}

Guidance:
- Answer using the numbers above. Cite them literally when relevant.
- If the trader asks about data not shown (e.g. a specific date range or instrument with 0 trades), say so plainly and suggest what to log next.
- Never invent statistics. Never give generic motivational advice.`;
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

        const rl = await enforceAiRateLimit(supabase, userId, ["chat_per_hour", "chat_per_day"]);
        if (!rl.ok) {
          const res = new Response(
            JSON.stringify({ ok: false, code: "rate_limited", message: `AI chat limit reached (${rl.used}/${rl.limit}). Try again shortly.` }),
            { status: 429, headers: { "content-type": "application/json", "retry-after": String(rl.retryAfterSec) } },
          );
          return res;
        }

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
