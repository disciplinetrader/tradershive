import { z } from "zod";
import {
  COUNTRIES,
  EXPERIENCE_LEVELS,
  MARKETS,
  TIMEZONES,
  TRADING_STYLES,
} from "./constants";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(24, "Username must be 24 characters or less")
  .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(255);

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72, "Max 72 characters")
  .regex(/[A-Z]/, "Must include an uppercase letter")
  .regex(/[a-z]/, "Must include a lowercase letter")
  .regex(/\d/, "Must include a number")
  .regex(/[^A-Za-z0-9]/, "Must include a special character");

export const experienceSchema = z.enum(
  EXPERIENCE_LEVELS.map((e) => e.value) as [string, ...string[]],
);
export const marketSchema = z.enum(
  MARKETS.map((m) => m.value) as [string, ...string[]],
);
export const tradingStyleSchema = z.enum(
  TRADING_STYLES.map((s) => s.value) as [string, ...string[]],
);
export const countrySchema = z.enum(COUNTRIES as unknown as [string, ...string[]]);
export const timezoneSchema = z.enum(TIMEZONES as unknown as [string, ...string[]]);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(72),
  remember: z.boolean().optional(),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    first_name: z.string().trim().min(1, "Required").max(40),
    last_name: z.string().trim().min(1, "Required").max(40),
    username: usernameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirm_password: z.string(),
    country: countrySchema,
    timezone: timezoneSchema,
    experience: experienceSchema,
    preferred_markets: z.array(marketSchema).min(1, "Choose at least one market"),
    trading_style: tradingStyleSchema,
    accept_terms: z.literal(true, {
      errorMap: () => ({ message: "You must accept the terms to continue" }),
    }),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  });
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotSchema = z.object({ email: emailSchema });
export type ForgotValues = z.infer<typeof forgotSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirm_password: z.string(),
  })
  .refine((v) => v.password === v.confirm_password, {
    path: ["confirm_password"],
    message: "Passwords do not match",
  });

// Password strength — 0..4
export function scorePassword(pw: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  checks: { label: string; pass: boolean }[];
} {
  const checks = [
    { label: "8+ characters", pass: pw.length >= 8 },
    { label: "Uppercase letter", pass: /[A-Z]/.test(pw) },
    { label: "Lowercase letter", pass: /[a-z]/.test(pw) },
    { label: "Number", pass: /\d/.test(pw) },
    { label: "Special character", pass: /[^A-Za-z0-9]/.test(pw) },
  ];
  const passed = checks.filter((c) => c.pass).length;
  const score = Math.max(0, Math.min(4, passed - 1)) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Excellent"] as const;
  const colors = [
    "bg-danger",
    "bg-danger/80",
    "bg-warning",
    "bg-primary",
    "bg-success",
  ];
  return { score, label: labels[score], color: colors[score], checks };
}
