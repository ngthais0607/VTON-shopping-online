/** Tỉ lệ độ cao (giả định cho demo) tính từ HSP xuống, nhân với chiều cao H. */
export const HEIGHT_RATIOS = {
  shoulderDrop: 0.03,
  armpit: 0.075,
  chest: 0.105,
  underbust: 0.17,
  waist: 0.25,
  hip: 0.31,
} as const;

export const NECK_TOP_CM = 10;
/** The display torso ends just below the hip line (upper hip), like a shop bust form. */
export const BASE_BELOW_HIP_RATIO = 0.035;
/** Relaxed A-pose: arms hang this many degrees out from vertical. */
export const ARM_ANGLE_DEG = 15;

export type BodyLevels = {
  neckTop: number;
  hsp: number;
  shoulder: number;
  armpit: number;
  chest: number;
  underbust: number;
  waist: number;
  hip: number;
  /** Bottom of the mannequin (rounded, closed base). */
  base: number;
};

export function bodyLevels(heightCm: number): BodyLevels {
  const h = heightCm;
  return {
    neckTop: NECK_TOP_CM,
    hsp: 0,
    shoulder: -HEIGHT_RATIOS.shoulderDrop * h,
    armpit: -HEIGHT_RATIOS.armpit * h,
    chest: -HEIGHT_RATIOS.chest * h,
    underbust: -HEIGHT_RATIOS.underbust * h,
    waist: -HEIGHT_RATIOS.waist * h,
    hip: -HEIGHT_RATIOS.hip * h,
    base: -(HEIGHT_RATIOS.hip + BASE_BELOW_HIP_RATIO) * h,
  };
}

/** Vòng hông không nhập: suy ra từ ngực và eo (giả định). */
export function derivedHipCm(chestCm: number, waistCm: number): number {
  return 0.55 * chestCm + 0.5 * waistCm;
}

export function armRadiusCm(chestCm: number): number {
  return Math.min(5.4, Math.max(3.4, 4.1 + (chestCm - 92) * 0.035));
}

export function armLengthCm(heightCm: number): number {
  return 0.3 * heightCm;
}
