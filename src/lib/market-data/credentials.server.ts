/**
 * Provider credential storage — server-only.
 * Uses `supabaseAdmin` + AES-GCM at rest so credentials are never readable
 * from the client and never returned to the client (only booleans indicating
 * whether a field is configured are exposed).
 */
import { decryptSecret, encryptSecret } from "./crypto.server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export interface StoredCredentialSummary {
  provider_code: string;
  field_key: string;
  configured: boolean;
  updated_at: string | null;
}

/** Read one credential value in plaintext (server-only). */
export async function getCredential(providerCode: string, fieldKey: string): Promise<string | null> {
  const sb = await admin();
  const { data, error } = await sb
    .from("provider_credentials")
    .select("ciphertext")
    .eq("provider_code", providerCode)
    .eq("field_key", fieldKey)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  try { return decryptSecret(data.ciphertext); } catch { return null; }
}

/** Read every stored credential for a provider (server-only). */
export async function getAllCredentials(providerCode: string): Promise<Record<string, string>> {
  const sb = await admin();
  const { data, error } = await sb
    .from("provider_credentials")
    .select("field_key, ciphertext")
    .eq("provider_code", providerCode);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const row of data ?? []) {
    try { out[row.field_key] = decryptSecret(row.ciphertext); } catch { /* skip */ }
  }
  return out;
}

/** Non-secret summary for the admin UI. */
export async function summarizeCredentials(providerCode: string): Promise<StoredCredentialSummary[]> {
  const sb = await admin();
  const { data, error } = await sb
    .from("provider_credentials")
    .select("provider_code, field_key, updated_at")
    .eq("provider_code", providerCode);
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, configured: true }));
}

export async function upsertCredential(providerCode: string, fieldKey: string, value: string, updatedBy: string): Promise<void> {
  const sb = await admin();
  const { error } = await sb
    .from("provider_credentials")
    .upsert(
      {
        provider_code: providerCode,
        field_key: fieldKey,
        ciphertext: encryptSecret(value),
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_code,field_key" },
    );
  if (error) throw error;
}

export async function deleteCredential(providerCode: string, fieldKey: string): Promise<void> {
  const sb = await admin();
  const { error } = await sb
    .from("provider_credentials")
    .delete()
    .eq("provider_code", providerCode)
    .eq("field_key", fieldKey);
  if (error) throw error;
}
