import type { KeyRing } from "./types";

export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** PCHIP (Fritsch–Butland) tangent at a node: monotone, never overshoots, zero at local extrema. */
function nodeSlope(h0: number, d0: number, h1: number, d1: number): number {
  if (d0 * d1 <= 0) return 0;
  const w1 = 2 * h1 + h0;
  const w2 = h1 + 2 * h0;
  return (w1 + w2) / (w1 / d0 + w2 / d1);
}

/**
 * Radii at height y: monotone cubic (PCHIP) through all key rings, per angle.
 * Unlike a per-segment smoothstep it has no flat "plateau" at each key ring, so neck → shoulder →
 * chest → waist flow into each other instead of looking like stacked blocks, and it never overshoots
 * (a ring's radius always stays between its neighbours). keyRings are sorted by decreasing y.
 * Outside the range the boundary ring is returned.
 */
export function sampleRadiiAt(keyRings: readonly KeyRing[], y: number): number[] {
  if (keyRings.length === 0) throw new Error("Need at least one key ring");
  if (y >= keyRings[0].y) return [...keyRings[0].radii];
  const last = keyRings[keyRings.length - 1];
  if (y <= last.y) return [...last.radii];
  // Parameter s = -y increases along the list.
  let k = 0;
  while (k < keyRings.length - 2 && y < keyRings[k + 1].y) k++;
  const a = keyRings[k];
  const b = keyRings[k + 1];
  const h = a.y - b.y;
  if (h <= 0) return [...a.radii];
  const t = (a.y - y) / h;
  const prev = k > 0 ? keyRings[k - 1] : null;
  const next = k + 2 < keyRings.length ? keyRings[k + 2] : null;
  const hPrev = prev ? prev.y - a.y : 0;
  const hNext = next ? b.y - next.y : 0;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return a.radii.map((ra, i) => {
    const rb = b.radii[i];
    const d = (rb - ra) / h;
    const m0 = prev && hPrev > 0 ? nodeSlope(hPrev, (ra - prev.radii[i]) / hPrev, h, d) : d;
    const m1 = next && hNext > 0 ? nodeSlope(h, d, hNext, (next.radii[i] - rb) / hNext) : d;
    return h00 * ra + h10 * h * m0 + h01 * rb + h11 * h * m1;
  });
}

/** Các độ cao lấy mẫu từ top xuống bottom, bước ~stepCm, luôn chứa đúng các y khoá. */
export function sampleLevels(keyYs: readonly number[], top: number, bottom: number, stepCm = 1.5): number[] {
  const levels = new Set<number>();
  const count = Math.max(1, Math.ceil((top - bottom) / stepCm));
  for (let i = 0; i <= count; i++) levels.add(+(top - ((top - bottom) * i) / count).toFixed(4));
  for (const y of keyYs) if (y <= top && y >= bottom) levels.add(+y.toFixed(4));
  const sorted = [...levels].sort((a, b) => b - a);
  // Bỏ các mức quá sát nhau để tránh tam giác suy biến; luôn giữ mức khoá.
  const keySet = new Set(keyYs.map((y) => +y.toFixed(4)));
  const out: number[] = [];
  for (const y of sorted) {
    const prev = out[out.length - 1];
    if (prev === undefined || prev - y > 0.4) out.push(y);
    else if (keySet.has(y) && !keySet.has(prev)) out[out.length - 1] = y;
  }
  return out;
}
