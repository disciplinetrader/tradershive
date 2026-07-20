# AI Coach

Wraps the Lovable AI Gateway to power trade reviews, chat coaching and
scoring.

## Files

- `constants.ts` — Model IDs, defaults, tier limits.
- `prompts.ts` — System prompts (trade review, coach chat, session review).
- `rate-limit.server.ts` — Tiered rate limiting per user. Uses
  Supabase `ai_usage_events` as the audit trail. Throws a typed error
  when quota is exceeded so the UI can surface an upgrade CTA.
- `score.ts` — `computeAIScore(inputs)` — a pure calculation over real
  platform data (trades, wins, losses, journals, drawdown, challenges,
  achievements). No fabricated inputs.

## Server surface

`src/lib/ai.functions.ts` + `src/lib/ai-gateway.server.ts` — protected
server functions that build prompts, call the gateway, validate output
with Zod, persist the review, and update AI usage counters.

## Invariants

- Every gateway call goes through `rate-limit.server.ts` first.
- The `LOVABLE_API_KEY` is injected by Lovable Cloud — never referenced
  in client code.
- Model outputs are validated with Zod before being persisted.
