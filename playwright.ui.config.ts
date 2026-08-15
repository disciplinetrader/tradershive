import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

// Same credential rule as playwright.config.ts: .env is TRACKED, so E2E_* and
// TWELVE_DATA_API_KEY live in the gitignored .local files.
dotenv.config({ path: ".env.e2e.local" });
dotenv.config({ path: ".env.local" });
dotenv.config();

/**
 * UI interaction suite — hover, drag and coordinate assertions on the trading
 * workspace. Separate from playwright.config.ts because:
 *
 *   • it needs only E2E_HOST_*, not the joiner account the battle suite needs;
 *   • it is fast and does not create battles;
 *   • it is meant to be run headed (`--headed`) so a human can watch the drags.
 *
 * Still points at a REAL Supabase project, so it runs on a paper account it
 * creates for the run and deletes afterwards — never an account with trades on
 * it. `TradingWorkspace` mounts `useSlTpMonitor`, which closes any open
 * position whose levels the live feed crosses; on a real account that is the
 * suite realizing trades nobody asked to close. See `global-setup.ts`.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e/ui",
  globalSetup: "./e2e/ui/global-setup.ts",
  globalTeardown: "./e2e/ui/global-teardown.ts",

  timeout: 90 * 1000,
  expect: { timeout: 15 * 1000 },

  // Serial: every spec drives the same account's open positions.
  fullyParallel: false,
  workers: 1,
  retries: 0,

  reporter: [["list"]],

  use: {
    baseURL,
    storageState: ".auth/ui-host.json",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15 * 1000,
    // Slow the drags down enough to be watchable when run headed.
    launchOptions: { slowMo: process.env.PWSLOW ? Number(process.env.PWSLOW) : 0 },
  },

  // A trading workspace at 1280x720 leaves almost no room below a floating
  // panel, so drag assertions there test the viewport clamp rather than the
  // drag. This is a realistic desktop trading window.
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } },
  ],

  webServer: {
    command: "bun run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
});
