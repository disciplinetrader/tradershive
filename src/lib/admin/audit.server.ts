import type { SupabaseClient } from "@supabase/supabase-js";

export async function logAudit(
  supabase: SupabaseClient,
  adminId: string,
  action: string,
  resource: string,
  resourceId?: string | null,
  meta: Record<string, unknown> = {},
) {
  try {
    await supabase.from("admin_audit_logs").insert({
      admin_id: adminId,
      action,
      resource,
      resource_id: resourceId ?? null,
      meta,
    });
  } catch (e) {
    console.error("audit log failed", e);
  }
}
