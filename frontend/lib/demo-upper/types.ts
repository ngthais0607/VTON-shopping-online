/** Size label from the size chart (S, M, L, XL, 38, ...). */
export type Size = string;
export type ViewAngle = 0 | 45 | 90 | 180;

export type UpperBodyMeasurements = {
  heightCm: number;
  chestCm: number;
  waistCm: number;
  shoulderCm: number;
};

export type MeasurementField = keyof UpperBodyMeasurements;

/** Kích thước danh nghĩa của áo theo bảng size. Không bao giờ bị ghi đè theo thân người. */
export type GarmentSize = {
  size: Size;
  chestCircCm: number;
  waistCircCm: number;
  hemCircCm: number;
  shoulderWidthCm: number;
  lengthCm: number;
  sleeveLengthCm: number;
};

export type Vec3 = [number, number, number];

/** Một mặt cắt khoá: bán kính cực (cm) tại RING_SEGMENTS góc đều nhau quanh trục Y. */
export type KeyRing = {
  name: string;
  y: number;
  radii: number[];
};

/** Vòng trong không gian 3D: điểm i = center + r_i·cosθ_i·u + r_i·sinθ_i·v (cm). */
export type Ring3D = {
  heights?: number[];
  center: Vec3;
  u: Vec3;
  v: Vec3;
  radii: number[];
};
