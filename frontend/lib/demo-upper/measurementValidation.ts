import type { MeasurementField, UpperBodyMeasurements } from "./types";

export type FieldRange = { min: number; max: number; default: number; label: string };

export const MEASUREMENT_RANGES: Record<MeasurementField, FieldRange> = {
  heightCm: { min: 150, max: 195, default: 170, label: "Height" },
  chestCm: { min: 78, max: 120, default: 92, label: "Chest" },
  waistCm: { min: 62, max: 110, default: 76, label: "Waist" },
  shoulderCm: { min: 36, max: 50, default: 42, label: "Shoulder width" },
};

export const MEASUREMENT_FIELDS: MeasurementField[] = ["heightCm", "chestCm", "waistCm", "shoulderCm"];

export type FieldStatus = "ok" | "missing" | "invalid" | "out_of_range";

export type FieldResult = {
  status: FieldStatus;
  /** Giá trị dùng để dựng hình: luôn hữu hạn và nằm trong khoảng. */
  value: number;
  message?: string;
};

export type ValidationResult = {
  values: UpperBodyMeasurements;
  fields: Record<MeasurementField, FieldResult>;
  /** true khi mọi trường đều hợp lệ (dùng được cho gợi ý độ vừa). */
  complete: boolean;
};

/** Đọc số từ ô nhập: chấp nhận số hoặc chuỗi, dấu phẩy thập phân. Trả null nếu trống/không phải số. */
export function parseMeasurementInput(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  if (!/^[-+]?\d*\.?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function validateField(field: MeasurementField, raw: unknown, fallback?: number): FieldResult {
  const range = MEASUREMENT_RANGES[field];
  const safeFallback = fallback !== undefined && Number.isFinite(fallback) ? clamp(fallback, range.min, range.max) : range.default;
  const isEmpty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
  if (isEmpty) return { status: "missing", value: safeFallback, message: `Enter your ${range.label.toLowerCase()}` };
  const n = parseMeasurementInput(raw);
  if (n === null) return { status: "invalid", value: safeFallback, message: `${range.label} must be a number (cm)` };
  if (n < range.min || n > range.max) {
    return {
      status: "out_of_range",
      value: clamp(n, range.min, range.max),
      message: `${range.label} must be ${range.min}–${range.max} cm`,
    };
  }
  return { status: "ok", value: n };
}

export function validateMeasurements(
  raw: Partial<Record<MeasurementField, unknown>>,
  fallback?: Partial<UpperBodyMeasurements>,
): ValidationResult {
  const fields = {} as Record<MeasurementField, FieldResult>;
  const values = {} as UpperBodyMeasurements;
  for (const field of MEASUREMENT_FIELDS) {
    const result = validateField(field, raw[field], fallback?.[field]);
    fields[field] = result;
    values[field] = result.value;
  }
  return { values, fields, complete: MEASUREMENT_FIELDS.every((f) => fields[f].status === "ok") };
}
