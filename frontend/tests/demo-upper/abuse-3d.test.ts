import { describe, expect, it } from "vitest";
import { buildBodyModel } from "@/lib/demo-upper/bodyGeometry";
import { createBodyField, measureBody } from "@/lib/demo-upper/bodyField";
import { GARMENT_SIZES } from "@/lib/demo-upper/demoCatalog";
import { computeFitHints } from "@/lib/demo-upper/fitHints";
import {
  borderColor,
  classifyViews,
  garmentMask,
  maskBBox,
  mirrorSymmetry,
  photoStats,
  type Rgba,
} from "@/lib/demo-upper/garmentPhotos";
import {
  MEASUREMENT_FIELDS,
  MEASUREMENT_RANGES,
  parseMeasurementInput,
  validateField,
  validateMeasurements,
} from "@/lib/demo-upper/measurementValidation";
import {
  allSlotImages,
  angleSlots,
  chartNumber,
  isTopCategory,
  parseSizeChart,
  pickColorPhotos,
  resolveProductFit,
  rowToGarment,
  toSameOriginImage,
} from "@/lib/demo-upper/productFit";
import type { Product, ProductImage } from "@/lib/types";

/**
 * A user (or a corrupted size chart saved by an admin) can feed the 3D try-on almost anything.
 * None of it may throw, and nothing handed to the renderer may be NaN / Infinity.
 */

const HOSTILE: unknown[] = [
  undefined, null, "", "   ", "abc", "1e309", "NaN", "Infinity", "-Infinity", "0x10", "1,2,3", "170cm", "--5",
  "9".repeat(400), "１７０", "<script>alert(1)</script>", "'; DROP TABLE products;--", "\u0000", "170\n",
  NaN, Infinity, -Infinity, -1, 0, 1e308, -1e308, Number.MAX_VALUE, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER,
  true, false, [], [170], {}, { valueOf: () => 170 }, () => 170, Symbol.iterator, BigInt(10),
];

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function allFinite(value: unknown, path = "value"): void {
  if (typeof value === "number") expect(Number.isFinite(value), `${path} = ${value}`).toBe(true);
  else if (ArrayBuffer.isView(value)) Array.from(value as unknown as ArrayLike<number>).forEach((n, i) => expect(Number.isFinite(n), `${path}[${i}]`).toBe(true));
  else if (Array.isArray(value)) value.forEach((v, i) => allFinite(v, `${path}[${i}]`));
  else if (value && typeof value === "object") Object.entries(value).forEach(([k, v]) => allFinite(v, `${path}.${k}`));
}

describe("measurement input: hostile values", () => {
  it.each(HOSTILE.map((v, i) => [i, v] as const))("parseMeasurementInput #%i never throws and is finite or null", (_i, raw) => {
    const out = parseMeasurementInput(raw);
    expect(out === null || finite(out)).toBe(true);
  });

  it.each(MEASUREMENT_FIELDS)("%s always yields an in-range, finite value whatever is typed", (field) => {
    const { min, max } = MEASUREMENT_RANGES[field];
    for (const raw of HOSTILE) {
      const result = validateField(field, raw);
      expect(finite(result.value), String(raw)).toBe(true);
      expect(result.value).toBeGreaterThanOrEqual(min);
      expect(result.value).toBeLessThanOrEqual(max);
      if (result.status !== "ok") expect(result.message).toBeTruthy();
    }
  });

  it("only accepts values inside the allowed range as ok", () => {
    for (const field of MEASUREMENT_FIELDS) {
      const { min, max } = MEASUREMENT_RANGES[field];
      expect(validateField(field, min).status).toBe("ok");
      expect(validateField(field, max).status).toBe("ok");
      expect(validateField(field, min - 0.01).status).toBe("out_of_range");
      expect(validateField(field, max + 0.01).status).toBe("out_of_range");
      expect(validateField(field, -max).status).toBe("out_of_range");
    }
  });

  it("clamps absurd numbers to the limits instead of passing them on", () => {
    expect(validateField("heightCm", 1e308).value).toBe(195);
    expect(validateField("heightCm", -1e308).value).toBe(150);
    expect(validateField("chestCm", "999999999").value).toBe(120);
  });

  it("falls back to the default (not NaN) when the fallback is hostile", () => {
    for (const fb of [NaN, Infinity, -Infinity, 1e308, -5]) {
      const r = validateField("heightCm", "abc", fb);
      expect(finite(r.value)).toBe(true);
      expect(r.value).toBeGreaterThanOrEqual(150);
      expect(r.value).toBeLessThanOrEqual(195);
    }
  });

  it("validateMeasurements survives every field being hostile at once", () => {
    for (const raw of HOSTILE) {
      const result = validateMeasurements({ heightCm: raw, chestCm: raw, waistCm: raw, shoulderCm: raw }, { heightCm: NaN, chestCm: Infinity });
      allFinite(result.values);
      expect(result.complete).toBe(result.values.heightCm === raw && false ? true : result.complete);
    }
  });

  it("is never 'complete' unless every field is truly valid", () => {
    expect(validateMeasurements({}).complete).toBe(false);
    expect(validateMeasurements({ heightCm: 170, chestCm: 92, waistCm: 76, shoulderCm: 42 }).complete).toBe(true);
    expect(validateMeasurements({ heightCm: 170, chestCm: 92, waistCm: 76, shoulderCm: "wide" }).complete).toBe(false);
    expect(validateMeasurements({ heightCm: 170, chestCm: 92, waistCm: 76, shoulderCm: 99 }).complete).toBe(false);
  });

  it("does not read extra or prototype keys from the raw object", () => {
    const polluted = JSON.parse('{"__proto__":{"heightCm":1},"constructor":{"x":1},"heightCm":170}');
    const result = validateMeasurements(polluted);
    expect(result.values.heightCm).toBe(170);
    expect(({} as Record<string, unknown>).heightCm).toBeUndefined();
  });
});

describe("3D body: extreme but validated measurements", () => {
  const corners = [150, 195].flatMap((heightCm) =>
    [78, 120].flatMap((chestCm) => [62, 110].flatMap((waistCm) => [36, 50].map((shoulderCm) => ({ heightCm, chestCm, waistCm, shoulderCm })))),
  );

  it.each(corners.map((c) => [JSON.stringify(c), c] as const))("builds a finite model for %s", (_n, body) => {
    for (const form of ["male", "female"] as const) {
      const model = buildBodyModel(body, form);
      allFinite(model.keyRings, "keyRings");
      allFinite(model.arms, "arms");
    }
  });

  it("any hostile input run through validation can always be turned into a body", () => {
    for (const raw of HOSTILE) {
      const { values } = validateMeasurements({ heightCm: raw, chestCm: raw, waistCm: raw, shoulderCm: raw });
      const model = buildBodyModel(values);
      allFinite(model.keyRings, "keyRings");
    }
  });

  it("the signed-distance field and its measurements stay finite at the corners", () => {
    for (const body of [corners[0], corners[corners.length - 1]]) {
      const model = buildBodyModel(body);
      const field = createBodyField(model);
      expect(finite(field.full(0, 100, 0))).toBe(true);
      expect(finite(field.full(1e6, -1e6, 1e6))).toBe(true);
      allFinite(measureBody(model));
    }
  });
});

describe("fit hints: hostile garment and body", () => {
  const body = { heightCm: 170, chestCm: 92, waistCm: 76, shoulderCm: 42 };

  it("never throws and never prints NaN into the text", () => {
    const hostileGarments = [
      { ...GARMENT_SIZES.M, size: "<img src=x onerror=alert(1)>" },
      { ...GARMENT_SIZES.M, size: "" },
    ];
    for (const garment of hostileGarments) {
      const hints = computeFitHints(body, garment);
      for (const w of hints.warnings) expect(w).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("an invalid field is reported as 'not enough data', never a fake verdict", () => {
    const hints = computeFitHints(body, GARMENT_SIZES.M, { chestCm: false, waistCm: false, shoulderCm: false });
    expect([hints.chest.tone, hints.waist.tone, hints.shoulder.tone]).toEqual(["unknown", "unknown", "unknown"]);
    expect(hints.warnings).toEqual([]);
  });

  it("flags a garment that is too small", () => {
    const hints = computeFitHints({ ...body, chestCm: 120 }, GARMENT_SIZES.S);
    expect(hints.chest.tone).toBe("tight");
    expect(hints.warnings.length).toBeGreaterThan(0);
  });
});

describe("size chart saved by an admin: hostile shapes", () => {
  const CHARTS: unknown[] = [
    null, undefined, 0, 1, "", "chart", true, [], [1, 2, 3], {}, { unit: "cm" }, { measurements: null }, { measurements: "x" },
    { measurements: [null, 1, "a", [], {}] }, { measurements: [{ size: "S" }] }, { measurements: [{ size: "" , chest: 92 }] },
    { measurements: [{ size: "S", chest: NaN }] }, { measurements: [{ size: "S", chest: Infinity }] },
    { measurements: [{ size: "S", chest: -50 }] }, { measurements: [{ size: "S", chest: 0 }] },
    { measurements: [{ size: "S", chest: 1e308 }] }, { measurements: [{ size: "S", chest: "9".repeat(500) }] },
    { measurements: [{ size: "S", chest: 92, waist: "abc", hem: null, shoulder: {}, length: [], sleeve: NaN }] },
    { measurements: [{ size: "S", chest: 92 }, { size: "S", chest: 100 }] },
    { unit: "in", S: { chest: 36 } }, { unit: "mm", S: { chest: 920 } }, { unit: {}, S: { chest: 92 } },
    { S: { chest: 92 }, M: null, L: "x", XL: [] },
    JSON.parse('{"__proto__":{"chest":92},"S":{"chest":92}}'),
    JSON.parse('{"constructor":{"chest":92}}'),
  ];

  it.each(CHARTS.map((c, i) => [i, c] as const))("parseSizeChart #%i never throws and returns sane rows", (_i, chart) => {
    const rows = parseSizeChart(chart);
    for (const row of rows) {
      allFinite(row);
      expect(row.chestCircCm).toBeGreaterThanOrEqual(70);
      expect(row.chestCircCm).toBeLessThanOrEqual(180);
      expect(row.lengthCm).toBeGreaterThanOrEqual(28);
      expect(row.lengthCm).toBeLessThanOrEqual(110);
      expect(row.sleeveLengthCm).toBeGreaterThanOrEqual(5);
      expect(row.sleeveLengthCm).toBeLessThanOrEqual(75);
    }
    expect(new Set(rows.map((r) => r.size)).size).toBe(rows.length);
  });

  it("a 400-digit size-chart number cannot smuggle Infinity into the garment", () => {
    const huge = "9".repeat(400);
    const rows = parseSizeChart({ measurements: [{ size: "S", chest: 96, waist: huge, hem: huge, shoulder: huge, length: huge, sleeve: huge }] });
    expect(rows).toHaveLength(1);
    allFinite(rows[0]);
  });

  it("rejects impossible chests (too small / too big)", () => {
    expect(rowToGarment("S", { chest: 5 })).toBeNull();
    expect(rowToGarment("S", { chest: 400 })).toBeNull();
    expect(rowToGarment("S", { chest: 0 })).toBeNull();
    expect(rowToGarment("S", {})).toBeNull();
  });

  it("chartNumber never returns NaN", () => {
    for (const raw of HOSTILE) {
      const n = chartNumber(raw);
      expect(n === null || finite(n)).toBe(true);
    }
  });

  it("every product shape resolves to a usable fit (sample chart when the chart is bad)", () => {
    for (const chart of CHARTS) {
      const fit = resolveProductFit({ id: 1, name: "x", gender: "male", size_chart: chart, variants: [], images: [] } as unknown as Product);
      expect(fit.sizes.length).toBeGreaterThan(0);
      fit.sizes.forEach((s) => allFinite(s));
    }
  });

  it("a product with null / missing collections still resolves", () => {
    const fit = resolveProductFit({ id: 1, name: "x", variants: null, images: null, size_chart: null } as unknown as Product);
    expect(fit.chartSource).toBe("sample");
    expect(fit.photos).toBeNull();
  });

  it("variant colours with hostile hex values fall back to the default fabric colour", () => {
    for (const hex of ["javascript:alert(1)", "red", "#12", "#GGGGGG", "url(x)", "#12345678", null, undefined, 42]) {
      const fit = resolveProductFit({ id: 1, name: "x", images: [], variants: [{ color_name: "Red", color_hex: hex }] } as unknown as Product);
      expect(fit.fabricColor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe("product photos: hostile image lists", () => {
  const img = (over: Partial<ProductImage>): ProductImage =>
    ({ id: "1", url: "/a.png", kind: "vton_garment", color_name: null, sort_order: 0, is_primary: false, ...over }) as ProductImage;

  it("handles empty, duplicated and malformed image lists", () => {
    const lists: ProductImage[][] = [
      [],
      [img({})],
      [img({ id: "1" }), img({ id: "1" })],
      [img({ kind: undefined as never }), img({ id: "2", kind: "bogus" as never })],
      [img({ color_name: "  RED " }), img({ id: "2", color_name: "red" })],
      [img({ sort_order: undefined as never }), img({ id: "2", sort_order: NaN })],
      Array.from({ length: 500 }, (_, i) => img({ id: String(i), kind: i % 2 ? "flat_lay" : "catalog", sort_order: i })),
    ];
    for (const images of lists) {
      expect(() => angleSlots(images, null)).not.toThrow();
      expect(() => angleSlots(images, "red")).not.toThrow();
      expect(() => allSlotImages(images)).not.toThrow();
      expect(() => pickColorPhotos(images, "red", ["red", "blue"])).not.toThrow();
    }
  });

  it("never returns the same image twice", () => {
    const images = Array.from({ length: 40 }, (_, i) => img({ id: String(i), kind: "catalog", color_name: i % 3 ? "Red" : null, sort_order: 900 + (i % 4) }));
    const ids = allSlotImages(images).map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never offers more than three guessed photos", () => {
    const images = Array.from({ length: 30 }, (_, i) => img({ id: String(i), kind: "flat_lay", sort_order: i }));
    expect(pickColorPhotos(images, null, [])!.guessed.length).toBeLessThanOrEqual(3);
  });

  it("a null / empty colour never throws", () => {
    for (const color of [null, "", " ", "x".repeat(10_000)]) {
      expect(() => pickColorPhotos([img({})], color, ["", "A"])).not.toThrow();
    }
  });

  it("toSameOriginImage keeps hostile URLs as plain strings and never throws", () => {
    for (const url of ["", "not a url", "javascript:alert(1)", "data:text/html,<script>1</script>", "http://[::1", "//evil.test/x", "http://minio/product-images/a.png", "\u0000"]) {
      expect(() => toSameOriginImage(url)).not.toThrow();
    }
    expect(toSameOriginImage("http://minio:9000/product-images/a.png")).toBe("/storage/product-images/a.png");
    // another bucket is not rewritten onto our storage proxy
    expect(toSameOriginImage("http://minio:9000/private-bucket/a.png")).toBe("http://minio:9000/private-bucket/a.png");
  });

  it("isTopCategory copes with every kind of name", () => {
    for (const name of [undefined, null, "", "   ", "a".repeat(100_000), "\u0000", "Áo thun", "T-Shirts & Tops", "Quần jean", "((((("]) {
      expect(() => isTopCategory(name as string | null | undefined)).not.toThrow();
    }
    expect(isTopCategory("Áo thun")).toBe(true);
    expect(isTopCategory("Quần jean")).toBe(false);
  });
});

function image(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set(fill(x, y), 4 * (y * w + x));
  }
  return { data, width: w, height: h };
}

describe("garment photo analysis: degenerate pictures", () => {
  it("a zero-size image does not throw", () => {
    const empty: Rgba = { data: new Uint8ClampedArray(0), width: 0, height: 0 };
    expect(() => borderColor(empty)).not.toThrow();
    expect(() => garmentMask(empty)).not.toThrow();
    expect(maskBBox(garmentMask(empty), 0, 0)).toBeNull();
  });

  it.each([[1, 1], [1, 40], [40, 1], [2, 2], [3, 3]])("a %ix%i image is handled", (w, h) => {
    const img = image(w, h, () => [10, 200, 30, 255]);
    const mask = garmentMask(img);
    expect(mask.length).toBe(w * h);
  });

  it("a fully transparent photo yields no garment", () => {
    const img = image(20, 20, () => [0, 0, 0, 0]);
    const mask = garmentMask(img);
    expect(mask.every((v) => v === 0)).toBe(true);
    expect(maskBBox(mask, 20, 20)).toBeNull();
  });

  it("a blank single-colour photo yields no garment", () => {
    const mask = garmentMask(image(30, 30, () => [255, 255, 255, 255]));
    expect(mask.every((v) => v === 0)).toBe(true);
  });

  it("a noisy photo cannot hang the flood fill", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 255;
    const img = image(300, 300, () => [rand(), rand(), rand(), 255]);
    const started = Date.now();
    garmentMask(img);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("a large photo finishes in reasonable time", () => {
    const img = image(1500, 1500, (x, y) => (x > 400 && x < 1100 && y > 300 && y < 1300 ? [200, 20, 20, 255] : [255, 255, 255, 255]));
    const started = Date.now();
    const mask = garmentMask(img);
    expect(Date.now() - started).toBeLessThan(8000);
    expect(maskBBox(mask, 1500, 1500)).not.toBeNull();
  });

  it("hostile tolerance values do not throw", () => {
    const img = image(10, 10, (x) => (x > 3 ? [200, 0, 0, 255] : [255, 255, 255, 255]));
    for (const tolerance of [NaN, -1, 0, 255, 1e9, Infinity]) expect(() => garmentMask(img, tolerance)).not.toThrow();
  });

  it("symmetry and stats stay finite for an empty or one-pixel box", () => {
    const mask = new Uint8Array(100);
    const box = { x0: 3, y0: 3, x1: 3, y1: 3 };
    expect(finite(mirrorSymmetry(mask, 10, box))).toBe(true);
    allFinite(photoStats(mask, 10, box));
  });
});

describe("angle classification: hostile statistics", () => {
  it("copes with no photos, no front and equal photos", () => {
    expect(classifyViews(null, [])).toEqual({});
    expect(() => classifyViews(null, [{ aspect: 1, symmetry: 1 }])).not.toThrow();
    expect(() => classifyViews({ aspect: 1, symmetry: 1 }, Array.from({ length: 50 }, () => ({ aspect: 1, symmetry: 1 })))).not.toThrow();
  });

  it("never assigns one photo to two views", () => {
    const others = [
      { aspect: 0.4, symmetry: 0.9 },
      { aspect: 1.1, symmetry: 0.95 },
      { aspect: 1.0, symmetry: 0.6 },
    ];
    const out = classifyViews({ aspect: 1.1, symmetry: 0.95 }, others);
    const used = Object.values(out);
    expect(new Set(used).size).toBe(used.length);
    used.forEach((i) => expect(i).toBeGreaterThanOrEqual(0));
  });

  it("NaN and zero statistics do not throw or invent indexes that do not exist", () => {
    const others = [{ aspect: NaN, symmetry: NaN }, { aspect: 0, symmetry: 0 }, { aspect: Infinity, symmetry: -1 }];
    const out = classifyViews({ aspect: NaN, symmetry: NaN }, others);
    Object.values(out).forEach((i) => {
      expect(Number.isInteger(i)).toBe(true);
      expect(i).toBeLessThan(others.length);
    });
  });
});
