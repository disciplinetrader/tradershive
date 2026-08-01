import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { extractTradeFromText } from "@/lib/journal/quick-log.server";

export const parseTradeNarrative = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        text: z.string().min(3).max(2000),
        nowIso: z.string(),
        timezone: z.string().default("UTC"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => extractTradeFromText(data));
