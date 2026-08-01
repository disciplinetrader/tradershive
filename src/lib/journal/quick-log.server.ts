/**
 * Natural-language trade logging — server-only implementation.
 * Kept out of the *.functions.ts wrapper so server-function splitting stays safe.
 */
import { z } from "zod";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import { FAST_MODEL } from "@/lib/ai/constants";

export const QuickLogSchema = z.object({
  symbol: z.string().nullable().describe("Ticker as written by the trader, e.g. EURUSD, BTCUSD, XAUUSD"),
  direction: z.enum(["long", "short"]).nullable(),
  entry_price: z.number().nullable(),
  exit_price: z.number().nullable(),
  stop_loss: z.number().nullable(),
  take_profit: z.number().nullable(),
  lot_size: z.number().nullable(),
  pnl: z.number().nullable().describe("Realised profit or loss in account currency, negative for a loss"),
  rr: z.number().nullable().describe("R multiple if stated, e.g. 2 for '2R winner'"),
  opened_at: z.string().nullable().describe("ISO 8601 timestamp, or null when not stated"),
  closed_at: z.string().nullable(),
  notes: z.string().nullable().describe("Anything about the thesis, emotion or mistake worth keeping"),
  confidence: z.number().min(0).max(1).describe("How confident the extraction is"),
});

export type QuickLogResult = z.infer<typeof QuickLogSchema>;

const SYSTEM = `You convert a trader's shorthand description of a trade into structured fields.
Rules:
- Only extract what is actually stated or unambiguously implied. Use null otherwise. Never invent prices.
- "bought"/"long"/"buy" => long. "sold"/"short"/"sell" => short.
- Normalise symbols to uppercase with no separators (eur/usd => EURUSD, gold => XAUUSD, nas100 => NAS100).
- Relative times ("this morning", "yesterday 9:30") should be resolved against the supplied reference timestamp, in that timezone, and returned as ISO 8601.
- P&L stated as "+$120" is 120, "down 40 bucks" is -40. An "R" figure goes in rr, not pnl.
- notes should capture reasoning/emotion, not repeat the numbers.`;

export async function extractTradeFromText(input: {
  text: string;
  nowIso: string;
  timezone: string;
}): Promise<QuickLogResult> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured on server.");

  const gateway = createLovableAiGatewayProvider(key, undefined, { structuredOutputs: true });
  const prompt = `Reference time: ${input.nowIso} (timezone ${input.timezone})\n\nTrader note:\n"""${input.text.slice(0, 2000)}"""`;

  try {
    const result = await generateText({
      model: gateway(FAST_MODEL),
      system: SYSTEM,
      prompt,
      output: Output.object({ schema: QuickLogSchema }),
    });
    return result.output as QuickLogResult;
  } catch (err) {
    if (NoObjectGeneratedError.isInstance(err)) {
      try {
        return QuickLogSchema.parse(JSON.parse((err as { text?: string }).text ?? "{}"));
      } catch {
        /* fall through */
      }
    }
    throw err;
  }
}
