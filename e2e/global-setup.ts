import fs from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";

import { requireEnv, seedSession } from "./supabase-session";

export const AUTH_DIR = path.join(process.cwd(), ".auth");
export const HOST_STATE = path.join(AUTH_DIR, "host.json");
export const JOINER_STATE = path.join(AUTH_DIR, "joiner.json");
export const IDS_FILE = path.join(AUTH_DIR, "ids.json");

/**
 * Signs both test users in once and writes a Playwright storageState for each.
 *
 * These files contain live access tokens. `.auth/` is gitignored — keep it that
 * way, and do not attach it to CI artifacts.
 */
async function globalSetup(config: FullConfig) {
  const supabaseUrl = requireEnv("VITE_SUPABASE_URL");
  const publishableKey = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");

  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3000";
  const origin = new URL(baseURL).origin;

  const host = await seedSession(
    supabaseUrl,
    publishableKey,
    requireEnv("E2E_HOST_EMAIL"),
    requireEnv("E2E_HOST_PASSWORD"),
  );
  const joiner = await seedSession(
    supabaseUrl,
    publishableKey,
    requireEnv("E2E_JOINER_EMAIL"),
    requireEnv("E2E_JOINER_PASSWORD"),
  );

  if (host.userId === joiner.userId) {
    throw new Error(
      "E2E_HOST_* and E2E_JOINER_* resolve to the same user. The suite needs two " +
        "distinct accounts — join_battle is idempotent per user, so a battle would " +
        "never reach min_participants.",
    );
  }

  fs.mkdirSync(AUTH_DIR, { recursive: true });
  for (const [file, session] of [
    [HOST_STATE, host],
    [JOINER_STATE, joiner],
  ] as const) {
    fs.writeFileSync(
      file,
      JSON.stringify({ cookies: [], origins: [{ origin, localStorage: session.storage }] }, null, 2),
    );
  }

  fs.writeFileSync(
    IDS_FILE,
    JSON.stringify(
      {
        supabaseUrl,
        publishableKey,
        host: { userId: host.userId, accessToken: host.accessToken },
        joiner: { userId: joiner.userId, accessToken: joiner.accessToken },
      },
      null,
      2,
    ),
  );
}

export default globalSetup;
