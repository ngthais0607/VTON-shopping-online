/**
 * Pure image helpers for dressing the mannequin with a product's garment photos.
 * Works on plain RGBA buffers so it can be unit-tested without a browser canvas.
 */

export type Rgba = { data: Uint8ClampedArray; width: number; height: number };
export type BBox = { x0: number; y0: number; x1: number; y1: number };

/** How far (0–255 per channel, max over RGB) a pixel may differ from the backdrop and still count as backdrop. */
export const BACKGROUND_TOLERANCE = 26;

/** Average colour of the image border: the photo's backdrop (white, light grey...). */
export function borderColor(img: Rgba): [number, number, number] {
  const { data, width: w, height: h } = img;
  let r = 0, g = 0, b = 0, n = 0;
  const add = (x: number, y: number) => {
    const i = 4 * (y * w + x);
    if (data[i + 3] < 16) return;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
  return n ? [r / n, g / n, b / n] : [255, 255, 255];
}

/**
 * 1 = garment, 0 = backdrop. The backdrop is flood-filled from the border, so light details inside
 * the garment survive unless they touch the outline.
 */
export function garmentMask(img: Rgba, tolerance = BACKGROUND_TOLERANCE): Uint8Array {
  const { data, width: w, height: h } = img;
  const [br, bg, bb] = borderColor(img);
  const isBackdrop = (p: number) => {
    const i = 4 * p;
    if (data[i + 3] < 16) return true;
    return Math.max(Math.abs(data[i] - br), Math.abs(data[i + 1] - bg), Math.abs(data[i + 2] - bb)) <= tolerance;
  };
  const mask = new Uint8Array(w * h).fill(1);
  const stack: number[] = [];
  const push = (p: number) => {
    if (mask[p] === 1 && isBackdrop(p)) {
      mask[p] = 0;
      stack.push(p);
    }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < w * (h - 1)) push(p + w);
  }
  // Contrast piping often touches the backdrop at both ends. Rescue short
  // gaps bracketed by fabric before trimming anti-aliased silhouette pixels.
  const bridge = (start: number, stride: number, length: number, limit: number) => {
    let last = -1;
    for (let i = 0; i < length; i++) {
      const px = start + stride * i;
      if (!mask[px]) continue;
      if (last >= 0 && i - last <= limit) {
        for (let j = last + 1; j < i; j++) {
          const gap = start + stride * j;
          if (data[4 * gap + 3] >= 240) mask[gap] = 1;
        }
      }
      last = i;
    }
  };
  for (let x = 0; x < w; x++) bridge(x, w, h, Math.ceil(h * 0.018));
  for (let y = 0; y < h; y++) bridge(y * w, 1, w, Math.ceil(w * 0.012));
  return erodeMask(mask, w, h, EDGE_TRIM);
}

/** Pixels trimmed off the garment outline: anti-aliased edge pixels are half backdrop and would paint light fringes on the tee. */
export const EDGE_TRIM = 2;

/** Turns garment pixels that touch the backdrop into backdrop, `passes` times. */
export function erodeMask(mask: Uint8Array, w: number, h: number, passes: number): Uint8Array {
  let cur = mask;
  for (let pass = 0; pass < passes; pass++) {
    const next = Uint8Array.from(cur);
    for (let p = 0; p < cur.length; p++) {
      if (!cur[p]) continue;
      const x = p % w;
      if ((x > 0 && !cur[p - 1]) || (x < w - 1 && !cur[p + 1]) || (p >= w && !cur[p - w]) || (p < w * (h - 1) && !cur[p + w])) next[p] = 0;
    }
    cur = next;
  }
  return cur;
}

export function maskBBox(mask: Uint8Array, w: number, h: number): BBox | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** Share of garment pixels whose mirror image (about the bbox centre line) is also garment. 1 = perfectly symmetric. */
export function mirrorSymmetry(mask: Uint8Array, w: number, box: BBox): number {
  let both = 0, any = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const a = mask[y * w + x];
      const b = mask[y * w + (box.x0 + box.x1 - x)];
      if (a || b) any++;
      if (a && b) both++;
    }
  }
  return any ? both / any : 0;
}

/** Horizontal centre of mass of the garment relative to the bbox: −0.5 (left edge) … 0 (centre) … 0.5 (right edge). */
export function massOffset(mask: Uint8Array, w: number, box: BBox): number {
  let sum = 0, n = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      if (mask[y * w + x]) { sum += x; n++; }
    }
  }
  if (!n) return 0;
  return (sum / n - (box.x0 + box.x1) / 2) / (box.x1 - box.x0 + 1);
}

export function meanColor(img: Rgba, mask: Uint8Array): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    r += img.data[4 * p]; g += img.data[4 * p + 1]; b += img.data[4 * p + 2]; n++;
  }
  return n ? [r / n, g / n, b / n] : [200, 200, 200];
}

/**
 * Replace the backdrop with garment colour so texture lookups that land just outside the outline
 * (the 3D tee never matches the photo's silhouette exactly) do not pick up the white backdrop.
 * Grows the garment outwards a few pixels, then fills what is left with the mean garment colour.
 */
export function bleedBackground(img: Rgba, mask: Uint8Array, passes = 6): Rgba {
  const { width: w, height: h } = img;
  const data = new Uint8ClampedArray(img.data);
  let filled = Uint8Array.from(mask);
  for (let pass = 0; pass < passes; pass++) {
    const next = Uint8Array.from(filled);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (filled[p]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
          if (q < 0 || !filled[q]) continue;
          r += data[4 * q]; g += data[4 * q + 1]; b += data[4 * q + 2]; n++;
        }
        if (!n) continue;
        data[4 * p] = r / n; data[4 * p + 1] = g / n; data[4 * p + 2] = b / n; data[4 * p + 3] = 255;
        next[p] = 1;
      }
    }
    filled = next;
  }
  const [mr, mg, mb] = meanColor(img, mask);
  for (let p = 0; p < w * h; p++) {
    if (filled[p]) { data[4 * p + 3] = 255; continue; }
    data[4 * p] = mr; data[4 * p + 1] = mg; data[4 * p + 2] = mb; data[4 * p + 3] = 255;
  }
  return { data, width: w, height: h };
}

export function flipHorizontal(img: Rgba): Rgba {
  const { width: w, height: h } = img;
  const data = new Uint8ClampedArray(img.data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set(img.data.subarray(4 * (y * w + x), 4 * (y * w + x) + 4), 4 * (y * w + (w - 1 - x)));
  }
  return { data, width: w, height: h };
}

/** The views the tee can be dressed from (camera direction, degrees around the mannequin). */
export type PhotoView = "front" | "angle45" | "side" | "back";

export type PhotoStats = { aspect: number; symmetry: number };

export function photoStats(mask: Uint8Array, w: number, box: BBox): PhotoStats {
  return { aspect: (box.x1 - box.x0 + 1) / (box.y1 - box.y0 + 1), symmetry: mirrorSymmetry(mask, w, box) };
}

/**
 * Decide which angle each extra photo shows, given the front photo's stats.
 * - side: by far the narrowest silhouette (a side view loses the sleeves' span, roughly half the front width);
 * - back: the most mirror-symmetric of the rest (a back view is as symmetric as the front);
 * - 45°: whatever is left (one sleeve foreshortened, so it is lopsided).
 * Returns the index into `others` for each view found.
 */
export function classifyViews(front: PhotoStats | null, others: PhotoStats[]): Partial<Record<Exclude<PhotoView, "front">, number>> {
  const out: Partial<Record<Exclude<PhotoView, "front">, number>> = {};
  const left = others.map((_, i) => i);
  if (!left.length) return out;
  const refAspect = front?.aspect ?? Math.max(...others.map((o) => o.aspect));
  const narrowest = left.reduce((a, b) => (others[b].aspect < others[a].aspect ? b : a));
  if (others[narrowest].aspect < refAspect * 0.62) {
    out.side = narrowest;
    left.splice(left.indexOf(narrowest), 1);
  }
  if (!left.length) return out;
  const mostSymmetric = left.reduce((a, b) => (others[b].symmetry > others[a].symmetry ? b : a));
  // With two candidates the more symmetric one is the back; a lone one must look symmetric on its own.
  if (left.length > 1 || others[mostSymmetric].symmetry >= 0.86) {
    out.back = mostSymmetric;
    left.splice(left.indexOf(mostSymmetric), 1);
  }
  if (left.length) out.angle45 = left[0];
  return out;
}

/** Unit view direction (towards the camera) and image-right axis for each view; front is +Z, the 45° and side cameras sit on +X. */
export const VIEW_AXES: Record<PhotoView, { dir: [number, number, number]; right: [number, number, number] }> = {
  front: { dir: [0, 0, 1], right: [1, 0, 0] },
  angle45: { dir: [Math.SQRT1_2, 0, Math.SQRT1_2], right: [Math.SQRT1_2, 0, -Math.SQRT1_2] },
  side: { dir: [1, 0, 0], right: [0, 0, -1] },
  back: { dir: [0, 0, -1], right: [-1, 0, 0] },
};

/** Views that only exist for one side of the body and are mirrored onto the other (x → |x|). */
export const MIRRORED_VIEWS: PhotoView[] = ["angle45", "side"];

/**
 * Linear map from object space to texture uv for one view: u = right·p · sx + ox, v = y · sy + oy.
 * The mesh's projected extent is stretched onto the garment's bbox in the photo, so the photo's
 * outline lands on the tee's outline. `box` is in pixels, uv has v = 0 at the bottom of the image.
 */
export function projectionMap(positions: ArrayLike<number>, view: PhotoView, box: BBox, w: number, h: number): [number, number, number, number] {
  const r = VIEW_AXES[view].right;
  
  let uMin = Infinity, uMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const u = x * r[0] + positions[i + 2] * r[2];
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const bu0 = box.x0 / w, bu1 = (box.x1 + 1) / w;
  const bvBottom = 1 - (box.y1 + 1) / h, bvTop = 1 - box.y0 / h;
  const sx = (bu1 - bu0) / Math.max(uMax - uMin, 1e-6);
  const sy = (bvTop - bvBottom) / Math.max(yMax - yMin, 1e-6);
  return [sx, bu0 - uMin * sx, sy, bvBottom - yMin * sy];
}
