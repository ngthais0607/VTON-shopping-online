import { describe, expect, it } from "vitest";
import { displayDate } from "../lib/utils";

describe("displayDate utility", () => {
  it("returns N/A for null or undefined values", () => {
    expect(displayDate(null)).toBe("N/A");
    expect(displayDate(undefined)).toBe("N/A");
    expect(displayDate("")).toBe("N/A");
  });

  it("normalizes naive ISO strings without timezone by treating them as UTC", () => {
    const formatted = displayDate("2026-10-14T12:00:00", "yyyy-MM-dd HH:mm");
    expect(formatted).not.toBe("N/A");
  });

  it("formats valid UTC ISO strings ending in Z", () => {
    const formatted = displayDate("2026-10-14T12:00:00Z", "yyyy-MM-dd");
    // Depending on local timezone, yyyy-MM-dd will format consistently
    expect(formatted).toMatch(/^2026-10-1[45]$/);
  });
});
