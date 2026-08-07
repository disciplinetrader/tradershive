import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// VITE_SUPABASE_* come from .env, which is TRACKED BY GIT.
//
// The E2E_* account credentials must NOT go there — they would be committed and
// pushed. They belong in .env.e2e.local, which is gitignored, or in the shell.
// Shell values win over both.
dotenv.config({ path: ".env.e2e.local" });
dotenv.config();

/**
 * E2E config for the battle-arena core loop.
 *
 * The suite drives two authenticated browser contexts through
 * create -> join -> live -> trade. It is deliberately slow: reaching `live`
 * costs real wall-clock time (see e2e/battle-loop.spec.ts), so timeouts here are
 * generous and the suite runs serially.
 *
 * Point it at an environment with `E2E_BASE_URL`. Without a local dev server it
 * will target whatever you set — including a deployed preview. Read e2e/README.md
 * before the first run; this talks to a real Supabase project.
 */
// 8080, not Vite's default: @lovable.dev/vite-tanstack-config forces the dev
// server onto 8080 and warns if anything else is configured.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const useLocalServer = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",

  // A battle takes ~45-60s of real time to reach `live`. Nothing here is fast.
  timeout: 4 * 60 * 1000,
  expect: { timeout: 30 * 1000 },

  // Serial and single-worker on purpose: every run creates real battles and
  // real trades in a shared project, and concurrent runs would fight over the
  // lobby and each other's matchmaking.
  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 20 * 1000,
  },

  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],

  ...(useLocalServer
    ? {
        webServer: {
          // bun, never npm — see the note in e2e/README.md.
          command: "bun run dev",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120 * 1000,
        },
      }
    : {}),
});
