import { ARM_ANGLE_DEG, armLengthCm, armRadiusCm, bodyLevels, derivedHipCm, type BodyLevels } from "./bodySections";
import { polygonPerimeter, RING_SEGMENTS, solveSuperellipse, superellipseRadii } from "./ellipse";
import { sampleRadiiAt } from "./ringInterpolation";
import { addScaled, axisFrame } from "./ringsToGeometry";
import type { KeyRing, Ring3D, UpperBodyMeasurements, Vec3 } from "./types";

/** Depth/width ratio (b/a) of each torso section (assumed proportions). */
export const DEPTH_RATIOS = { armpit: 0.72, chest: 0.76, underbust: 0.75, waist: 0.75, hip: 0.72 } as const;
/** Superellipse exponent of the body sections: 2 is an ellipse; a little above gives a natural, not boxy, torso. */
export const BODY_EXPONENT = 2.3;

export type ArmModel = {
  side: "left" | "right";
  root: Vec3;
  dir: Vec3;
  lengthCm: number;
  rootRadius: number;
  endRadius: number;
};

export type BodyForm = "male" | "female";

export type BodyModel = {
  form: BodyForm;
  measurements: UpperBodyMeasurements;
  levels: BodyLevels;
  hipCm: number;
  /** Torso key rings, y decreasing (neck top → base). */
  keyRings: KeyRing[];
  arms: [ArmModel, ArmModel];
  landmarks: { acromionLeft: Vec3; acromionRight: Vec3 };
};

export function buildBodyModel(m: UpperBodyMeasurements, form: BodyForm = "male"): BodyModel {
  const levels = bodyLevels(m.heightCm);
  const female = form === "female";
  if (female) {
    levels.chest = -0.134 * m.heightCm;
    levels.underbust = -0.177 * m.heightCm;
    levels.waist = -0.236 * m.heightCm;
  }
  const hipCm = derivedHipCm(m.chestCm, m.waistCm) + (female ? 6 : 0);
  const rArm = armRadiusCm(m.chestCm) * (female ? 0.90 : 1);
  const s = m.heightCm / 170;

  const chest = solveSuperellipse(m.chestCm, DEPTH_RATIOS.chest, BODY_EXPONENT);
  const neckA = (female ? 4.85 : 5.5) + (m.chestCm - 92) * 0.03;
  // The torso itself stops short of the acromion: the rounded arm head (deltoid) fills the last few cm,
  // so the shoulder line is a curve, not the square corner of a box.
  const yokeA = m.shoulderCm / 2 - rArm * 1.3;
  const yokeB = chest.b * 0.8;
  const hspA = neckA + 2.6;
  const sect = (circ: number, depth: number) => solveSuperellipse(circ, depth, BODY_EXPONENT).radii;

  const keyRings: KeyRing[] = [
    { name: "neckTop", y: levels.neckTop, radii: superellipseRadii(neckA, neckA * 0.94, 2) },
    { name: "neckBase", y: 3 * s, radii: superellipseRadii(neckA + 0.5, neckA * 0.96, 2) },
    { name: "hsp", y: levels.hsp, radii: superellipseRadii(hspA, neckA + 0.9, 2.1) },
    // Trapezius: the shoulder line drops steeply near the neck, then flattens towards the arm.
    { name: "trapezius", y: levels.shoulder * 0.45, radii: superellipseRadii(hspA + (yokeA - hspA) * 0.62, yokeB * 0.86, 2.2) },
    { name: "shoulder", y: levels.shoulder, radii: superellipseRadii(yokeA, yokeB, BODY_EXPONENT) },
    { name: "armpit", y: levels.armpit, radii: sect(m.chestCm * (female ? 0.90 : 0.96), DEPTH_RATIOS.armpit) },
    { name: "chest", y: levels.chest, radii: chest.radii },
    { name: "underbust", y: levels.underbust, radii: sect((m.chestCm + m.waistCm) / 2, DEPTH_RATIOS.underbust) },
    { name: "waist", y: levels.waist, radii: sect(m.waistCm, DEPTH_RATIOS.waist) },
    { name: "hip", y: levels.hip, radii: sect(hipCm, DEPTH_RATIOS.hip) },
    { name: "base", y: levels.base, radii: sect(hipCm * 0.98, DEPTH_RATIOS.hip) },
  ];

  if (female) {
    // Distribute the bust girth towards the front and the two bust points.
    // Rescale the finished section so a tape around it still reads the input.
    const bust = keyRings.find(ring => ring.name === "chest")!;
    const shaped = bust.radii.map((r, i) => {
      const angle = 2 * Math.PI * i / RING_SEGMENTS;
      const front = Math.max(0, Math.sin(angle));
      const lobe = Math.exp(-(((Math.abs(Math.cos(angle)) - 0.48) / 0.32) ** 2));
      return r * (1 + front * (0.09 + 0.11 * lobe) - 0.04 * Math.cos(angle) ** 2);
    });
    const scale = m.chestCm / polygonPerimeter(shaped);
    bust.radii = shaped.map(r => r * scale);
  }
  const alpha = (ARM_ANGLE_DEG * Math.PI) / 180;
  const rootY = levels.shoulder - rArm * 0.65;
  // Normally set by the shoulder width; for a broad chest on narrow shoulders the arm is moved out just
  // enough to hang clear of the ribcage instead of sinking into it.
  const ribHalfWidth = Math.max(keyRings[5].radii[0], keyRings[6].radii[0]);
  const rootX = Math.max(m.shoulderCm / 2 - rArm * 0.85, ribHalfWidth + rArm * 0.2);
  const length = armLengthCm(m.heightCm) * (female ? 0.96 : 1);
  const arm = (side: "left" | "right"): ArmModel => {
    const sign = side === "left" ? -1 : 1;
    return {
      side,
      root: [sign * rootX, rootY, -0.4],
      dir: [sign * Math.sin(alpha), -Math.cos(alpha), 0],
      lengthCm: length,
      rootRadius: rArm,
      endRadius: rArm * ARM_PROFILE[ARM_PROFILE.length - 1][1],
    };
  };

  return {
    form,
    measurements: { ...m },
    levels,
    hipCm,
    keyRings,
    arms: [arm("left"), arm("right")],
    landmarks: {
      acromionLeft: [-m.shoulderCm / 2, levels.shoulder, 0],
      acromionRight: [m.shoulderCm / 2, levels.shoulder, 0],
    },
  };
}

export function getKeyRing(model: { keyRings: KeyRing[] }, name: string): KeyRing {
  const ring = model.keyRings.find((r) => r.name === name);
  if (!ring) throw new Error(`No key ring named ${name}`);
  return ring;
}

/** Plain torso radii (cm) at height y for every ring angle: what fit pressure is measured against. */
export function torsoRadiiAt(model: BodyModel, y: number): number[] {
  return sampleRadiiAt(model.keyRings, y);
}

const gauss = (x: number) => Math.exp(-x * x);

/**
 * Small front/back shaping on top of the key rings: fuller chest and flatter upper back at chest level,
 * shoulder blades a little higher. Odd in sin θ, so a girth changes only to second order (< 0.3 %).
 */
export function torsoShapeFactor(model: BodyModel, y: number, theta: number): number {
  const { levels } = model;
  const h = model.measurements.heightCm / 170;
  const sn = Math.sin(theta);
  return 1 + 0.035 * sn * gauss((y - levels.chest) / (6 * h)) - 0.025 * sn * gauss((y - (levels.armpit + 1 * h)) / (5 * h));
}

/** Forward offset (cm) of the torso axis: the neck leans slightly forward, the lower back curves in. */
export function torsoCenterZ(model: BodyModel, y: number): number {
  const { levels } = model;
  const h = model.measurements.heightCm / 170;
  const neck = Math.min(1, Math.max(0, y / levels.neckTop));
  return 1.2 * neck * neck + 0.9 * gauss((y - levels.waist) / (10 * h)) - 0.6 * gauss((y - levels.hip) / (6 * h));
}

/**
 * Arm profile (fraction of arm length → fraction of root radius): deltoid, upper arm,
 * elbow, forearm, wrist. Smoothstep between control points gives a soft, sculpted limb.
 */
export const ARM_PROFILE: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.13, 1.08],
  [0.32, 0.98],
  [0.53, 0.69],
  [0.65, 0.89],
  [0.83, 0.68],
  [1, 0.46],
];

function profileAt(f: number): number {
  const pts = ARM_PROFILE;
  if (f <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [f1, r1] = pts[i];
    const [f0, r0] = pts[i - 1];
    if (f <= f1) {
      const x = (f - f0) / (f1 - f0);
      return r0 + (r1 - r0) * x * x * (3 - 2 * x);
    }
  }
  return pts[pts.length - 1][1];
}

/** Arm radius (cm) at position t along the axis, with rounded domes at both ends. */
export function armRadiusAt(arm: ArmModel, t: number): number {
  if (t < 0) return Math.sqrt(Math.max(0, arm.rootRadius ** 2 - t ** 2));
  if (t > arm.lengthCm) return Math.sqrt(Math.max(0, arm.endRadius ** 2 - (t - arm.lengthCm) ** 2));
  return arm.rootRadius * profileAt(t / arm.lengthCm);
}

export function armRing(arm: ArmModel, t: number, radius: number, segments = RING_SEGMENTS): Ring3D {
  const { u, v } = axisFrame(arm.dir);
  return { center: addScaled(arm.root, arm.dir, t), u, v, radii: Array(segments).fill(radius) };
}
