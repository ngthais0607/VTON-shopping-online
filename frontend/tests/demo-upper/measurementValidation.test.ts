import { describe, expect, it } from "vitest";
import { MEASUREMENT_RANGES, parseMeasurementInput, validateField, validateMeasurements } from "@/lib/demo-upper/measurementValidation";

describe("measurement validation", () => {
  it("T06: NaN, -1, 9999 và rỗng đều được xử lý, giá trị dựng hình luôn hữu hạn trong khoảng", () => {
    const cases: unknown[] = [Number.NaN, -1, 9999, "", "   ", undefined, "abc", "12cm"];
    for (const raw of cases) {
      const r = validateField("chestCm", raw);
      expect(r.status).not.toBe("ok");
      expect(Number.isFinite(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(MEASUREMENT_RANGES.chestCm.min);
      expect(r.value).toBeLessThanOrEqual(MEASUREMENT_RANGES.chestCm.max);
      expect(r.message).toBeTruthy();
    }
    expect(validateField("chestCm", "").status).toBe("missing");
    expect(validateField("chestCm", Number.NaN).status).toBe("invalid");
    expect(validateField("chestCm", -1).status).toBe("out_of_range");
    expect(validateField("chestCm", 9999).value).toBe(120);
  });

  it("chấp nhận dấu phẩy thập phân và chuỗi số", () => {
    expect(parseMeasurementInput("92,5")).toBe(92.5);
    expect(validateField("heightCm", "172").status).toBe("ok");
  });

  it("trường thiếu dùng giá trị hợp lệ trước đó và đánh dấu chưa đủ", () => {
    const r = validateMeasurements({ heightCm: "170", chestCm: "", waistCm: 80, shoulderCm: 44 }, { chestCm: 100 });
    expect(r.complete).toBe(false);
    expect(r.values.chestCm).toBe(100);
    expect(r.fields.chestCm.status).toBe("missing");
  });
});
