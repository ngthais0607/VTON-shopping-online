"use client";
import { useEffect, useState } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { bleedBackground, classifyViews, garmentMask, maskBBox, meanColor, photoStats, type PhotoView, type Rgba } from "@/lib/demo-upper/garmentPhotos";
import { tracePhotoRows } from "@/lib/demo-upper/photoRegistration";
import type { GarmentPhoto } from "@/lib/demo-upper/photoMaterial";

/** Photos are downscaled to this many pixels on their long side before processing. */
const MAX_SIDE = 1024;

export type GarmentPhotosState = { status: "idle" | "loading" | "ready" | "error"; photos: GarmentPhoto[] };

const NONE: GarmentPhoto[] = [];
const IDLE: GarmentPhotosState = { status: "idle", photos: NONE };
const LOADING: GarmentPhotosState = { status: "loading", photos: NONE };

type Loaded = { url: string; img: Rgba; mask: Uint8Array };

function loadPixels(url: string): Promise<Loaded> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const w = Math.max(1, Math.round(image.naturalWidth * scale));
      const h = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return reject(new Error("No 2D canvas"));
      ctx.drawImage(image, 0, 0, w, h);
      try {
        const { data } = ctx.getImageData(0, 0, w, h);
        const img = { data, width: w, height: h };
        resolve({ url, img, mask: garmentMask(img) });
      } catch (e) {
        reject(e);
      }
    };
    image.onerror = () => reject(new Error(`Could not load ${url}`));
    image.src = url;
  });
}

const hex = ([r, g, b]: [number, number, number]) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

function toPhoto(view: PhotoView, l: Loaded): GarmentPhoto | null {
  const box = maskBBox(l.mask, l.img.width, l.img.height);
  // A photo where almost nothing differs from the backdrop cannot be used.
  if (!box || (box.x1 - box.x0) * (box.y1 - box.y0) < 0.05 * l.img.width * l.img.height) return null;
  const clean = bleedBackground(l.img, l.mask);
  const canvas = document.createElement("canvas");
  canvas.width = clean.width;
  canvas.height = clean.height;
  canvas.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(clean.data), clean.width, clean.height), 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return { view, url: l.url, texture, box, outline: tracePhotoRows(l.mask, l.img.width, box), width: clean.width, height: clean.height, meanColor: hex(meanColor(l.img, l.mask)) };
}

const VIEWS: PhotoView[] = ["front", "angle45", "side", "back"];

/**
 * Loads the product's garment photos and removes the backdrop. Photos placed in an angle slot keep
 * that angle; the rest are matched to the free angles from their silhouette.
 */
export function useGarmentPhotos(views: Partial<Record<PhotoView, string>>, guessed: string[]): GarmentPhotosState {
  const key = [...VIEWS.map((v) => views[v] ?? ""), ...guessed].join("|");
  const [state, setState] = useState<GarmentPhotosState & { key: string }>({ ...IDLE, key: "" });

  useEffect(() => {
    if (!key.replace(/\|/g, "")) return;
    let cancelled = false;
    let made: GarmentPhoto[] = [];
    const urls = key.split("|");
    const settle = (s: GarmentPhotosState) => {
      if (!cancelled) setState({ ...s, key });
    };
    void Promise.allSettled(urls.map((u) => (u ? loadPixels(u) : Promise.reject(new Error("empty slot"))))).then((results) => {
      if (cancelled) return;
      const ok = (i: number) => (results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<Loaded>).value : null);
      const picked = new Map<PhotoView, Loaded>();
      VIEWS.forEach((view, i) => {
        const l = ok(i);
        if (l) picked.set(view, l);
      });
      const rest = urls.slice(VIEWS.length).map((_, i) => ok(VIEWS.length + i)).filter((l): l is Loaded => !!l);
      if (rest.length) {
        const stats = (l: Loaded) => {
          const box = maskBBox(l.mask, l.img.width, l.img.height);
          return box ? photoStats(l.mask, l.img.width, box) : { aspect: 1, symmetry: 0 };
        };
        const front = picked.get("front");
        const guessedViews = classifyViews(front ? stats(front) : null, rest.map(stats));
        for (const [view, idx] of Object.entries(guessedViews) as [PhotoView, number][]) {
          if (!picked.has(view)) picked.set(view, rest[idx]);
        }
        // A guessed photo whose angle is already filled may still serve as the front.
        if (!picked.has("front")) picked.set("front", rest[0]);
      }
      made = VIEWS.flatMap((view) => {
        const l = picked.get(view);
        const p = l ? toPhoto(view, l) : null;
        return p ? [p] : [];
      });
      settle({ status: made.length ? "ready" : "error", photos: made });
    });
    return () => {
      cancelled = true;
      made.forEach((p) => p.texture.dispose());
    };
  }, [key]);

  if (!key.replace(/\|/g, "")) return IDLE;
  return state.key === key ? state : LOADING;
}
