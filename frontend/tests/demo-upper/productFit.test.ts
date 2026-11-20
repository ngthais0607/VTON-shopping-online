import { describe, expect, it } from "vitest";
import { fitSizeOptions, storefrontGallery, angleSlots, chartNumber, parseSizeChart, pickColorPhotos, resolveProductFit, SAMPLE_SIZES, toSameOriginImage } from "@/lib/demo-upper/productFit";
import type { Product, ProductImage } from "@/lib/types";

describe("size chart parsing", () => {
  it("reads the { unit, measurements: [...] } shape and fills missing dimensions", () => {
    const sizes = parseSizeChart({ unit: "cm", measurements: [{ size: "S", chest: 92, waist: 76, length: 68 }, { size: "M", chest: 96, waist: 80, length: 70 }] });
    expect(sizes.map((s) => s.size)).toEqual(["S", "M"]);
    expect(sizes[0]).toMatchObject({ chestCircCm: 92, waistCircCm: 76, hemCircCm: 76, lengthCm: 68 });
    expect(sizes[0].shoulderWidthCm).toBeGreaterThan(35);
    expect(sizes[0].sleeveLengthCm).toBeGreaterThan(10);
  });

  it("reads the { S: {...}, M: {...} } shape, flat half-chest widths, ranges and inches", () => {
    const sizes = parseSizeChart({ S: { "Chest": "48", Length: "66" }, L: { chest: "104-108", shoulder: 47 } });
    expect(sizes[0]).toMatchObject({ size: "S", chestCircCm: 96, lengthCm: 66 });
    expect(sizes[1]).toMatchObject({ size: "L", chestCircCm: 106, shoulderWidthCm: 47 });
    const inches = parseSizeChart({ unit: "in", measurements: [{ size: "M", chest: 40 }] });
    expect(inches[0].chestCircCm).toBeCloseTo(101.6, 1);
  });

  it("skips rows without a usable chest and returns [] for missing charts", () => {
    expect(parseSizeChart({ measurements: [{ size: "S", waist: 70 }, { size: "M", chest: 400 }] })).toEqual([]);
    expect(parseSizeChart(null)).toEqual([]);
    expect(chartNumber("abc")).toBeNull();
  });
});

const img = (id: number, kind: string, extra: Partial<ProductImage> = {}): ProductImage => ({ id, url: `http://127.0.0.1:9000/product-images/products/${id}.png`, kind, ...extra }) as ProductImage;

const u = (id: number) => `/storage/product-images/products/${id}.png`;

describe("3D angle slots", () => {
  it("reads front / 45° / side / back from the kinds and the side-before-back order", () => {
    const images = [img(1, "model_photo", { is_primary: true }), img(2, "flat_lay", { sort_order: 4 }), img(3, "vton_garment", { sort_order: 5 }), img(4, "catalog", { sort_order: 6 }), img(5, "catalog", { sort_order: 7 }), img(6, "size_chart")];
    const { views, unsorted } = angleSlots(images, null);
    expect([views.front?.id, views.angle45?.id, views.side?.id, views.back?.id]).toEqual([3, 2, 4, 5]);
    expect(unsorted).toEqual([]);
  });

  it("places a lone catalog photo by its upload marker, otherwise leaves it to the classifier", () => {
    expect(angleSlots([img(1, "catalog", { sort_order: 903 })], null).views.back?.id).toBe(1);
    expect(angleSlots([img(1, "catalog", { sort_order: 902 })], null).views.side?.id).toBe(1);
    expect(angleSlots([img(1, "catalog", { sort_order: 3 })], null).unsorted.map((i) => i.id)).toEqual([1]);
  });

  it("falls back to guessing for sets that do not follow the slot pattern", () => {
    const set = angleSlots([img(1, "flat_lay", { sort_order: 1 }), img(2, "flat_lay", { sort_order: 2 }), img(3, "vton_garment")], null);
    expect(set.views.front?.id).toBe(3);
    expect(set.unsorted.map((i) => i.id)).toEqual([1, 2]);
  });

  it("keeps colour sets apart", () => {
    const images = [img(1, "vton_garment", { color_name: "Red" }), img(2, "vton_garment", { color_name: "Navy" }), img(3, "flat_lay")];
    expect(angleSlots(images, "navy").views.front?.id).toBe(2);
    expect(angleSlots(images, null).views).toEqual({ angle45: images[2] });
  });
});

describe("photos per colour", () => {
  const images = [img(1, "vton_garment", { color_name: "Navy" }), img(2, "catalog", { color_name: "Navy", sort_order: 903 }), img(3, "flat_lay", { color_name: "Red" })];

  it("uses the colour's own photos without recolouring", () => {
    expect(pickColorPhotos(images, "Navy", ["Navy", "Red", "White"])).toEqual({ views: { front: u(1), back: u(2) }, guessed: [], source: "Navy", recolor: false });
  });

  it("borrows another colour's photos and recolours them", () => {
    const set = pickColorPhotos(images, "White", ["Navy", "Red", "White"]);
    expect(set).toMatchObject({ source: "Navy", recolor: true, views: { front: u(1), back: u(2) } });
  });

  it("prefers untagged photos over another colour's, and a lone unsorted photo becomes the front", () => {
    const set = pickColorPhotos([...images, img(9, "catalog", { sort_order: 1 })], "White", ["Navy", "White"]);
    expect(set).toMatchObject({ source: null, recolor: true, views: { front: u(9) }, guessed: [] });
  });

  it("does not recolour a single-colour product and returns null without garment photos", () => {
    expect(pickColorPhotos([img(1, "vton_garment")], "Navy", ["Navy"])?.recolor).toBe(false);
    expect(pickColorPhotos([img(1, "model_photo")], "Navy", ["Navy"])).toBeNull();
  });

  it("reads storage images through the same-origin rewrite", () => {
    expect(toSameOriginImage("http://127.0.0.1:9000/product-images/products/1.png")).toBe("/storage/product-images/products/1.png");
    expect(toSameOriginImage("/demo.svg")).toBe("/demo.svg");
  });
});

describe("product fit", () => {
  it("falls back to the sample chart and uses the variant colour", () => {
    const product = { id: 1, name: "Polo", images: [], variants: [{ size: "M", color_name: "Navy", color_hex: "#1f2a44" }] } as unknown as Product;
    const fit = resolveProductFit(product, "Navy");
    expect(fit.chartSource).toBe("sample");
    expect(fit.sizes).toEqual(SAMPLE_SIZES);
    expect(fit.fabricColor).toBe("#1f2a44");
    expect(fit.photos).toBeNull();
  });
});

it("shows only the shop gallery when a second set of photos supplies the four 3D views", () => {
  const images: ProductImage[] = ["back", "front", "angle", "side"].map(id => ({ id, url: "/" + id, kind: "model_photo" }));
  const slots: ProductImage[] = (["vton_garment", "flat_lay", "catalog", "catalog"] as const)
    .map((kind, i) => ({ id: String(i), url: "/fit" + i, kind, sort_order: 900 + i }));
  expect(storefrontGallery([...images, ...slots])).toEqual(images);
  expect(storefrontGallery([...images, ...slots.map((img, i) => ({ ...img, sort_order: 4 + i }))])).toEqual(images);
});

it("falls back to every fitting-room photo, front first, when a product has no other photos", () => {
  const slots: ProductImage[] = (["flat_lay", "catalog", "vton_garment"] as const)
    .map((kind, i) => ({ id: String(i), url: "/fit" + i, kind, sort_order: [901, 902, 900][i] }));
  expect(storefrontGallery(slots).map(img => img.id)).toEqual(["2", "0", "1"]);
});

it("uses the women's sample cut only when a women's product has no usable chart", () => {
  const product = { gender: "female", variants: [], images: [] } as unknown as Product;
  const medium = resolveProductFit(product).sizes.find(size => size.size === "M")!;
  expect(medium).toMatchObject({ chestCircCm: 94, waistCircCm: 85, shoulderWidthCm: 38, lengthCm: 58 });
  expect(resolveProductFit({ ...product, gender: "unisex" }).sizes).toEqual(SAMPLE_SIZES);
  const chart = { M: { chest: 108, length: 65 } };
  expect(resolveProductFit({ ...product, size_chart: chart }).sizes).toEqual(parseSizeChart(chart));
});

it("offers only the selected colour's active variants, with matching chart rows", () => {
  const product = { variants: [
    { size: "L", color_name: "Xam", is_active: true, available_stock: 0 },
    { size: "M", color_name: "Xam", is_active: true },
    { size: "XL", color_name: "Xam", is_active: true },
    { size: "S", color_name: "Xam", is_active: false },
    { size: "S", color_name: "Den", is_active: true },
  ] } as Product;
  expect(fitSizeOptions({ ...product, variants: [] }, "xam", SAMPLE_SIZES)).toEqual([]);
  const options = fitSizeOptions(product, "xam", SAMPLE_SIZES);
  expect(options.map(option => option.size)).toEqual(["M", "L", "XL"]);
  expect(options.map(option => option.dimensions?.size)).toEqual(["M", "L", undefined]);
  const shared = fitSizeOptions({ ...product, gender: "male" }, "xam", SAMPLE_SIZES, true);
  expect(shared.find(option => option.size === "XL")).toMatchObject({ estimated: true, dimensions: { lengthCm: 74 } });
  expect(fitSizeOptions(product, "Den", SAMPLE_SIZES).map(option => option.size)).toEqual(["S"]);
});

it("keeps actual cropped lengths and long sleeves from the chart", () => {
  expect(parseSizeChart({ S: { chest: 88, length: 36, sleeve: 57 } })[0])
    .toMatchObject({ lengthCm: 36, sleeveLengthCm: 57 });
});
