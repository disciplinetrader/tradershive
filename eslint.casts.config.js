/**
 * check:casts — a deliberately tiny lint config for ONE defect class.
 *
 * Supabase's generated types already catch a misspelled column. Six shipped
 * anyway, every one of them downstream of a cast that switched the checker off
 * at the call site: `(r: any)` on mapped rows, `as never` on an insert payload.
 * `tsc` was green the whole time.
 *
 * This is a separate config from `eslint.config.js` on purpose. The main lint
 * currently reports ~164k prettier violations, so `eslint .` is noise nobody
 * can act on — adding rules there would bury them. This config carries only the
 * rules that would have caught the bug, so a failure here always means
 * something. Existing violations are suppressed via `eslint-suppressions.json`
 * (regenerate with `--suppress-all`); new ones fail.
 */
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config({
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/integrations/supabase/types.ts", "**/*.d.ts"],
  extends: [tseslint.configs.base],
  // Registered but with every rule left off. Source files carry
  // `eslint-disable-next-line react-hooks/...` comments, and ESLint reports a
  // disable directive naming an unloaded rule as an error of its own — which
  // would fail this check for reasons having nothing to do with casts.
  plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
  // Those same directives are then "unused" from this config's point of view.
  // They are meaningful to the main config; not this one's business.
  linterOptions: { reportUnusedDisableDirectives: "off" },
  rules: {
    "@typescript-eslint/no-explicit-any": "error",
    "no-restricted-syntax": [
      "error",
      {
        selector: "TSAsExpression > TSNeverKeyword",
        message:
          "`as never` disables the Supabase row types for this call. That is how `replay_homework.mistake_focus` shipped: the insert was cast, tsc passed, and every drill creation threw at runtime. Fix the payload, or regenerate types.ts if the schema moved.",
      },
      {
        selector: "TSAsExpression > TSAnyKeyword",
        message:
          "`as any` disables the Supabase row types for this call. Prefer a real type, or regenerate types.ts if the schema moved.",
      },
    ],
  },
});
