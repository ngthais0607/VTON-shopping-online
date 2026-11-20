import { BufferAttribute, BufferGeometry } from "three";
import type { Ring3D, Vec3 } from "./types";

export const CM_TO_M = 0.01;

export type RingsToGeometryOptions = {
  capStart?: boolean;
  capEnd?: boolean;
  /** Màu RGB cho từng đỉnh của các vòng (rings.length × segments × 3). */
  colors?: number[];
};

export function ringPoint(ring: Ring3D, i: number): Vec3 {
  const n = ring.radii.length;
  const t = (2 * Math.PI * i) / n;
  const r = ring.radii[i];
  const c = Math.cos(t) * r;
  const s = Math.sin(t) * r;
  return [
    ring.center[0] + c * ring.u[0] + s * ring.v[0],
    (ring.heights?.[i] ?? ring.center[1]) + c * ring.u[1] + s * ring.v[1],
    ring.center[2] + c * ring.u[2] + s * ring.v[2],
  ];
}

/**
 * Nối các vòng (cùng số điểm) thành ống tam giác; mặt quay ra ngoài khi u × v = hướng đi của ống.
 * Đầu vào tính bằng cm, đầu ra tính bằng mét.
 */
export function ringsToGeometry(rings: readonly Ring3D[], options: RingsToGeometryOptions = {}): BufferGeometry {
  if (rings.length < 2) throw new Error("Cần ít nhất 2 vòng");
  const n = rings[0].radii.length;
  if (rings.some((r) => r.radii.length !== n)) throw new Error("Các vòng phải cùng số điểm");
  const { capStart = false, capEnd = false, colors } = options;

  const positions: number[] = [];
  const colorOut: number[] = colors ? [...colors] : [];
  for (const ring of rings) for (let i = 0; i < n; i++) positions.push(...ringPoint(ring, i));

  const indices: number[] = [];
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const i1 = (i + 1) % n;
      const a = j * n + i;
      const b = (j + 1) * n + i;
      const c = j * n + i1;
      const d = (j + 1) * n + i1;
      indices.push(a, c, b, c, d, b);
    }
  }

  const addCap = (ringIndex: number, start: boolean) => {
    const ring = rings[ringIndex];
    const center = positions.length / 3;
    positions.push(...ring.center);
    if (colors) colorOut.push(...colors.slice(ringIndex * n * 3, ringIndex * n * 3 + 3));
    for (let i = 0; i < n; i++) {
      const p = ringIndex * n + i;
      const p1 = ringIndex * n + ((i + 1) % n);
      if (start) indices.push(center, p1, p);
      else indices.push(center, p, p1);
    }
  };
  if (capStart) addCap(0, true);
  if (capEnd) addCap(rings.length - 1, false);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(positions.map((v) => v * CM_TO_M)), 3));
  if (colors) geometry.setAttribute("color", new BufferAttribute(new Float32Array(colorOut), 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function horizontalRing(y: number, radii: number[]): Ring3D {
  return { center: [0, y, 0], u: [1, 0, 0], v: [0, 0, 1], radii };
}

/** Khung cho ống chạy theo hướng d (đơn vị) nằm trong mặt XY: v = Z, u = v × d để u × v = d. */
export function axisFrame(d: Vec3): { u: Vec3; v: Vec3 } {
  const v: Vec3 = [0, 0, 1];
  const u: Vec3 = [v[1] * d[2] - v[2] * d[1], v[2] * d[0] - v[0] * d[2], v[0] * d[1] - v[1] * d[0]];
  return { u, v };
}

export function addScaled(p: Vec3, d: Vec3, t: number): Vec3 {
  return [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t];
}
