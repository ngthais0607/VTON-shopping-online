import { BufferAttribute, BufferGeometry, Color } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { getBodyField } from "./bodyField";
import { armRadiusAt, armRing, torsoRadiiAt, type BodyModel } from "./bodyGeometry";
import { RING_SEGMENTS, solveSuperellipse, superellipseRadii, TORSO_EXPONENT } from "./ellipse";
import { sampleLevels, sampleRadiiAt } from "./ringInterpolation";
import { horizontalRing, ringPoint, ringsToGeometry } from "./ringsToGeometry";
import type { GarmentSize, KeyRing, Ring3D, Vec3 } from "./types";

/** Display-only gap kept between tee and mannequin where the tee is smaller than the body (no z-fighting). Never changes the tee size. */
export const DISPLAY_CLEARANCE_CM = 0.3;
export const NECK_Y_CM = -0.6;

export type GarmentModel = {
  garment: GarmentSize;
  /** Key rings at the nominal (size chart) dimensions, y decreasing. */
  keyRings: KeyRing[];
  hemY: number;
};

export type TightZone = "shoulder" | "chest" | "waist" | "hem" | "sleeve";

export type GarmentDisplay = {
  polo: boolean;
  torsoRings: Ring3D[];
  /** Fit pressure per vertex (cm, > 0 = the tee is smaller than the body there; < 0 = ease). */
  torsoPressure: number[][];
  /** The first rings of torsoRings form the rolled crew-neck rib. */
  collarRingCount: number;
  sleeves: { rings: Ring3D[]; pressure: number[][] }[];
  tightZones: TightZone[];
  tightVertexFraction: number;
  backMarker: { position: Vec3; normal: Vec3 };
};

export function buildGarmentModel(body: BodyModel, garment: GarmentSize): GarmentModel {
  const { levels } = body;
  const chest = solveSuperellipse(garment.chestCircCm, 0.72);
  const neckA = 8.2 + (garment.chestCircCm - 96) * 0.04;
  const hemY = -garment.lengthCm;
  const rings: KeyRing[] = [
    { name: "neck", y: NECK_Y_CM, radii: superellipseRadii(neckA, neckA * 0.9, 2.2) },
    { name: "shoulder", y: levels.shoulder, radii: superellipseRadii(garment.shoulderWidthCm / 2, chest.b * 0.82, TORSO_EXPONENT) },
    { name: "armpit", y: levels.armpit, radii: solveSuperellipse(garment.chestCircCm * 0.99, 0.7).radii },
    { name: "chest", y: levels.chest, radii: chest.radii },
    { name: "waist", y: levels.waist, radii: solveSuperellipse(garment.waistCircCm, 0.76).radii },
  ];
  const keyRings = [
    ...rings.filter((r) => r.y > hemY + 1),
    { name: "hem", y: hemY, radii: solveSuperellipse(garment.hemCircCm, 0.72).radii },
  ];
  return { garment: { ...garment }, keyRings, hemY };
}

function zoneForY(body: BodyModel, y: number): TightZone {
  const { levels } = body;
  if (y > levels.armpit) return "shoulder";
  if (y > levels.underbust) return "chest";
  if (y > levels.hip) return "waist";
  return "hem";
}

/** Rolled crew-neck rib, as (radial offset, height above the neckline) from the inner edge over the top. */
const COLLAR_PROFILE: readonly (readonly [number, number])[] = [
  [-0.5, 0.15],
  [-0.48, 0.75],
  [-0.3, 1.1],
  [0.02, 1.22],
  [0.22, 0.9],
  [0.18, 0.35],
];
/** Turned-in hem / cuff: inner fold as (radial offset, distance back from the edge). */
const HEM_FOLD: readonly (readonly [number, number])[] = [
  [-0.12, -0.12],
  [-0.28, 0.05],
  [-0.28, 1.6],
];
const NO_PRESSURE = -1;

const smooth01 = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

type Field = (x: number, y: number, z: number) => number;

/**
 * Smallest r ≥ r0 along origin + r·dir where the field reaches the clearance. The field is close to a
 * distance (≤ ~1 cm change per cm), so stepping by the missing clearance never jumps past the surface.
 */
export function pushOut(field: Field, o: Vec3, d: Vec3, r0: number, clearance: number): number {
  let r = r0;
  for (let it = 0; it < 60; it++) {
    const v = field(o[0] + d[0] * r, o[1] + d[1] * r, o[2] + d[2] * r);
    if (v >= clearance - 0.01) return r;
    r += clearance - v + 0.01;
    if (r > r0 + 30) break;
  }
  return r;
}

export function buildGarmentDisplay(body: BodyModel, model: GarmentModel, polo = false, photoNeckline = false): GarmentDisplay {
  const zones = new Set<TightZone>();
  let tightCount = 0;
  let total = 0;
  const field = getBodyField(body);
  const N = RING_SEGMENTS;
  const dirs: Vec3[] = Array.from({ length: N }, (_, i) => [Math.cos((2 * Math.PI * i) / N), 0, Math.sin((2 * Math.PI * i) / N)]);
  const fittedRing = (y: number, radii: number[], clearance = DISPLAY_CLEARANCE_CM) => {
    const fade = smooth01(1 - Math.max(0, NECK_Y_CM - y) / 11);
    const heights = dirs.map((d) => y - fade * (0.5 + 3.4 * Math.max(0, d[2]) ** 2));
    const fitted = radii.map((r, i) => pushOut(field.torsoSurface, [0, heights[i], 0], dirs[i], r, clearance));
    return { ...horizontalRing(y, fitted), heights };
  };

  // Torso panel at the nominal size-chart radii. Only where the body is bigger is the surface pushed out
  // to the mannequin (plus the display clearance), and that area is reported as tight.
  const ys = sampleLevels(model.keyRings.map((r) => r.y), NECK_Y_CM, model.hemY, 1.2);
  const torsoRings: Ring3D[] = [];
  const torsoPressure: number[][] = [];
  const underarmY = body.levels.armpit;
  for (const y of ys) {
    const nominal = sampleRadiiAt(model.keyRings, y);
    // There is no mannequin below its base, so nothing to press against there.
    const hasBody = y > body.levels.base;
    const bodyR = torsoRadiiAt(body, y);
    // The neckline rests on the neck by design; fade fit pressure in from the neckline to the shoulder line
    // so the collar seam is not reported (or tinted) as tight.
    const neckFade = smooth01((NECK_Y_CM - y) / (NECK_Y_CM - body.levels.shoulder));
    const pressure = nominal.map((g, i) => {
      if (!hasBody) return NO_PRESSURE;
      const p = bodyR[i] - g;
      return p > 0 ? p * neckFade : p;
    });
    for (const p of pressure) {
      total++;
      if (p > 0) {
        tightCount++;
        zones.add(zoneForY(body, y));
      }
    }
    // Unsupported fabric falls in long folds from the chest; pressure and
    // nominal chart dimensions stay independent of this display deformation.
    const drop = smooth01((underarmY - y) / 16);
    const draped = nominal.map((r, i) => {
      const a = i * 2 * Math.PI / N;
      const slack = Math.min(2.15, Math.max(0, r - bodyR[i]) * 0.68);
      const phase = 6 * a + 0.9 * Math.sin(2 * a) + y * 0.018;
      const side = Math.cos(a) ** 4;
      const atArmhole = Math.exp(-(((y - underarmY + 5) / 8) ** 2));
      const diagonal = side * atArmhole * Math.sin(0.65 * y + 3 * Math.sin(a));
      const overhang = Math.max(0, r - bodyR[i]) * side * Math.exp(-(((y - body.levels.shoulder) / 4) ** 2));
      // A knit top hangs from the bust towards the waist, bridging the
      // underbust instead of tracing each indentation of the body.
      const bustSupport = body.form === "female" ? 0.9 * Math.max(0, Math.sin(a)) ** 2
        * Math.exp(-(((y - body.levels.chest + 4) / 9) ** 2)) : 0;
      return r + bustSupport - 0.65 * overhang + slack * (0.65 * diagonal + drop * (0.84 * Math.cos(phase) + 0.32 * Math.sin(3 * a - y * 0.045) - 0.5));
    });
    torsoRings.push(fittedRing(y, draped));
    torsoPressure.push(pressure);
  }

  // Crew-neck rib on top of the neckline, following the fitted neckline all round.
  const neck = torsoRings[0].radii;
  const collar = (polo || photoNeckline ? [] : COLLAR_PROFILE).map(([dr, dy]) => {
    const y = NECK_Y_CM + dy;
    return fittedRing(y, neck.map((r) => r + dr), 0.08);
  });
  // Turned-in hem below the last ring.
  const hemRadii = torsoRings[torsoRings.length - 1].radii;
  const hem = HEM_FOLD.map(([dr, dy]) => horizontalRing(model.hemY + dy, hemRadii.map((r) => r + dr)));
  const lastPressure = torsoPressure[torsoPressure.length - 1];

  const g = model.garment;
  const t0 = Math.min(6, Math.max(-3, (g.shoulderWidthCm - body.measurements.shoulderCm) / 2));
  const openingR = (g.chestCircCm * 0.36) / (2 * Math.PI);
  // Sleeve cap: a flattened dome above t0 that tucks into the garment shoulder, so the sleeve
  // has no flat "shelf" at the top. Cap rings are hidden inside the torso and never marked tight.

  const capSteps = 5;
  const sleeves = body.arms.map((arm, index) => {
    const armField: Field = (x, y, z) => field.armSurface(index as 0 | 1, x, y, z);
    const fitRing = (t: number, radius: number): Ring3D => {
      const ring = armRing(arm, t, 1);
      const radii = ring.radii.map((_, i) => {
        const p = ringPoint(ring, i);
        const d: Vec3 = [p[0] - ring.center[0], p[1] - ring.center[1], p[2] - ring.center[2]];
        const angle = i * 2 * Math.PI / N;
        const ease = Math.max(0, radius - armRadiusAt(arm, t));
        const fold = Math.min(0.65, ease * 0.28) * Math.sin(4 * angle + t * 0.07)
          * smooth01((t - t0) / 7);
        return pushOut(armField, ring.center, d, radius + fold, DISPLAY_CLEARANCE_CM);
      });
      return { ...ring, radii };
    };
    const steps = Math.max(4, Math.ceil(g.sleeveLengthCm / 1.2));
    const rings: Ring3D[] = [];
    const pressure: number[][] = [];
    // Sweep the sleeve head from inside the yoke out over the deltoid.
    // The outside edge follows the sloping shoulder while the underside
    // disappears inside the armhole. Both ends share the fitted cross-section.
    const socket = fitRing(t0, openingR * 1.15);
    const side = arm.side === "right" ? 1 : -1;
    for (let k = 0; k < capSteps; k++) {
      const t = k / capSteps;
      const inset = 1 - t;
      const offset = Math.min(9, openingR * 1.45);
      const center: Vec3 = [
        socket.center[0] - side * inset * offset,
        socket.center[1] + inset * (socket.center[1] < -6 ? -4 - socket.center[1] : 1.5),
        socket.center[2],
      ];
      const scale = 0.62 + 0.38 * Math.sin(t * Math.PI / 2);
      // Tilt the cap plane towards vertical to make a soft shoulder crown.
      const tilt = inset * 0.72;
      const u: Vec3 = [socket.u[0] * (1 - tilt), socket.u[1] + side * tilt, 0];
      rings.push({ ...socket, center, u, radii: socket.radii.map(r => r * scale) });
      pressure.push(Array(N).fill(NO_PRESSURE));
    }
    for (let k = 0; k <= steps; k++) {
      const s = k / steps;
      const t = t0 + s * g.sleeveLengthCm;
      const nominal = openingR * (1.15 - 0.15 * s);
      const p = armRadiusAt(arm, t) - nominal;
      total += N;
      if (p > 0) {
        tightCount += N;
        zones.add("sleeve");
      }
      rings.push(fitRing(t, nominal));
      pressure.push(Array(N).fill(p));
    }
    // Turned-in cuff.
    const cuff = rings[rings.length - 1];
    const tEnd = t0 + g.sleeveLengthCm;
    for (const [dr, dt] of HEM_FOLD) {
      rings.push({ ...armRing(arm, tEnd - dt, 1), radii: cuff.radii.map((r) => r + dr) });
      pressure.push([...pressure[pressure.length - 1]]);
    }
    return { rings, pressure };
  });

  // Small logo on the back (θ = 3π/2 → −z), between shoulder and chest.
  const markerY = body.levels.shoulder + (body.levels.chest - body.levels.shoulder) * 0.45;
  const back = sampleRadiiAt(model.keyRings, markerY)[(N * 3) / 4];
  const backR = pushOut(field.torsoSurface, [0, markerY, 0], [0, 0, -1], back, DISPLAY_CLEARANCE_CM);

  return {
    polo,
    torsoRings: [...collar, ...torsoRings, ...hem],
    torsoPressure: [...collar.map(() => Array(N).fill(NO_PRESSURE)), ...torsoPressure, ...hem.map(() => [...lastPressure])],
    collarRingCount: collar.length,
    sleeves,
    tightZones: (["shoulder", "chest", "waist", "hem", "sleeve"] as TightZone[]).filter((z) => zones.has(z)),
    tightVertexFraction: total ? tightCount / total : 0,
    backMarker: { position: [0, markerY, -(backR + 0.25)], normal: [0, 0, -1] },
  };
}

/** Tightness (cm) at which the tint reaches its strongest mix. */
export const TIGHT_FULL_CM = 3;
export const TIGHT_MAX_MIX = 0.62;

/**
 * Where the tee is tighter than the body it blushes gradually towards the warning colour, so there are
 * no hard red/white patches. Pressure is blurred over neighbouring vertices and rings (3×3) to avoid speckles and banding.
 */
function pressureColors(pressure: number[][], fabric: string, tight: string, ribRings = 0): number[] {
  const base = new Color(fabric);
  const rib = base.clone().multiplyScalar(0.94);
  const red = new Color(tight);
  const out: number[] = [];
  const c = new Color();
  const around = (ring: number[], i: number) => {
    const n = ring.length;
    return (ring[(i + n - 1) % n] + 2 * ring[i] + ring[(i + 1) % n]) / 4;
  };
  pressure.forEach((ring, j) => {
    const n = ring.length;
    // Neighbour rings in the same section (the collar rib is blended on its own).
    const inRib = j < ribRings;
    const up = j > 0 && j - 1 < ribRings === inRib ? pressure[j - 1] : ring;
    const down = j + 1 < pressure.length && j + 1 < ribRings === inRib ? pressure[j + 1] : ring;
    for (let i = 0; i < n; i++) {
      const p = (around(up, i) + 2 * around(ring, i) + around(down, i)) / 4;
      c.copy(inRib ? rib : base).lerp(red, smooth01(p / TIGHT_FULL_CM) * TIGHT_MAX_MIX);
      out.push(c.r, c.g, c.b);
    }
  });
  return out;
}

/** Open fold-down collar. Sample the shirt surface at each leaf tip so the
 * collar rests on the shoulders even when the wearer changes measurements. */
function poloCollar(display: GarmentDisplay, fabric: string) {
  const panel = display.torsoRings.slice(display.collarRingCount);
  const n = panel[0].radii.length;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const color = new Color(fabric).multiplyScalar(0.88);
  for (let step = 0; step <= n - 2; step++) {
    const i = (n / 4 + 1 + step) % n;
    const edge = Math.min(step, n - 2 - step);
    const theta = 2 * Math.PI * i / n;
    const top = panel[0].heights![i] + 2.4;
    const tip = Math.exp(-((edge - 3) ** 2) / 8);
    const bottom = top - 3.8 - 3.6 * tip;
    for (let row = 0; row < 5; row++) {
      const t = row / 4;
      const y = top + (bottom - top) * t;
      let r = panel[0].radii[i];
      for (let k = 1; k < panel.length; k++) {
        const above = panel[k - 1].heights?.[i] ?? panel[k - 1].center[1];
        const below = panel[k].heights?.[i] ?? panel[k].center[1];
        if (y >= below) {
          const f = Math.max(0, Math.min(1, (above - y) / Math.max(0.01, above - below)));
          r = panel[k - 1].radii[i] * (1 - f) + panel[k].radii[i] * f;
          break;
        }
      }
      r += 0.45 + 0.85 * Math.sin(Math.PI * t);
      positions.push(r * Math.cos(theta) / 100, y / 100, r * Math.sin(theta) / 100);
      colors.push(color.r, color.g, color.b);
      if (step && row) {
        const v = step * 5 + row;
        indices.push(v - 6, v - 1, v - 5, v - 1, v, v - 5);
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("color", new BufferAttribute(new Float32Array(colors), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function buildGarmentGeometry(display: GarmentDisplay, fabric = "#EEE9E0", tight = "#b13d36"): BufferGeometry {
  const torso = ringsToGeometry(display.torsoRings, { colors: pressureColors(display.torsoPressure, fabric, tight, display.collarRingCount) });
  const sleeves = display.sleeves.map((s) => ringsToGeometry(s.rings, { colors: pressureColors(s.pressure, fabric, tight) }));
  const panels = [torso, ...sleeves];
  if (display.polo) panels.push(poloCollar(display, fabric));
  const merged = mergeGeometries(panels, false);
  if (merged) {
    let start = torso.getAttribute("position").count;
    merged.userData.sleeves = sleeves.map((sleeve) => {
      const count = sleeve.getAttribute("position").count;
      const section = { start, count, segments: RING_SEGMENTS };
      start += count;
      return section;
    });
  }
  panels.forEach((g) => g.dispose());
  if (!merged) throw new Error("Could not merge the tee geometry");
  return merged;
}
