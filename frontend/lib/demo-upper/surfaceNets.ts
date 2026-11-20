import { BufferAttribute, BufferGeometry } from "three";
import type { Vec3 } from "./types";

/** Signed distance-like field in cm: negative inside, positive outside, roughly unit gradient near the surface. */
export type ScalarField = (x: number, y: number, z: number) => number;

export type SurfaceNetsOptions = {
  min: Vec3;
  max: Vec3;
  /** Grid spacing (cm). */
  step: number;
  /** Factor applied to the output positions (e.g. cm → m). */
  scale?: number;
};

const CORNERS: Vec3[] = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
/** The 12 cube edges as pairs of corner indices. */
const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

export function fieldGradient(f: ScalarField, x: number, y: number, z: number, eps = 0.05): Vec3 {
  return [
    (f(x + eps, y, z) - f(x - eps, y, z)) / (2 * eps),
    (f(x, y + eps, z) - f(x, y - eps, z)) / (2 * eps),
    (f(x, y, z + eps) - f(x, y, z - eps)) / (2 * eps),
  ];
}

/**
 * A grid face whose corners alternate in sign (+ − + −) is a saddle: surface nets would join the two
 * cells on either side with 4 quads around one edge (a non-manifold edge, often with a flipped triangle).
 * It only happens where the surface grazes the grid, so the corner values there are tiny. Resolve it the
 * way the bilinear face centre says (inside joined or split) by nudging the weakest disagreeing corner
 * across zero — a sub-millimetre change that leaves every face unambiguous.
 */
function resolveAmbiguousFaces(values: Float32Array, nx: number, ny: number, nz: number) {
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const NUDGE = 1e-4;
  const face = new Int32Array(4);
  for (let pass = 0; pass < 4; pass++) {
    let changed = 0;
    for (let k = 0; k < nz; k++) {
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          // Faces spanned from this corner in the xy, yz and zx planes (corners in cyclic order).
          for (let o = 0; o < 3; o++) {
            if (o === 0) {
              if (i >= nx - 1 || j >= ny - 1) continue;
              face[0] = at(i, j, k); face[1] = at(i + 1, j, k); face[2] = at(i + 1, j + 1, k); face[3] = at(i, j + 1, k);
            } else if (o === 1) {
              if (j >= ny - 1 || k >= nz - 1) continue;
              face[0] = at(i, j, k); face[1] = at(i, j + 1, k); face[2] = at(i, j + 1, k + 1); face[3] = at(i, j, k + 1);
            } else {
              if (i >= nx - 1 || k >= nz - 1) continue;
              face[0] = at(i, j, k); face[1] = at(i, j, k + 1); face[2] = at(i + 1, j, k + 1); face[3] = at(i + 1, j, k);
            }
            const s0 = values[face[0]] < 0, s1 = values[face[1]] < 0, s2 = values[face[2]] < 0, s3 = values[face[3]] < 0;
            if (!(s0 === s2 && s1 === s3 && s0 !== s1)) continue;
            const centre = (values[face[0]] + values[face[1]] + values[face[2]] + values[face[3]]) / 4;
            const joinInside = centre < 0;
            // Flip the weakest corner of the side that loses the saddle.
            let weakest = -1;
            for (let c = 0; c < 4; c++) {
              const v = values[face[c]];
              if (v < 0 === joinInside) continue;
              if (weakest < 0 || Math.abs(v) < Math.abs(values[face[weakest]])) weakest = c;
            }
            values[face[weakest]] = joinInside ? -NUDGE : NUDGE;
            changed++;
          }
        }
      }
    }
    if (changed === 0) return;
  }
}

/**
 * Naive surface nets: one vertex per grid cell that the surface crosses, one quad per crossed grid edge.
 * Gives a single closed, indexed, consistently wound mesh (faces point towards +field, i.e. outwards)
 * with no seams between parts that were blended in the field. Each vertex is then projected onto the
 * zero level set and its normal is the field gradient, so shading is smooth without faceting.
 */
export function surfaceNets(field: ScalarField, options: SurfaceNetsOptions): BufferGeometry {
  const { min, max, step, scale = 1 } = options;
  const nx = Math.ceil((max[0] - min[0]) / step) + 1;
  const ny = Math.ceil((max[1] - min[1]) / step) + 1;
  const nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const at = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  // Sample the field block by block: a block whose centre is far from the surface cannot contain it
  // (the field grows at most ~1 cm per cm), so it is filled with the centre value instead of sampled.
  const values = new Float32Array(nx * ny * nz);
  const B = 4;
  const skip = 1.5 * B * step * Math.sqrt(3) * 0.5;
  for (let bk = 0; bk < nz; bk += B) {
    for (let bj = 0; bj < ny; bj += B) {
      for (let bi = 0; bi < nx; bi += B) {
        const ei = Math.min(nx, bi + B + 1), ej = Math.min(ny, bj + B + 1), ek = Math.min(nz, bk + B + 1);
        const fc = field(min[0] + (bi + (ei - 1 - bi) / 2) * step, min[1] + (bj + (ej - 1 - bj) / 2) * step, min[2] + (bk + (ek - 1 - bk) / 2) * step);
        const far = Math.abs(fc) > skip;
        for (let k = bk; k < ek; k++) {
          const z = min[2] + k * step;
          for (let j = bj; j < ej; j++) {
            const y = min[1] + j * step;
            for (let i = bi; i < ei; i++) values[at(i, j, k)] = far ? fc : field(min[0] + i * step, y, z);
          }
        }
      }
    }
  }

  resolveAmbiguousFaces(values, nx, ny, nz);

  // 1) One vertex per crossed cell, at the mean of its edge crossings.
  const cellVertex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cellAt = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const positions: number[] = [];
  const corner = new Float64Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [di, dj, dk] = CORNERS[c];
          corner[c] = values[at(i + di, j + dj, k + dk)];
          if (corner[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, count = 0;
        for (const [c0, c1] of EDGES) {
          const v0 = corner[c0];
          const v1 = corner[c1];
          if (v0 < 0 === v1 < 0) continue;
          const t = v0 / (v0 - v1);
          const a = CORNERS[c0];
          const b = CORNERS[c1];
          sx += a[0] + (b[0] - a[0]) * t;
          sy += a[1] + (b[1] - a[1]) * t;
          sz += a[2] + (b[2] - a[2]) * t;
          count++;
        }
        cellVertex[cellAt(i, j, k)] = positions.length / 3;
        positions.push(min[0] + (i + sx / count) * step, min[1] + (j + sy / count) * step, min[2] + (k + sz / count) * step);
      }
    }
  }

  // 2) One quad per crossed grid edge, wound so the face normal points to the positive (outside) side.
  const indices: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) [b, d] = [d, b];
    indices.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const inside = values[at(i, j, k)] < 0;
        // x-edge: cells around it lie in the (y, z) plane; y × z = +x.
        if (i < nx - 1 && j > 0 && k > 0 && j < ny - 1 && k < nz - 1 && inside !== values[at(i + 1, j, k)] < 0) {
          quad(cellVertex[cellAt(i, j - 1, k - 1)], cellVertex[cellAt(i, j, k - 1)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i, j - 1, k)], !inside);
        }
        // y-edge: plane (z, x); z × x = +y.
        if (j < ny - 1 && i > 0 && k > 0 && i < nx - 1 && k < nz - 1 && inside !== values[at(i, j + 1, k)] < 0) {
          quad(cellVertex[cellAt(i - 1, j, k - 1)], cellVertex[cellAt(i - 1, j, k)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i, j, k - 1)], !inside);
        }
        // z-edge: plane (x, y); x × y = +z.
        if (k < nz - 1 && i > 0 && j > 0 && i < nx - 1 && j < ny - 1 && inside !== values[at(i, j, k + 1)] < 0) {
          quad(cellVertex[cellAt(i - 1, j - 1, k)], cellVertex[cellAt(i, j - 1, k)], cellVertex[cellAt(i, j, k)], cellVertex[cellAt(i - 1, j, k)], !inside);
        }
      }
    }
  }

  // 3) Project vertices onto the surface (Newton steps along the gradient) and take normals from the field.
  const count = positions.length / 3;
  const pos = new Float32Array(positions.length);
  const nor = new Float32Array(positions.length);
  for (let v = 0; v < count; v++) {
    let x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2];
    // Newton steps; once on the surface the last gradient doubles as the normal (saves 6 field calls).
    let g: Vec3 | null = null;
    for (let it = 0; it < 4; it++) {
      const f = field(x, y, z);
      g = fieldGradient(field, x, y, z);
      if (Math.abs(f) < 1e-3) break;
      const g2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
      if (g2 < 1e-8) break;
      const s = Math.max(-0.3 * step, Math.min(0.3 * step, f / g2));
      // Keep each projected vertex near its own cell crossings. Across a
      // narrow crease a full Newton step can fold the neighbouring quad.
      if (Math.hypot(x - g[0] * s - positions[3 * v],
        y - g[1] * s - positions[3 * v + 1],
        z - g[2] * s - positions[3 * v + 2]) > step * 0.2) break;
      x -= g[0] * s;
      y -= g[1] * s;
      z -= g[2] * s;
      g = null;
    }
    if (!g) g = fieldGradient(field, x, y, z);
    const len = Math.hypot(g[0], g[1], g[2]) || 1;
    pos.set([x * scale, y * scale, z * scale], 3 * v);
    nor.set([g[0] / len, g[1] / len, g[2] / len], 3 * v);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(pos, 3));
  geometry.setAttribute("normal", new BufferAttribute(nor, 3));
  geometry.setIndex(indices);
  return geometry;
}
