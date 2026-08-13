import fs from "node:fs";
import path from "node:path";
import type { FullConfig } from "@playwright/test";

import { requireEnv, seedSession } from "../supabase-session";

export const UI_AUTH_DIR = path.join(process.cwd(), ".auth");
export const UI_HOST_STATE = path.join(UI_AUTH_DIR, "ui-host.json");
export const UI_IDS_FILE = path.join(UI_AUTH_DIR, "ui-ids.json");

/**
 * Host-only setup for the UI interaction suite.
 *
 * The battle suite's `global-setup.ts` requires E2E_JOINER_* as well, because a
 * battle needs two distinct users. Nothing here does — these tests drive one
 * trader through the chart — so requiring a second account would block the
 * whole suite on credentials it never uses.
 *
 * Writes live access tokens into `.auth/`, which is gitignored. Keep it that
 * way.
 */
async function globalSetup(config: FullConfig) {
  const supabaseUrl = requireEnv("VITE_SUPABASE_URL");
  const publishableKey = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:8080";
  const origin = new URL(baseURL).origin;

  const host = await seedSession(
    supabaseUrl,
    publishableKey,
    requireEnv("E2E_HOST_EMAIL"),
    requireEnv("E2E_HOST_PASSWORD"),
  );

  fs.mkdirSync(UI_AUTH_DIR, { recursive: true });
  fs.writeFileSync(
    UI_HOST_STATE,
    JSON.stringify(
      { cookies: [], origins: [{ origin, localStorage: host.storage }] },
      null,
      2,
    ),
  );
  fs.writeFileSync(
    UI_IDS_FILE,
    JSON.stringify(
      { supabaseUrl, publishableKey, userId: host.userId, accessToken: host.accessToken },
      null,
      2,
    ),
  );
}

export default globalSetup;
