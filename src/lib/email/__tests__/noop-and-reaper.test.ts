import { describe, it, expect } from "vitest";
import { isEmailJobStuck, STUCK_EMAIL_TTL_MS } from "../service.server";
import { noopEmailProvider } from "../providers/noop";

describe("noop provider (O-1)", () => {
  it("succeeds but flags the send as skipped (not delivered)", async () => {
    const r = await noopEmailProvider.send({
      to: { email: "x@example.com" }, subject: "s", html: "<p>h</p>", text: "h",
      category: "system" as never, template: "t" as never,
    } as never);
    expect(r.ok).toBe(true);
    // The whole point: the queue must record `skipped`, never `sent`.
    expect((r as { skipped?: boolean }).skipped).toBe(true);
    expect((r as { providerMessageId: unknown }).providerMessageId).toBeNull();
  });
});

describe("isEmailJobStuck (O-1 reaper)", () => {
  const now = Date.parse("2026-09-18T12:00:00Z");
  it("is not stuck when never claimed", () => {
    expect(isEmailJobStuck(null, now)).toBe(false);
    expect(isEmailJobStuck(undefined, now)).toBe(false);
  });
  it("is not stuck when claimed recently", () => {
    expect(isEmailJobStuck(new Date(now - 60_000).toISOString(), now)).toBe(false);
  });
  it("is stuck once locked_at is older than the TTL", () => {
    expect(isEmailJobStuck(new Date(now - STUCK_EMAIL_TTL_MS - 1000).toISOString(), now)).toBe(true);
  });
  it("refuses to guess on an unparseable timestamp", () => {
    expect(isEmailJobStuck("not-a-date", now)).toBe(false);
  });
});
