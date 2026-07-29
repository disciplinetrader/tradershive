/**
 * Map Supabase Auth error messages to friendly, actionable copy.
 * Keeps the user oriented: what went wrong, what to try next.
 */
export function friendlyAuthError(err: unknown, context: "signin" | "signup" | "forgot" | "reset" = "signin"): string {
  const raw = (err as { message?: string } | null | undefined)?.message ?? String(err ?? "");
  const msg = raw.toLowerCase();

  // Sign-in
  if (msg.includes("invalid login credentials") || msg.includes("invalid_credentials")) {
    return "The email or password you entered doesn't match this account. Try again or reset your password.";
  }
  if (msg.includes("email not confirmed")) {
    return "Please verify your email first. Check your inbox for the confirmation link — we can resend it if needed.";
  }
  if (msg.includes("user not found") || msg.includes("no user found")) {
    return context === "forgot"
      ? "We couldn't find an account with that email. Double-check the address or create a new account."
      : "No account matches that email. Create one to get started.";
  }

  // Sign-up
  if (msg.includes("already registered") || msg.includes("user already registered") || msg.includes("already exists")) {
    return "An account with this email already exists. Sign in instead, or reset your password if you've forgotten it.";
  }
  if (msg.includes("password should be at least")) {
    return "Your password is too short. Use at least 8 characters — mix letters, numbers, and a symbol.";
  }
  if (msg.includes("weak password") || msg.includes("password is too weak") || msg.includes("password_too_weak")) {
    return "This password is too easy to guess. Add an uppercase letter, a number, and a special character.";
  }
  if (msg.includes("pwned") || msg.includes("compromised")) {
    return "This password has appeared in a public data breach. Please choose a different one to keep your account safe.";
  }
  if (msg.includes("invalid email") || msg.includes("email address") && msg.includes("invalid")) {
    return "That email doesn't look right. Double-check for typos (e.g. missing @ or domain).";
  }
  if (msg.includes("signup") && msg.includes("disabled")) {
    return "New signups are temporarily paused. Please try again in a little while.";
  }

  // Rate limits
  if (msg.includes("over_email_send_rate_limit") || msg.includes("email rate limit") || msg.includes("rate limit")) {
    return "You've requested too many emails in a short time. Please wait a few minutes before trying again.";
  }
  if (msg.includes("429") || msg.includes("too many requests")) {
    return "Too many attempts. Wait a moment and try again.";
  }

  // Reset / recovery
  if (msg.includes("token has expired") || msg.includes("invalid token") || msg.includes("otp_expired")) {
    return "This reset link has expired or already been used. Request a new one to continue.";
  }
  if (msg.includes("same_password") || msg.includes("new password should be different")) {
    return "Your new password must be different from your current one.";
  }

  // Network / server
  if (msg.includes("failed to fetch") || msg.includes("network")) {
    return "We couldn't reach the server. Check your connection and try again.";
  }
  if (msg.includes("500") || msg.includes("internal server")) {
    return "Something went wrong on our end. Please try again in a moment.";
  }

  // Fallback — never expose raw stack traces
  if (raw && raw.length < 160) return raw;
  return context === "signin"
    ? "We couldn't sign you in. Please try again."
    : context === "signup"
      ? "We couldn't create your account. Please try again."
      : context === "forgot"
        ? "We couldn't send the reset email. Please try again."
        : "We couldn't update your password. Please try again.";
}

/** Turn an email domain into an inbox deep-link where possible. */
export function inboxUrlForEmail(email: string | undefined | null): { url: string; label: string } | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  if (domain === "gmail.com" || domain === "googlemail.com") {
    return { url: "https://mail.google.com/mail/u/0/#inbox", label: "Open Gmail" };
  }
  if (["outlook.com", "hotmail.com", "live.com", "msn.com"].includes(domain)) {
    return { url: "https://outlook.live.com/mail/0/inbox", label: "Open Outlook" };
  }
  if (domain === "yahoo.com" || domain.endsWith(".yahoo.com")) {
    return { url: "https://mail.yahoo.com/", label: "Open Yahoo Mail" };
  }
  if (domain === "icloud.com" || domain === "me.com" || domain === "mac.com") {
    return { url: "https://www.icloud.com/mail", label: "Open iCloud Mail" };
  }
  if (domain === "proton.me" || domain === "protonmail.com") {
    return { url: "https://mail.proton.me/u/0/inbox", label: "Open Proton Mail" };
  }
  // Generic — no reliable webmail URL
  return null;
}
