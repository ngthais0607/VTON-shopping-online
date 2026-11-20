import { describe, expect, it } from "vitest";
import { GARMENT_SIZES } from "@/lib/demo-upper/demoCatalog";
import { BODY_PRESETS, DEFAULT_BODY } from "@/lib/demo-upper/demoPresets";
import { computeFitHints, easeHint, INSUFFICIENT, shoulderHint } from "@/lib/demo-upper/fitHints";

describe("fit hints", () => {
  it("T09: ngực 104 + S → ease −8, cảnh báo chật, size không bị ghi đè", () => {
    const garment = { ...GARMENT_SIZES.S };
    const hints = computeFitHints({ ...DEFAULT_BODY, chestCm: 104 }, garment);
    expect(hints.chest.diffCm).toBe(-8);
    expect(hints.chest.tone).toBe("tight");
    expect(hints.chest.label).toBe("Tight for your measurements");
    expect(hints.warnings.some((w) => w.includes("chest"))).toBe(true);
    expect(garment).toEqual(GARMENT_SIZES.S);
  });

  it("ngưỡng ease ngực/eo", () => {
    expect(easeHint(-0.1).tone).toBe("tight");
    expect(easeHint(0).tone).toBe("snug");
    expect(easeHint(3.9).tone).toBe("snug");
    expect(easeHint(4).tone).toBe("regular");
    expect(easeHint(12).tone).toBe("regular");
    expect(easeHint(12.1).tone).toBe("loose");
  });

  it("ngưỡng vai: < −1 hẹp, −1..+3 vừa, > +3 rơi vai", () => {
    expect(shoulderHint(-1.1).tone).toBe("tight");
    expect(shoulderHint(-1).tone).toBe("regular");
    expect(shoulderHint(3).tone).toBe("regular");
    expect(shoulderHint(3.1).tone).toBe("loose");
  });

  it("preset Rộng: L dư vừa, M sát, S chật ở ngực", () => {
    const broad = BODY_PRESETS.find((p) => p.id === "broad")!.body;
    expect(computeFitHints(broad, GARMENT_SIZES.L).chest.tone).toBe("regular");
    expect(computeFitHints(broad, GARMENT_SIZES.M).chest.tone).toBe("snug");
    expect(computeFitHints(broad, GARMENT_SIZES.S).chest.tone).toBe("tight");
  });

  it("thiếu dữ liệu → 'Chưa đủ dữ liệu', không có phần trăm", () => {
    const hints = computeFitHints(DEFAULT_BODY, GARMENT_SIZES.M, { chestCm: false });
    expect(hints.chest.label).toBe(INSUFFICIENT);
    expect(hints.chest.diffCm).toBeNull();
    const all = JSON.stringify(computeFitHints(DEFAULT_BODY, GARMENT_SIZES.M));
    expect(all).not.toMatch(/%/);
  });
});
