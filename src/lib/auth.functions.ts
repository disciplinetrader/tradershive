import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ code: z.string().length(6) }).parse(v))
  .handler(async ({ data, context }) => {
    // This is a stub for the remediation pass
    return { success: true };
  });
