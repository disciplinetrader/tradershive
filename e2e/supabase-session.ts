import { createClient } from "@supabase/supabase-js";

export type SeededSession = {
  /** Exactly the localStorage entries supabase-js would have written. */
  storage: { name: string; value: string }[];
  userId: string;
  accessToken: string;
};

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing environment variable ${name}. See e2e/README.md for the full list.`,
    );
  }
  return v;
}

/**
 * Sign a user in and capture the auth state as localStorage entries.
 *
 * The app persists its session in localStorage (`integrations/supabase/client.ts`
 * sets `auth.storage` to `localStorage`), so a Playwright `storageState` has to
 * carry localStorage rather than cookies.
 *
 * Rather than hardcoding supabase-js's key name and value encoding — both of
 * which have changed across v2 minors — we hand the client an in-memory storage
 * adapter and record whatever it writes. Whatever the library persists is what
 * we hand the browser, so this stays correct across upgrades.
 */
export async function seedSession(
  supabaseUrl: string,
  publishableKey: string,
  email: string,
  password: string,
): Promise<SeededSession> {
  const captured = new Map<string, string>();

  const client = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (k) => captured.get(k) ?? null,
        setItem: (k, v) => void captured.set(k, v),
        removeItem: (k) => void captured.delete(k),
      },
    },
  });

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for ${email}: ${error.message}`);
  if (!data.session) throw new Error(`Sign-in returned no session for ${email}`);

  if (captured.size === 0) {
    throw new Error(
      `supabase-js persisted no auth state for ${email}. The storage contract ` +
        `changed; inspect what the client writes before trusting storageState.`,
    );
  }

  return {
    storage: [...captured].map(([name, value]) => ({ name, value })),
    userId: data.session.user.id,
    accessToken: data.session.access_token,
  };
}

/** A plain authenticated client for asserting against the DB from tests. */
export function clientFor(supabaseUrl: string, publishableKey: string, accessToken: string) {
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
