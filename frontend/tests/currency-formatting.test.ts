import { describe, expect, it } from "vitest";
import { formatCurrency } from "../lib/utils";

describe("formatCurrency utility", () => {
  it("formats VND amounts with Vietnamese currency notation", () => {
    const formatted = formatCurrency(150000, "VND");
    // vi-VN format contains non-breaking space or standard spacing + currency symbol ₫
    expect(formatted.replace(/\s+/g, " ")).toMatch(/150\.000\s*₫/);
  });

  it("defaults to VND when currency is omitted", () => {
    const formatted = formatCurrency(250000);
    expect(formatted.replace(/\s+/g, " ")).toMatch(/250\.000\s*₫/);
  });

  it("formats foreign currency with standard style", () => {
    const formatted = formatCurrency(100, "USD");
    expect(formatted).toBe("$100.00");
  });
});
