/** Số điểm trên mỗi mặt cắt. 96 đủ để sai số chu vi polygon nhỏ hơn nhiều so với 0.5 cm. */
export const RING_SEGMENTS = 96;
export const TORSO_EXPONENT = 2.6;

export function ringAngle(index: number, segments = RING_SEGMENTS): number {
  return (2 * Math.PI * index) / segments;
}

/** Bán kính cực của superellipse |x/a|^n + |z/b|^n = 1 tại góc θ (x = r·cosθ, z = r·sinθ). */
export function superellipseRadius(theta: number, a: number, b: number, n: number): number {
  const c = Math.abs(Math.cos(theta)) / a;
  const s = Math.abs(Math.sin(theta)) / b;
  return Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n);
}

export function superellipseRadii(a: number, b: number, n: number, segments = RING_SEGMENTS): number[] {
  return Array.from({ length: segments }, (_, i) => superellipseRadius(ringAngle(i, segments), a, b, n));
}

/** Chu vi thật của polygon nối các điểm (r_i, θ_i). Đây là chu vi được kiểm tra, không phải công thức xấp xỉ. */
export function polygonPerimeter(radii: readonly number[]): number {
  const n = radii.length;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const t0 = ringAngle(i, n);
    const t1 = ringAngle((i + 1) % n, n);
    const r0 = radii[i];
    const r1 = radii[(i + 1) % n];
    sum += Math.hypot(r1 * Math.cos(t1) - r0 * Math.cos(t0), r1 * Math.sin(t1) - r0 * Math.sin(t0));
  }
  return sum;
}

export type SolvedSection = { a: number; b: number; radii: number[]; perimeter: number };

/**
 * Tìm bán trục a (b = a·depthRatio) để chu vi polygon = perimeterCm.
 * Với tỉ lệ b/a cố định, polygon co giãn đồng dạng nên chu vi tỉ lệ tuyến tính với a:
 * giải đóng thay cho binary search, sai số chỉ còn sai số dấu phẩy động.
 */
export function solveSuperellipse(
  perimeterCm: number,
  depthRatio: number,
  exponent = TORSO_EXPONENT,
  segments = RING_SEGMENTS,
): SolvedSection {
  if (!(perimeterCm > 0) || !(depthRatio > 0)) throw new Error("Chu vi và tỉ lệ sâu phải dương");
  const unit = polygonPerimeter(superellipseRadii(1, depthRatio, exponent, segments));
  const a = perimeterCm / unit;
  const b = a * depthRatio;
  const radii = superellipseRadii(a, b, exponent, segments);
  return { a, b, radii, perimeter: polygonPerimeter(radii) };
}
