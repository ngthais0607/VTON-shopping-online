import type { BufferGeometry } from "three";
import { armRadiusAt, torsoCenterZ, torsoRadiiAt, torsoShapeFactor, type ArmModel, type BodyModel } from "./bodyGeometry";
import { polygonPerimeter, RING_SEGMENTS } from "./ellipse";
import { CM_TO_M } from "./ringsToGeometry";
import { surfaceNets } from "./surfaceNets";
import type { Vec3 } from "./types";

/**
 * The mannequin is one implicit surface: a sculpted torso (from the measured key rings) smoothly
 * unioned with two arms and their rounded shoulders, then meshed in one piece. That is what makes shoulders, armpits and
 * the neck continuous instead of separate tubes pushed into each other.
 */

/** Blend radius (cm) where arm and torso meet: rounds the shoulder and fills the armpit like a real form. */
export const ARM_BLEND_CM = 1.8;
/** Rounding (cm) of the cut edges at the neck top and the base. */
export const NECK_ROUND_CM = 1.4;
export const BASE_ROUND_CM = 5;
/** Grid spacing used to mesh the mannequin (cm). */
export const MESH_STEP_CM = 0.85;

const ROW_STEP = 0.25;
const N = RING_SEGMENTS;
const TWO_PI = Math.PI * 2;

/** Polynomial smooth minimum. Equal to min(a, b) once |a − b| ≥ k. */
export function smin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export type BodyField = {
  /** Whole mannequin (negative inside). */
  full: (x: number, y: number, z: number) => number;
  /** Torso only, plus the shoulder/armpit blend: what the tee body must clear. */
  torsoSurface: (x: number, y: number, z: number) => number;
  /** One arm only, plus the blend: what a sleeve must clear. */
  armSurface: (arm: 0 | 1, x: number, y: number, z: number) => number;
  /** Axis of the torso at height y (for measuring a girth). */
  centerZ: (y: number) => number;
  bounds: { min: Vec3; max: Vec3 };
};

function armDistance(arm: ArmModel, x: number, y: number, z: number, withHand = false): number {
  const px = x - arm.root[0], py = y - arm.root[1], pz = z - arm.root[2];
  const t = px * arm.dir[0] + py * arm.dir[1] + pz * arm.dir[2];
  if (t <= 0) return Math.hypot(px, py, pz) - arm.rootRadius;
  // Use an extended arm guide to shape the sleeve even past the display form.
  const bend = Math.max(0, t - arm.lengthCm * 0.5);
  const outward = arm.side === "right" ? 1 : -1;
  const lateral = (px * -arm.dir[1] + py * arm.dir[0]) * outward + bend * 0.17;
  const depth = pz - bend * 0.21;
  const radius = armRadiusAt(arm, Math.min(t, arm.lengthCm));
  const wrist = t - arm.lengthCm;
  const forearm = Math.hypot(lateral * 1.04, depth * 0.96, Math.max(0, wrist)) - radius;
  if (!withHand || wrist < -4) return forearm;

  const scale = Math.min(1.08, arm.lengthCm / 53);
  const across = (lateral * 0.82 + depth * 0.57) / scale;
  const palmDepth = (depth * 0.82 - lateral * 0.57) / scale;
  const hand = (offset: number, depthOffset: number, width: number, length: number, breadth: number) =>
    (Math.hypot(across / width, (wrist / scale - offset) / length,
      (palmDepth - depthOffset) / breadth) - 1) * width * scale;
  const palm = hand(3.6, 0, 1.65, 5, 3.05);
  const fingers = hand(8, -0.3, 1.3, 5.2, 2.55);
  const thumb = hand(4.2, 2.2, 1.15, 3, 1.3);
  return smin(forearm, smin(smin(palm, fingers, 1.1), thumb, 0.9), 1);

}

export function createBodyField(model: BodyModel): BodyField {
  const { levels } = model;
  const yTop = levels.neckTop;
  const yBot = levels.base;
  const rows = Math.ceil((yTop - yBot) / ROW_STEP) + 1;
  const table = new Float32Array(rows * N);
  const slope = new Float32Array(rows * N);
  const zc = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    const y = yTop - r * ROW_STEP;
    const radii = torsoRadiiAt(model, y);
    for (let i = 0; i < N; i++) table[r * N + i] = radii[i] * torsoShapeFactor(model, y, (TWO_PI * i) / N);
    zc[r] = torsoCenterZ(model, y);
  }
  for (let r = 0; r < rows; r++) {
    const a = Math.max(0, r - 1);
    const b = Math.min(rows - 1, r + 1);
    for (let i = 0; i < N; i++) slope[r * N + i] = (table[b * N + i] - table[a * N + i]) / ((b - a) * ROW_STEP);
  }

  const centerZ = (y: number) => {
    const f = Math.min(rows - 1, Math.max(0, (yTop - y) / ROW_STEP));
    const r0 = Math.min(rows - 2, Math.floor(f));
    const t = f - r0;
    return zc[r0] * (1 - t) + zc[r0 + 1] * t;
  };

  const torso = (x: number, y: number, z: number) => {
    const f = Math.min(rows - 1, Math.max(0, (yTop - y) / ROW_STEP));
    const r0 = Math.min(rows - 2, Math.floor(f));
    const ty = f - r0;
    const cz = zc[r0] * (1 - ty) + zc[r0 + 1] * ty;
    const dz = z - cz;
    const rho = Math.hypot(x, dz);
    let th = Math.atan2(dz, x);
    if (th < 0) th += TWO_PI;
    const fi = (th / TWO_PI) * N;
    const i0 = Math.floor(fi) % N;
    const i1 = (i0 + 1) % N;
    const ti = fi - Math.floor(fi);
    const a = r0 * N, b = (r0 + 1) * N;
    const R =
      (table[a + i0] * (1 - ti) + table[a + i1] * ti) * (1 - ty) + (table[b + i0] * (1 - ti) + table[b + i1] * ti) * ty;
    const dR =
      (slope[a + i0] * (1 - ti) + slope[a + i1] * ti) * (1 - ty) + (slope[b + i0] * (1 - ti) + slope[b + i1] * ti) * ty;
    // Divide by the surface tilt so the value stays close to a true distance on the sloped shoulders.
    let d = (rho - R) / Math.sqrt(1 + dR * dR);
    d = smax(d, y - yTop, NECK_ROUND_CM);
    d = smax(d, yBot - y, BASE_ROUND_CM);
    return d;
  };

  const [left, right] = model.arms;
  const blendOf = (a: number, b: number) => {
    const h = Math.max(ARM_BLEND_CM - Math.abs(a - b), 0) / ARM_BLEND_CM;
    return (-h * h * ARM_BLEND_CM) / 4;
  };

  const full = (x: number, y: number, z: number) => {
    const t = torso(x, y, z);
    const arm = x < 0 ? left : right;
    const radius = arm.rootRadius;
    const female = model.form === "female";
    const side = arm.side === "right" ? 1 : -1;
    const dx = side * (x - arm.root[0]) + radius * 0.65;
    const dy = y - arm.root[1] - radius * 0.22 + dx * (female ? 0.14 : 0.3);
    const dz = z - arm.root[2];
    const shoulder = (Math.hypot(dx / (radius * 1.62), dy / (radius * 1.02), dz / (radius * 1.12)) - 1) * radius;
    // A shallow, open notch makes the sculpted hip base read from both sides.
    const notch = Math.hypot(x * 1.25, y - yBot + 0.8) - (model.form === "female" ? 3.5 : 2.8);
    const limb = armDistance(arm, x, y, z, true);
    const torsoWithShoulder = smin(t, shoulder, radius * 0.85);
    return smax(smin(torsoWithShoulder, limb, ARM_BLEND_CM), -notch, 1.25);
  };
  const torsoSurface = (x: number, y: number, z: number) => {
    const t = torso(x, y, z);
    const arm = x < 0 ? armDistance(left, x, y, z) : armDistance(right, x, y, z);
    return t + blendOf(t, arm);
  };
  const armSurface = (index: 0 | 1, x: number, y: number, z: number) => {
    const arm = armDistance(model.arms[index], x, y, z);
    return arm + blendOf(torso(x, y, z), arm);
  };

  let maxR = 0;
  for (let i = 0; i < table.length; i++) maxR = Math.max(maxR, table[i]);
  const reachX = Math.max(...model.arms.map((a) => Math.abs(a.root[0] + a.dir[0] * a.lengthCm) + 2 * a.rootRadius));
  const lowestArm = Math.min(...model.arms.map(a => a.root[1] + a.dir[1] * a.lengthCm - 16));
  const margin = 2;
  const bounds = {
    min: [-Math.max(reachX, maxR) - margin, Math.min(yBot, lowestArm) - margin, -maxR - 3 - margin] as Vec3,
    max: [Math.max(reachX, maxR) + margin, yTop + margin, maxR + 3 + margin] as Vec3,
  };

  return { full, torsoSurface, armSurface, centerZ, bounds };
}

const fieldCache = new WeakMap<BodyModel, BodyField>();
/** One field per body model (the model objects are immutable and memoised by the page). */
export function getBodyField(model: BodyModel): BodyField {
  let field = fieldCache.get(model);
  if (!field) {
    field = createBodyField(model);
    fieldCache.set(model, field);
  }
  return field;
}

/** The mannequin as one closed, indexed mesh in metres, with normals from the field. */
export function buildBodyGeometry(model: BodyModel, step = MESH_STEP_CM): BufferGeometry {
  const field = getBodyField(model);
  // Even the interactive preview needs enough samples across the wrist and thumb.
  return surfaceNets(field.full, { ...field.bounds, step: Math.min(step, 1.2), scale: CM_TO_M });
}

/**
 * Girth (cm) of the meshed torso at height y, the way a tape goes round under the arms: rays from the
 * torso axis to where the torso surface (including the shoulder/armpit blend) turns positive, joined
 * into a polygon. Measures the shape that is actually meshed and shown.
 */
export function measureGirth(model: BodyModel, y: number, rays = 180): number {
  const { torsoSurface: full, centerZ } = getBodyField(model);
  const cz = centerZ(y);
  const radii: number[] = [];
  for (let k = 0; k < rays; k++) {
    const th = (TWO_PI * k) / rays;
    const c = Math.cos(th), s = Math.sin(th);
    let lo = 0;
    let hi = 0.5;
    while (hi < 80 && full(c * hi, y, cz + s * hi) < 0) {
      lo = hi;
      hi += 0.5;
    }
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2;
      if (full(c * mid, y, cz + s * mid) < 0) lo = mid;
      else hi = mid;
    }
    radii.push((lo + hi) / 2);
  }
  return polygonPerimeter(radii);
}

export type BodyMeasuredOnMesh = { chestCm: number; waistCm: number; hipCm: number };

export function measureBody(model: BodyModel): BodyMeasuredOnMesh {
  return {
    chestCm: measureGirth(model, model.levels.chest),
    waistCm: measureGirth(model, model.levels.waist),
    hipCm: measureGirth(model, model.levels.hip),
  };
}
