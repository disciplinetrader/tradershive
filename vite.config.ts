// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Vitest reads this config too. `e2e/` holds Playwright specs, whose
    // `test.describe` throws when collected by vitest ("Playwright Test did not
    // expect test.describe() to be called here"), so keep the two runners apart.
    test: {
      exclude: ["**/node_modules/**", "**/dist/**", "**/.output/**", "e2e/**"],
    },
    esbuild: {
      // Strip debug logging from production bundles; keep console.error/warn for diagnostics.
      pure:
        process.env.NODE_ENV === "production"
          ? ["console.log", "console.debug", "console.info", "console.trace"]
          : [],
    },
  },
});
