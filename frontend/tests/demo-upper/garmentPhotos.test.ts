import { measureFrontCut, tracePhotoRows } from "@/lib/demo-upper/photoRegistration";
import { describe, expect, it } from "vitest";
import { bleedBackground, classifyViews, EDGE_TRIM, garmentMask, maskBBox, photoStats, projectionMap, type Rgba } from "@/lib/demo-upper/garmentPhotos";

/** White canvas with a filled shape painted by `inside(x, y)`. */
function synth(w: number, h: number, inside: (x: number, y: number) => boolean, rgb: [number, number, number] = [30, 40, 80]): Rgba {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 4 * (y * w + x);
      const c = inside(x, y) ? rgb : [255, 255, 255];
      data.set([...c, 255], i);
    }
  }
  return { data, width: w, height: h };
}

/** A T shape: body plus sleeves spanning `span` px, optionally shifted sleeves to break symmetry. */
const tee = (span: number, shift = 0) => (x: number, y: number) =>
  (x >= 40 && x < 80 && y >= 20 && y < 110) || (y >= 20 && y < 45 && x >= 60 - span / 2 + shift && x < 60 + span / 2 + (shift > 0 ? 0 : shift));

describe("garment photos", () => {
  it("removes a white backdrop but keeps white details enclosed by the garment", () => {
    const img = synth(120, 130, (x, y) => tee(100)(x, y) && !(x >= 55 && x < 65 && y >= 60 && y < 70));
    // Paint the enclosed hole white: it is not connected to the border, so it stays garment.
    const mask = garmentMask(img);
    expect(mask[65 * 120 + 60]).toBe(1);
    expect(mask[5 * 120 + 5]).toBe(0);
    // The outline is trimmed by EDGE_TRIM px to drop anti-aliased fringe pixels.
    expect(maskBBox(mask, 120, 130)).toEqual({ x0: 10 + EDGE_TRIM, y0: 20 + EDGE_TRIM, x1: 109 - EDGE_TRIM, y1: 109 - EDGE_TRIM });
  });

  it("retains a white cuff stripe connected to the backdrop at both ends", () => {
    const img = synth(160, 200, (x, y) => x >= 20 && x < 140 && y >= 20 && y < 180 && (y < 154 || y > 156));
    const mask = garmentMask(img);
    expect(mask[155 * 160 + 32]).toBe(1);
    expect(mask[155 * 160 + 6]).toBe(0);
  });

  it("bleeds garment colour into the backdrop", () => {
    const img = synth(120, 130, tee(100));
    const out = bleedBackground(img, garmentMask(img));
    for (const p of [0, 5 * 120 + 5, 129 * 120 + 119]) expect(Array.from(out.data.slice(4 * p, 4 * p + 3))).toEqual([30, 40, 80]);
  });

  it("tells the side, back and 45° photos apart", () => {
    const stats = (shape: (x: number, y: number) => boolean) => {
      const img = synth(120, 130, shape);
      const m = garmentMask(img);
      return photoStats(m, 120, maskBBox(m, 120, 130)!);
    };
    const front = stats(tee(100));
    const side = stats((x, y) => x >= 45 && x < 75 && y >= 20 && y < 110);
    const back = stats(tee(96));
    const angled = stats(tee(90, 10));
    expect(classifyViews(front, [angled, side, back])).toEqual({ side: 1, back: 2, angle45: 0 });
    expect(classifyViews(front, [back, angled])).toEqual({ back: 0, angle45: 1 });
    expect(classifyViews(front, [])).toEqual({});
  });

  it("maps the tee's projected outline onto the photo's garment box", () => {
    // Two points spanning x ∈ [-0.5, 0.5], y ∈ [0, 1] (front view).
    const positions = [-0.5, 0, 0, 0.5, 1, 0];
    const [sx, ox, sy, oy] = projectionMap(positions, "front", { x0: 10, y0: 20, x1: 109, y1: 109 }, 120, 130);
    expect(-0.5 * sx + ox).toBeCloseTo(10 / 120, 6);
    expect(0.5 * sx + ox).toBeCloseTo(110 / 120, 6);
    expect(0 * sy + oy).toBeCloseTo(1 - 110 / 130, 6);
    expect(1 * sy + oy).toBeCloseTo(1 - 20 / 130, 6);
  });
});

it("measures shirt proportions from an uploaded silhouette", () => {
  const img = synth(140, 130, (x, y) => {
    if (y < 10 || y >= 110) return false;
    const width = y < 49 ? 118 : y < 77 ? 76 : y < 98 ? 64 : 70;
    return Math.abs(x - 70) < width / 2;
  });
  const mask = garmentMask(img);
  const box = maskBBox(mask, img.width, img.height)!;
  const cut = measureFrontCut({ box, outline: tracePhotoRows(mask, img.width, box) })!;
  expect(cut.waistToChest).toBeLessThan(0.95);
  expect(cut.hemToChest).toBeGreaterThan(cut.waistToChest);
  expect(cut.lengthToChestWidth).toBeGreaterThan(1);
  expect(cut.sleeveDropFraction).toBeGreaterThan(0.2);
});
