import type { GarmentSize, MeasurementField, UpperBodyMeasurements } from "./types";

export type FitTone = "tight" | "snug" | "regular" | "loose" | "unknown";

export type FitHint = {
  label: string;
  tone: FitTone;
  /** Hiệu số áo − thân (cm); null khi chưa đủ dữ liệu. */
  diffCm: number | null;
};

export type FitHints = {
  chest: FitHint;
  waist: FitHint;
  shoulder: FitHint;
  warnings: string[];
};

export const INSUFFICIENT = "Not enough data";

export function easeHint(ease: number): FitHint {
  if (ease < 0) return { label: "Tight for your measurements", tone: "tight", diffCm: ease };
  if (ease < 4) return { label: "Close fit", tone: "snug", diffCm: ease };
  if (ease <= 12) return { label: "Regular fit", tone: "regular", diffCm: ease };
  return { label: "Relaxed fit", tone: "loose", diffCm: ease };
}

export function shoulderHint(diff: number): FitHint {
  if (diff < -1) return { label: "Shoulders narrower than yours", tone: "tight", diffCm: diff };
  if (diff <= 3) return { label: "Shoulders fit", tone: "regular", diffCm: diff };
  return { label: "Drop shoulder", tone: "loose", diffCm: diff };
}

const unknown: FitHint = { label: INSUFFICIENT, tone: "unknown", diffCm: null };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Gợi ý bằng chữ, không có phần trăm tin cậy. Chỉ đọc số đo — không bao giờ sửa kích thước áo.
 * `valid` cho biết trường nào người dùng nhập hợp lệ; trường không hợp lệ → "Chưa đủ dữ liệu".
 */
export function computeFitHints(
  body: UpperBodyMeasurements,
  garment: GarmentSize,
  valid: Partial<Record<MeasurementField, boolean>> = {},
): FitHints {
  const ok = (f: MeasurementField) => valid[f] !== false;
  const chest = ok("chestCm") ? easeHint(round1(garment.chestCircCm - body.chestCm)) : unknown;
  const waist = ok("waistCm") ? easeHint(round1(garment.waistCircCm - body.waistCm)) : unknown;
  const shoulder = ok("shoulderCm") ? shoulderHint(round1(garment.shoulderWidthCm - body.shoulderCm)) : unknown;

  const warnings: string[] = [];
  if (chest.tone === "tight") warnings.push(`Size ${garment.size} is ${Math.abs(chest.diffCm!)} cm smaller than your chest. The tee keeps its true size; tight areas are shown in red.`);
  if (waist.tone === "tight") warnings.push(`Size ${garment.size} is ${Math.abs(waist.diffCm!)} cm smaller than your waist.`);
  if (shoulder.tone === "tight") warnings.push(`Size ${garment.size} shoulders are ${Math.abs(shoulder.diffCm!)} cm narrower than yours.`);
  return { chest, waist, shoulder, warnings };
}
