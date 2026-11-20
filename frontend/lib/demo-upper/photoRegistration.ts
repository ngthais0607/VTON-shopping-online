import { BufferAttribute, type BufferGeometry } from "three";
import { VIEW_AXES, type BBox, type PhotoView } from "./garmentPhotos";

const ROWS = 128;
type Outline = { left: Float32Array; right: Float32Array };

function outline(): Outline {
  return { left: new Float32Array(ROWS).fill(Infinity), right: new Float32Array(ROWS).fill(-Infinity) };
}

export function tracePhotoRows(mask: Uint8Array, width: number, box: BBox) {
  const result = outline();
  for (let row = 0; row < ROWS; row++) {
    const y = Math.round(box.y0 + row / (ROWS - 1) * (box.y1 - box.y0));
    for (let x = box.x0; x <= box.x1; x++) {
      if (!mask[y * width + x]) continue;
      result.left[row] = Math.min(result.left[row], x);
      result.right[row] = x;
    }
  }
  const columnBottom = new Int32Array(width).fill(-1);
  for (let x = box.x0; x <= box.x1; x++) {
    for (let y = box.y1; y >= box.y0; y--) {
      if (mask[y * width + x]) { columnBottom[x] = y; break; }
    }
  }
  return { ...result, columnBottom };
}

// A sleeve ends where the outline contracts sharply above the waist.
// Narrow side views can have no such landmark.
function cuffRow(shape: Outline) {
  const span = (i: number) => shape.right[i] - shape.left[i];
  let best = 0, row = 0;
  const widest = Math.max(...shape.right) - Math.min(...shape.left);
  for (let i = 20; i < 88; i++) {
    const loss = (span(i - 3) - span(i + 3)) / widest;
    if (loss > best) { best = loss; row = i; }
  }
  return best > 0.08 ? row : 0;
}

/** A raised collar has a narrow top above a gradual widening into the shoulders. */
export function hasRaisedCollar({ box, outline }: { box: BBox; outline: Outline }) {
  const width = box.x1 - box.x0 + 1;
  const firstWideRow = (fraction: number) => outline.right.findIndex((right, row) =>
    right - outline.left[row] >= width * fraction);
  const narrow = firstWideRow(0.24);
  const shoulder = firstWideRow(0.62);
  return narrow >= 0 && narrow <= ROWS * 0.04
    && shoulder >= ROWS * 0.084 && shoulder <= ROWS * 0.19
    && shoulder - narrow >= ROWS * 0.065;
}

export type FrontCut = {
  waistToChest: number;
  hemToChest: number;
  lengthToChestWidth: number;
  sleeveDropFraction: number;
};

function averageSpan(outline: Outline, fraction: number) {
  const center = Math.round(fraction * (ROWS - 1));
  let sum = 0;
  for (let row = center - 2; row <= center + 2; row++) {
    sum += outline.right[row] - outline.left[row];
  }
  return sum / 5;
}

/** Estimate the visible cut from the front photograph below the sleeve openings. */
export function measureFrontCut({ box, outline }: { box: BBox; outline: Outline }): FrontCut | null {
  const aspect = (box.x1 - box.x0 + 1) / (box.y1 - box.y0 + 1);
  const cuff = cuffRow(outline);
  if (aspect < 0.55 || aspect > 1.45 || cuff < ROWS * 0.25 || cuff > ROWS * 0.56) return null;
  const chest = averageSpan(outline, Math.max(0.52, cuff / ROWS + 0.07));
  const waist = averageSpan(outline, 0.77);
  const hem = averageSpan(outline, 0.94);
  if (!Number.isFinite(chest + waist + hem) || chest <= 0 || waist <= 0 || hem <= 0) return null;
  const waistToChest = waist / chest;
  const hemToChest = hem / chest;
  if (waistToChest < 0.72 || waistToChest > 1.14 || hemToChest < 0.72 || hemToChest > 1.24) return null;
  const shoulder = outline.right.findIndex((right, row) => right - outline.left[row] >= (box.x1 - box.x0) * 0.62);
  if (shoulder < 0 || shoulder >= cuff) return null;
  return {
    waistToChest,
    hemToChest,
    lengthToChestWidth: (box.y1 - box.y0 + 1) / chest,
    sleeveDropFraction: (cuff - shoulder) / (ROWS - 1),
  };
}

/** Recognise a compact, fitted tee from its frontal silhouette. */
export function isCompactFittedTee(photo: { box: BBox; outline: Outline }, cut = measureFrontCut(photo)) {
  const { box } = photo;
  const aspect = (box.x1 - box.x0 + 1) / (box.y1 - box.y0 + 1);
  return !!cut && aspect >= 0.91 && cut.waistToChest < 0.97 && cut.hemToChest > cut.waistToChest * 1.025;
}

function sample(values: Float32Array, row: number, fallback: number) {
  const i = Math.floor(row), j = Math.min(ROWS - 1, i + 1);
  if (!Number.isFinite(values[i]) || !Number.isFinite(values[j])) return fallback;
  return values[i] + (values[j] - values[i]) * (row - i);
}

/** Register each height on the fitted garment to the corresponding silhouette
 * in this camera's photograph. Units of the resulting attribute are texture UV. */
export function registerPhoto(geometry: BufferGeometry, view: PhotoView, photo: {
  outline: ReturnType<typeof tracePhotoRows>; box: BBox; width: number; height: number;
}, reflectX = false) {
  const pos = geometry.getAttribute("position"), index = geometry.getIndex()!;
  const axis = VIEW_AXES[view].right;
  const x = new Float32Array(pos.count), row = new Float32Array(pos.count);
  let top = -Infinity, bottom = Infinity, left = Infinity, right = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    x[i] = pos.getX(i) * (reflectX ? -axis[0] : axis[0]) + pos.getZ(i) * axis[2];
    left = Math.min(left, x[i]); right = Math.max(right, x[i]);
    top = Math.max(top, pos.getY(i)); bottom = Math.min(bottom, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i++) row[i] = (top - pos.getY(i)) / (top - bottom) * (ROWS - 1);
  const model = outline();
  for (let t = 0; t < index.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = index.getX(t + e), b = index.getX(t + (e + 1) % 3);
      const y0 = row[a], y1 = row[b];
      for (let y = Math.ceil(Math.min(y0, y1)); y <= Math.floor(Math.max(y0, y1)); y++) {
        const f = y0 === y1 ? 0 : (y - y0) / (y1 - y0);
        const u = x[a] + (x[b] - x[a]) * f;
        model.left[y] = Math.min(model.left[y], u);
        model.right[y] = Math.max(model.right[y], u);
      }
    }
  }
  const mc = cuffRow(model), pc = cuffRow(photo.outline);
  const uv = new Float32Array(pos.count * 2), end = ROWS - 1;
  for (let i = 0; i < pos.count; i++) {
    const y = Math.max(0, Math.min(end, row[i]));
    let sy = y;
    if (mc && pc) sy = y <= mc ? y * pc / mc : pc + (y - mc) * (end - pc) / (end - mc);
    const ml = sample(model.left, y, left), mr = sample(model.right, y, right);
    const pl = sample(photo.outline.left, sy, photo.box.x0), pr = sample(photo.outline.right, sy, photo.box.x1);
    const f = Math.max(0, Math.min(1, (x[i] - ml) / Math.max(1e-6, mr - ml)));
    const registered = pl + (pr - pl) * f;
    // Keep buttons and collars in proportion across the centre panel.
    const linear = photo.box.x0 + (x[i] - left) / (right - left) * (photo.box.x1 - photo.box.x0);
    const interior = Math.max(0, 1 - 2 * Math.abs(f - 0.5));
    uv[2 * i] = (registered + (linear - registered) * interior + 0.5) / photo.width;
    uv[2 * i + 1] = 1 - (photo.box.y0 + sy / end * (photo.box.y1 - photo.box.y0) + 0.5) / photo.height;
  }
  // Across a sleeve the true cuff is an angled line. Anchor its entire ring
  // to the photographed hem so even a narrow stripe survives size changes.
  if (view === "front" || view === "back") {
    const mid = (photo.box.x0 + photo.box.x1) / 2;
    const width = photo.box.x1 - photo.box.x0;
    const waistRow = Math.round(end * 0.68);
    for (const sleeve of geometry.userData.sleeves ?? []) {
      const { start, count, segments } = sleeve;
      const cuff = start + count - 4 * segments;
      const isLeft = x[cuff] < (left + right) / 2;
      const sideX = isLeft ? photo.box.x0 : photo.box.x1;
      const torsoEdge = isLeft ? photo.outline.left[waistRow] : photo.outline.right[waistRow];
      if (!Number.isFinite(torsoEdge) || Math.abs(torsoEdge - sideX) < width * 0.055) continue;
      let xmin = Infinity, xmax = -Infinity;
      for (let i = 0; i < segments; i++) {
        xmin = Math.min(xmin, x[cuff+i]); xmax = Math.max(xmax, x[cuff+i]);
      }
      const inside = torsoEdge + (isLeft ? -1 : 1) * width * 0.02;
      for (let i = start; i < start + count; i++) {
        const k = (i - start) % segments;
        const f = (x[cuff+k] - xmin) / Math.max(1e-6, xmax - xmin);
        const u = isLeft ? sideX + (inside - sideX) * f : inside + (sideX - inside) * f;
        // The very outside tip has subpixel height. Sample slightly inboard.
        const sx = u + (mid - u) * 0.008;
        const targetY = photo.outline.columnBottom[Math.round(sx)];
        if (targetY < photo.box.y0 || targetY > photo.box.y0 + 0.7 * (photo.box.y1 - photo.box.y0)) continue;
        const along = Math.min(1, Math.max(0, (i - start - k) / (cuff - start)));
        const weight = Math.min(1, along * 2);
        uv[2*i] += (sx / photo.width - uv[2*i]) * weight;
        const cuffV = 1 - (targetY + 0.5) / photo.height;
        const cuffModelRow = row[cuff+k];
        const distance = Math.max(0, cuffModelRow - row[i]) / end;
        uv[2*i+1] += (cuffV + distance * (photo.box.y1-photo.box.y0) / photo.height - uv[2*i+1]) * weight;
      }
    }
  }
  return new BufferAttribute(uv, 2);
}
