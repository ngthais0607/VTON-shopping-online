import type { UpperBodyMeasurements } from "./types";

export type BodyPreset = { id: "small" | "medium" | "broad"; label: string; body: UpperBodyMeasurements };

export const BODY_PRESETS: BodyPreset[] = [
  { id: "small", label: "Small", body: { heightCm: 160, chestCm: 84, waistCm: 66, shoulderCm: 38 } },
  { id: "medium", label: "Medium", body: { heightCm: 170, chestCm: 92, waistCm: 76, shoulderCm: 42 } },
  // Ngực 102 / eo 90 để L, M, S lần lượt ra: dư vừa, sát, chật.
  { id: "broad", label: "Broad", body: { heightCm: 180, chestCm: 102, waistCm: 90, shoulderCm: 47 } },
];

export const WOMENS_PRESETS: BodyPreset[] = [
  { id: "small", label: "Small", body: { heightCm: 158, chestCm: 82, waistCm: 65, shoulderCm: 36 } },
  { id: "medium", label: "Medium", body: { heightCm: 162, chestCm: 88, waistCm: 70, shoulderCm: 37.5 } },
  { id: "broad", label: "Large", body: { heightCm: 166, chestCm: 96, waistCm: 78, shoulderCm: 39.5 } },
];

export const DEFAULT_BODY: UpperBodyMeasurements = BODY_PRESETS[1].body;
export const DEFAULT_OPACITY = 1;
export const OPACITY_RANGE = { min: 0.15, max: 1 } as const;
