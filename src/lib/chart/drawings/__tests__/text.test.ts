import { describe, expect, it } from "vitest";
import { sanitizeDrawingText, textLines, TEXT_LIMITS } from "../types";

describe("sanitizeDrawingText", () => {
  it("treats whitespace-only input as empty so no ghost drawing is stored", () => {
    expect(sanitizeDrawingText("   \n\n  ")).toBe("");
    expect(sanitizeDrawingText(undefined)).toBe("");
    expect(sanitizeDrawingText(null)).toBe("");
  });

  it("strips control characters that would corrupt canvas measurement", () => {
    expect(sanitizeDrawingText("a\u0000b\u0007c")).toBe("abc");
  });

  it("clamps line count and line length", () => {
    const many = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    expect(textLines(many)).toHaveLength(TEXT_LIMITS.maxLines);
    const long = "x".repeat(500);
    expect(textLines(long)[0]).toHaveLength(TEXT_LIMITS.maxLineChars);
  });

  it("caps total characters", () => {
    expect(sanitizeDrawingText("y".repeat(5000)).length).toBeLessThanOrEqual(TEXT_LIMITS.maxChars);
  });

  it("normalises CRLF and drops trailing blank lines", () => {
    expect(sanitizeDrawingText("a\r\nb\n\n\n")).toBe("a\nb");
  });

  it("keeps interior blank lines so intentional spacing survives", () => {
    expect(sanitizeDrawingText("a\n\nb")).toBe("a\n\nb");
  });
});
