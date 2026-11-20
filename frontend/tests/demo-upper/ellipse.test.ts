import { describe, expect, it } from "vitest";
import { polygonPerimeter, solveSuperellipse, superellipseRadii } from "@/lib/demo-upper/ellipse";

describe("superellipse solver", () => {
  it("T01: chu vi polygon thật sai ≤ 0.5 cm", () => {
    for (const target of [62, 76, 84, 92, 102, 120]) {
      for (const ratio of [0.68, 0.72, 0.76]) {
        for (const segments of [64, 96]) {
          const solved = solveSuperellipse(target, ratio, 2.6, segments);
          expect(Math.abs(polygonPerimeter(solved.radii) - target)).toBeLessThanOrEqual(0.5);
          expect(solved.b / solved.a).toBeCloseTo(ratio, 6);
        }
      }
    }
  });

  it("đo chu vi trên polygon, không phải công thức xấp xỉ", () => {
    // hình tròn r = 10: polygon 96 cạnh hơi ngắn hơn 2πr
    const radii = superellipseRadii(10, 10, 2, 96);
    const p = polygonPerimeter(radii);
    expect(p).toBeLessThan(2 * Math.PI * 10);
    expect(p).toBeGreaterThan(2 * Math.PI * 10 - 0.1);
  });

  it("từ chối đầu vào không dương", () => {
    expect(() => solveSuperellipse(0, 0.7)).toThrow();
    expect(() => solveSuperellipse(Number.NaN, 0.7)).toThrow();
  });
});
