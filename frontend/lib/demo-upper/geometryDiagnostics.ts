import type { BufferGeometry } from "three";

export type GeometryDiagnostics = {
  vertexCount: number;
  triangleCount: number;
  nonFiniteValues: number;
  degenerateTriangles: number;
};

/** Kiểm tra geometry: toạ độ hữu hạn và không có tam giác diện tích ~0 (đơn vị m²). */
export function diagnoseGeometry(geometry: BufferGeometry, minArea = 1e-10): GeometryDiagnostics {
  const pos = geometry.getAttribute("position");
  const arr = pos.array as ArrayLike<number>;
  let nonFiniteValues = 0;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) nonFiniteValues++;

  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : pos.count / 3;
  const at = (k: number) => (index ? index.getX(k) : k);
  let degenerateTriangles = 0;
  for (let t = 0; t < triangleCount; t++) {
    const a = at(t * 3);
    const b = at(t * 3 + 1);
    const c = at(t * 3 + 2);
    const abx = pos.getX(b) - pos.getX(a), aby = pos.getY(b) - pos.getY(a), abz = pos.getZ(b) - pos.getZ(a);
    const acx = pos.getX(c) - pos.getX(a), acy = pos.getY(c) - pos.getY(a), acz = pos.getZ(c) - pos.getZ(a);
    const cx = aby * acz - abz * acy, cy = abz * acx - abx * acz, cz = abx * acy - aby * acx;
    const area = 0.5 * Math.hypot(cx, cy, cz);
    if (!(area > minArea)) degenerateTriangles++;
  }
  return { vertexCount: pos.count, triangleCount, nonFiniteValues, degenerateTriangles };
}
