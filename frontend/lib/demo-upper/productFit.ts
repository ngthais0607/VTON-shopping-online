import { compareSizeLabels } from "@/lib/sizes";
import type { Product, ProductImage, ProductImageKind } from "@/lib/types";
import type { PhotoView } from "./garmentPhotos";
import { DEMO_PRODUCT, GARMENT_SIZES, SIZES } from "./demoCatalog";
import type { GarmentSize } from "./types";

/** Image kinds that show the garment on its own (never a person, a size chart or a close-up). */
export const GARMENT_PHOTO_KINDS = ["vton_garment", "flat_lay", "catalog"] as const;
/** At most three photos whose angle must be guessed (45°, side, back). */
const MAX_EXTRA_PHOTOS = 3;

const FIELD_ALIASES: Record<keyof Omit<GarmentSize, "size">, string[]> = {
  chestCircCm: ["chest", "bust", "chest_cm", "chest_width", "nguc", "vong_nguc"],
  waistCircCm: ["waist", "waist_cm", "eo", "vong_eo"],
  hemCircCm: ["hem", "bottom", "hem_cm", "gau"],
  shoulderWidthCm: ["shoulder", "shoulders", "shoulder_width", "shoulder_cm", "vai"],
  lengthCm: ["length", "body_length", "length_cm", "dai", "dai_ao"],
  sleeveLengthCm: ["sleeve", "sleeve_length", "sleeve_cm", "tay", "dai_tay"],
};

const normKey = (k: string) => k.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/[\s-]+/g, "_");

/** "96", 96, "94-98" (range → mid-point), "96 cm" → number; anything else → null. */
export function chartNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const nums = value.replace(",", ".").match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (!nums.length) return null;
  const n = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0];
  // A 400-digit "number" parses to Infinity; it must never reach the renderer.
  return Number.isFinite(n) ? n : null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One size-chart row → garment dimensions (cm, full circumferences), or null if it has no usable chest. */
export function rowToGarment(size: string, row: Record<string, unknown>, unitFactor = 1): GarmentSize | null {
  const read = (field: keyof typeof FIELD_ALIASES) => {
    for (const [k, v] of Object.entries(row)) {
      if (FIELD_ALIASES[field].includes(normKey(k))) {
        const n = chartNumber(v);
        if (n !== null && n > 0) return n * unitFactor;
      }
    }
    return null;
  };
  let chest = read("chestCircCm");
  if (chest === null) return null;
  let waist = read("waistCircCm");
  let hem = read("hemCircCm");
  // Charts often list the flat width (armpit to armpit) instead of the circumference.
  const halfWidths = chest < 70;
  if (halfWidths) {
    chest *= 2;
    if (waist !== null) waist *= 2;
    if (hem !== null) hem *= 2;
  }
  if (chest < 70 || chest > 180) return null;
  const garment: GarmentSize = {
    size,
    chestCircCm: round1(chest),
    waistCircCm: round1(waist ?? chest - 2),
    hemCircCm: round1(hem ?? waist ?? chest),
    shoulderWidthCm: round1(read("shoulderWidthCm") ?? chest * 0.431),
    lengthCm: round1(read("lengthCm") ?? 68 + (chest - 102) * 0.5),
    sleeveLengthCm: round1(read("sleeveLengthCm") ?? 21 + (chest - 102) / 6),
  };
  // Waist / hem that are clearly impossible for a tee fall back to the chest.
  if (garment.waistCircCm < chest * 0.6 || garment.waistCircCm > chest * 1.5) garment.waistCircCm = round1(chest - 2);
  if (garment.hemCircCm < chest * 0.6 || garment.hemCircCm > chest * 1.5) garment.hemCircCm = round1(chest);
  if (garment.lengthCm < 28 || garment.lengthCm > 110) garment.lengthCm = round1(68 + (chest - 102) * 0.5);
  if (garment.sleeveLengthCm < 5 || garment.sleeveLengthCm > 75) garment.sleeveLengthCm = round1(21 + (chest - 102) / 6);
  if (garment.shoulderWidthCm < 30 || garment.shoulderWidthCm > 70) garment.shoulderWidthCm = round1(chest * 0.431);
  return garment;
}

/**
 * Accepts the two shapes stored on products:
 *   { unit: "cm", measurements: [{ size: "S", chest: 92, ... }, ...] }
 *   { S: { chest: 92, ... }, M: { ... } }
 */
export function parseSizeChart(chart: unknown): GarmentSize[] {
  if (!chart || typeof chart !== "object") return [];
  const obj = chart as Record<string, unknown>;
  const unit = typeof obj.unit === "string" ? obj.unit.trim().toLowerCase() : "cm";
  const factor = unit === "in" || unit === "inch" || unit === "inches" ? 2.54 : 1;
  const rows: [string, Record<string, unknown>][] = [];
  if (Array.isArray(obj.measurements)) {
    for (const r of obj.measurements) {
      if (r && typeof r === "object" && typeof (r as Record<string, unknown>).size !== "undefined") {
        rows.push([String((r as Record<string, unknown>).size).trim(), r as Record<string, unknown>]);
      }
    }
  } else {
    for (const [k, v] of Object.entries(obj)) {
      if (k !== "unit" && v && typeof v === "object" && !Array.isArray(v)) rows.push([k.trim(), v as Record<string, unknown>]);
    }
  }
  const seen = new Set<string>();
  const out: GarmentSize[] = [];
  for (const [size, row] of rows) {
    if (!size || seen.has(size)) continue;
    const g = rowToGarment(size, row, factor);
    if (g) {
      out.push(g);
      seen.add(size);
    }
  }
  return out;
}

/** Storage URLs (MinIO) are read through the same-origin `/storage/...` rewrite so a canvas may read their pixels. */
export function toSameOriginImage(url: string, bucket = "product-images"): string {
  if (url.startsWith("/")) return url;
  try {
    const u = new URL(url);
    if (u.pathname.startsWith(`/${bucket}/`)) return `/storage${u.pathname}`;
  } catch {
    // not an absolute URL
  }
  return url;
}

/** Categories the one sample tee can stand in for (English and Vietnamese names, e.g. "Áo thun", "T-Shirts & Tops"). */
export function isTopCategory(name?: string | null): boolean {
  const n = (name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
  return /\b(tops?|t-?shirts?|tees?|shirts?|polos?|ao thun|ao polo|ao so mi|ao phong)\b/.test(n);
}

const sameColor =(a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The four 3D angle slots and how each is stored with the backend's existing image kinds. */
export const ANGLE_SLOTS: { view: PhotoView; label: string; kind: ProductImageKind; sortOrder: number }[] = [
  { view: "front", label: "Front", kind: "vton_garment", sortOrder: 900 },
  { view: "angle45", label: "45°", kind: "flat_lay", sortOrder: 901 },
  { view: "side", label: "Side", kind: "catalog", sortOrder: 902 },
  { view: "back", label: "Back", kind: "catalog", sortOrder: 903 },
];

export type AngleSet = {
  /** Photos placed in a slot. */
  views: Partial<Record<PhotoView, ProductImage>>;
  /** Garment-only photos that do not fit a slot; their angle is guessed from the silhouette. */
  unsorted: ProductImage[];
};

const isGarmentPhoto = (img: ProductImage) => (GARMENT_PHOTO_KINDS as readonly string[]).includes(img.kind ?? "");
const byOrder = (a: ProductImage, b: ProductImage) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.id).localeCompare(String(b.id), undefined, { numeric: true });

/** Images of one colour set: `colorName` null = the untagged ("All colours") photos. */
export function colorSetImages(images: ProductImage[], colorName: string | null): ProductImage[] {
  return images.filter((img) => (colorName ? sameColor(img.color_name, colorName) : !img.color_name));
}

/**
 * Reads one colour set's garment photos into the Front / 45° / Side / Back slots:
 * front = "Try-on garment", 45° = "Flat lay", side and back = "Catalog" (side first). A lone catalog
 * photo is placed by its upload marker (902 side, 903 back); without it its angle stays unknown.
 * Sets that do not follow this pattern (older products) are left to the silhouette classifier.
 */
export function angleSlots(images: ProductImage[], colorName: string | null): AngleSet {
  const set = colorSetImages(images, colorName).filter(isGarmentPhoto).sort(byOrder);
  const views: AngleSet["views"] = {};
  const unsorted: ProductImage[] = [];
  const vton = set.filter((i) => i.kind === "vton_garment");
  const flat = set.filter((i) => i.kind === "flat_lay");
  const cat = set.filter((i) => i.kind === "catalog");
  const front = vton.find((i) => i.is_primary) ?? vton[0];
  if (front) views.front = front;
  unsorted.push(...vton.filter((i) => i !== front));
  if (flat.length <= 1 && cat.length <= 2) {
    if (flat[0]) views.angle45 = flat[0];
    if (cat.length === 2) [views.side, views.back] = cat;
    else if (cat[0]?.sort_order === 902) views.side = cat[0];
    else if (cat[0]?.sort_order === 903) views.back = cat[0];
    else if (cat[0]) unsorted.push(cat[0]);
  } else {
    unsorted.push(...flat, ...cat);
  }
  return { views, unsorted: unsorted.sort(byOrder) };
}

/**
 * Every image that sits in a 3D angle slot, once each: colour sets in order (untagged first), slots in
 * Front / 45° / Side / Back order. Colour names that differ only by case or spacing are one set.
 */
export function allSlotImages(images: ProductImage[]): ProductImage[] {
  const colors = new Map<string, string | null>([["", null]]);
  for (const img of images) {
    const key = (img.color_name ?? "").trim().toLowerCase();
    if (key && !colors.has(key)) colors.set(key, img.color_name ?? null);
  }
  const out: ProductImage[] = [];
  const seen = new Set<string>();
  colors.forEach((color) => {
    const views = angleSlots(images, color).views;
    for (const slot of ANGLE_SLOTS) {
      const img = views[slot.view];
      if (img && !seen.has(img.id)) {
        seen.add(img.id);
        out.push(img);
      }
    }
  });
  return out;
}

/** Keep fitting-room inputs out of the storefront carousel. Older complete
 * angle sets may have sequential positions from a previous gallery reorder. */
export function storefrontGallery(images: ProductImage[]): ProductImage[] {
  const hidden = new Set(images.filter(img => img.kind === "vton_garment" ||
    ANGLE_SLOTS.some(slot => slot.kind === img.kind && slot.sortOrder === img.sort_order)).map(img => img.id));
  for (const color of new Set(images.map(img => img.color_name ?? null))) {
    const views = angleSlots(images, color).views;
    if (views.front && views.angle45 && views.side && views.back) {
      for (const img of Object.values(views)) hidden.add(img.id);
    }
  }
  const gallery = images.filter(img => !hidden.has(img.id));
  const seen = new Set<string>();
  // A product with only fitting-room photos still needs a gallery: show all of them, front view first.
  const front = (img: ProductImage) => (img.kind === "vton_garment" ? 0 : 1);
  const source = gallery.length ? gallery : [...images].sort((a, b) => front(a) - front(b));
  return source.filter(img => {
    if (seen.has(img.url)) return false;
    seen.add(img.url);
    return true;
  });
}

export type GarmentPhotoSet = {
  /** Explicit angles plus up to three photos whose angle is guessed. */
  views: Partial<Record<PhotoView, string>>;
  guessed: string[];
  /** Colour name whose photos are shown (null = untagged photos). */
  source: string | null;
  /** The photos belong to another colour (or to all colours) and must be recoloured to the selection. */
  recolor: boolean;
};

const hasPhotos = (s: AngleSet) => Object.keys(s.views).length > 0 || s.unsorted.length > 0;

/**
 * Garment photos for the selected colour: that colour's own photos, else the untagged ones, else
 * another colour's. Borrowed photos are recoloured to the selection when the product has several colours.
 */
export function pickColorPhotos(images: ProductImage[], colorName: string | null, colorNames: string[]): GarmentPhotoSet | null {
  const candidates: (string | null)[] = [colorName, null, ...colorNames.filter((c) => !sameColor(c, colorName))];
  for (const source of candidates) {
    if (source === undefined || (source !== null && !source)) continue;
    const set = angleSlots(images, source);
    if (!hasPhotos(set)) continue;
    const views: GarmentPhotoSet["views"] = {};
    for (const [view, img] of Object.entries(set.views) as [PhotoView, ProductImage][]) views[view] = toSameOriginImage(img.url);
    let unsorted = set.unsorted;
    // Without a try-on garment, the primary (else first) unsorted photo is the front.
    if (!views.front && unsorted.length) {
      const f = unsorted.find((i) => i.is_primary) ?? unsorted[0];
      views.front = toSameOriginImage(f.url);
      unsorted = unsorted.filter((i) => i !== f);
    }
    const own = !!colorName && sameColor(source, colorName);
    return {
      views,
      guessed: unsorted.slice(0, MAX_EXTRA_PHOTOS).map((i) => toSameOriginImage(i.url)),
      source,
      recolor: !own && colorNames.length > 1 && !!colorName,
    };
  }
  return null;
}

export type ProductFit = {
  name: string;
  colorName: string | null;
  colors: { name: string; hex: string | null }[];
  fabricColor: string;
  sizes: GarmentSize[];
  /** "product" when the sizes come from the product's own chart. */
  chartSource: "product" | "sample";
  photos: GarmentPhotoSet | null;
};

export const SAMPLE_SIZES: GarmentSize[] = SIZES.map((s) => GARMENT_SIZES[s]);

// Finished garment measurements for the sample women's short-sleeve block.
const WOMENS_SAMPLE_SIZES: GarmentSize[] = [
  { size: "S", chestCircCm: 88, waistCircCm: 79, hemCircCm: 91, shoulderWidthCm: 36.5, lengthCm: 56, sleeveLengthCm: 15 },
  { size: "M", chestCircCm: 94, waistCircCm: 85, hemCircCm: 97, shoulderWidthCm: 38, lengthCm: 58, sleeveLengthCm: 16 },
  { size: "L", chestCircCm: 102, waistCircCm: 93, hemCircCm: 105, shoulderWidthCm: 40, lengthCm: 60, sleeveLengthCm: 17 },
];

// The full shared tee tables also include the extended sizes offered in Admin.
const STANDARD_WOMENS_TEE: GarmentSize[] = [
  { size: "XS", chestCircCm: 82, waistCircCm: 73, hemCircCm: 85, shoulderWidthCm: 35, lengthCm: 54, sleeveLengthCm: 14 },
  ...WOMENS_SAMPLE_SIZES,
  { size: "XL", chestCircCm: 110, waistCircCm: 101, hemCircCm: 113, shoulderWidthCm: 41.5, lengthCm: 62, sleeveLengthCm: 18 },
];
const STANDARD_MENS_TEE: GarmentSize[] = [
  ...SAMPLE_SIZES,
  { size: "XL", chestCircCm: 114, waistCircCm: 112, hemCircCm: 114, shoulderWidthCm: 48, lengthCm: 74, sleeveLengthCm: 23 },
  { size: "XXL", chestCircCm: 120, waistCircCm: 118, hemCircCm: 120, shoulderWidthCm: 50, lengthCm: 77, sleeveLengthCm: 24 },
];
const TEE_METRICS = Object.keys(SAMPLE_SIZES[0]).filter(key => key !== "size") as (keyof Omit<GarmentSize, "size">)[];
const STANDARD_UNISEX_TEE = [...STANDARD_WOMENS_TEE.map(women => {
  const men = STANDARD_MENS_TEE.find(row => row.size === women.size);
  if (!men) return women;
  const row = { ...women };
  for (const metric of TEE_METRICS) {
    // Match the shared preset's nearest half-centimetre, ties to even.
    const sum = women[metric] + men[metric];
    const floor = Math.floor(sum);
    row[metric] = (sum - floor === 0.5 ? floor + (floor % 2) : Math.round(sum)) / 2;
  }
  return row;
}), STANDARD_MENS_TEE[STANDARD_MENS_TEE.length - 1]];

function standardTeeChart(gender?: string) {
  return gender === "female" ? STANDARD_WOMENS_TEE
    : gender === "male" ? STANDARD_MENS_TEE : STANDARD_UNISEX_TEE;
}

export function usesStandardTeeChart(sizes: GarmentSize[], gender?: string) {
  const standard = standardTeeChart(gender);
  return sizes.length === standard.length && standard.every(row => sizes.some(size =>
    size.size === row.size && TEE_METRICS.every(key => size[key] === row[key])));
}

export const SAMPLE_FIT: ProductFit = {
  name: DEMO_PRODUCT.name,
  colorName: DEMO_PRODUCT.colorName,
  colors: [],
  fabricColor: DEMO_PRODUCT.fabricColor,
  sizes: SAMPLE_SIZES,
  chartSource: "sample",
  photos: null,
};

/** Stock can change without changing which sizes are configured for this colour. */
export function fitSizeOptions(product: Product | null, colorName: string | null, chart: GarmentSize[], useSharedFallback = false) {
  if (!product) return chart.map(dimensions => ({ size: dimensions.size, dimensions, estimated: false }));
  const sizes = new Map<string, string>();
  for (const variant of product.variants ?? []) {
    if (variant.is_active === false || (colorName && !sameColor(variant.color_name, colorName))) continue;
    const size = variant.size.trim();
    if (size && !sizes.has(size.toLowerCase())) sizes.set(size.toLowerCase(), size);
  }
  const fallback = useSharedFallback ? standardTeeChart(product.gender) : [];
  // Extend the existing grade by one size for products using the shared chart.
  const extra = useSharedFallback && product.gender === "male"
    ? { size: "XS", chestCircCm: 90, waistCircCm: 88, hemCircCm: 90, shoulderWidthCm: 40, lengthCm: 62, sleeveLengthCm: 19 }
    : useSharedFallback && product.gender === "female"
      ? { size: "XXL", chestCircCm: 118, waistCircCm: 109, hemCircCm: 121, shoulderWidthCm: 43, lengthCm: 64, sleeveLengthCm: 19 }
      : undefined;
  return Array.from(sizes.values()).sort(compareSizeLabels).map(size => {
    const matches = (row: GarmentSize) => row.size.trim().toLowerCase() === size.toLowerCase();
    const supplied = chart.find(matches);
    const estimated = supplied ? undefined : fallback.find(matches) ?? (extra && matches(extra) ? extra : undefined);
    return { size, dimensions: supplied ?? estimated, estimated: !!estimated };
  });
}

export function resolveProductFit(product: Product | null, colorName?: string | null): ProductFit {
  if (!product) return SAMPLE_FIT;
  const colors: { name: string; hex: string | null }[] = [];
  for (const v of product.variants ?? []) {
    if (v.is_active !== false && v.color_name && !colors.some((c) => sameColor(c.name, v.color_name))) colors.push({ name: v.color_name, hex: v.color_hex ?? null });
  }
  const color = colors.find((c) => sameColor(c.name, colorName)) ?? colors[0] ?? null;
  const chart = parseSizeChart(product.size_chart);
  return {
    name: product.name,
    colorName: color?.name ?? null,
    colors,
    fabricColor: color?.hex && /^#[0-9a-f]{6}$/i.test(color.hex) ? color.hex : DEMO_PRODUCT.fabricColor,
    sizes: chart.length ? chart : product.gender === "female" ? WOMENS_SAMPLE_SIZES : SAMPLE_SIZES,
    chartSource: chart.length ? "product" : "sample",
    photos: pickColorPhotos(product.images ?? [], color?.name ?? colorName ?? null, colors.map((c) => c.name)),
  };
}
