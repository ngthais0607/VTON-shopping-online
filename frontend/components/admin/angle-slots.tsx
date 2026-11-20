"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Replace, Trash2, Upload } from "lucide-react";
import { apiDelete, apiUpload } from "@/lib/api";
import { ANGLE_SLOTS, angleSlots } from "@/lib/demo-upper/productFit";
import type { ProductImage } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface Props {
  productId: number;
  images: ProductImage[];
  colors: string[];
  onImagesChange: (images: ProductImage[]) => void;
  onBusyChange?: (busy: boolean) => void;
}

const ALL = "";

export function AngleSlots({ productId, images, colors, onImagesChange, onBusyChange }: Props) {
  const [color, setColor] = useState(ALL);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const tabs = [ALL, ...colors];
  const set = angleSlots(images, color || null);

  async function put(view: string, file: File) {
    const slot = ANGLE_SLOTS.find(s => s.view === view)!;
    setError(null);
    setBusySlot(view);
    onBusyChange?.(true);
    try {
      if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error("Use a PNG, JPG or WebP photo");
      const form = new FormData();
      form.append("file", file);
      form.append("kind", slot.kind);
      form.append("is_primary", "false");
      form.append("sort_order", String(slot.sortOrder));
      if (color) form.append("color_name", color);
      const saved = await apiUpload<ProductImage>(`/products/${productId}/upload-image`, form);
      const old = set.views[slot.view as keyof typeof set.views];
      const withSaved = [...images.filter(i => i.id !== saved.id), saved];
      // Publish the upload first so the UI matches the server even if removing the old photo fails.
      onImagesChange(withSaved);
      if (old) {
        try {
          await apiDelete(`/products/${productId}/images/${old.id}`);
        } catch {
          throw new Error("The new photo was saved, but the old one could not be removed. Delete the old photo manually.");
        }
        onImagesChange(withSaved.filter(i => i.id !== old.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to upload photo");
    } finally {
      setBusySlot(null);
      onBusyChange?.(false);
    }
  }

  async function remove(image: ProductImage, view: string) {
    setError(null);
    setBusySlot(view);
    onBusyChange?.(true);
    try {
      await apiDelete(`/products/${productId}/images/${image.id}`);
      onImagesChange(images.filter(i => i.id !== image.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete photo");
    } finally {
      setBusySlot(null);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-white p-3" aria-label="3D angle photos">
      <div>
        <p className="text-sm font-semibold text-foreground">3D angle photos</p>
        <p className="text-xs text-muted-foreground">
          Upload the garment alone on a plain background, one photo per angle. The front photo is also used by the 2D try-on. Photos placed here are used by the 3D fitting room automatically; the colour tabs hold one set per colour.
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {tabs.map(tab => (
          <button
            key={tab || "all"}
            type="button"
            onClick={() => setColor(tab)}
            className={`rounded-full border px-3 py-1 text-xs ${tab === color ? "border-foreground bg-foreground text-white" : "border-border bg-white text-foreground"}`}
          >
            {tab || "All colours"}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ANGLE_SLOTS.map(slot => {
          const image = set.views[slot.view];
          const busy = busySlot === slot.view;
          return (
            <li key={slot.view} className="overflow-hidden rounded-md border border-border">
              <div className="relative aspect-square bg-background">
                {image ? (
                  <Image src={image.url} alt={`${slot.label} photo`} fill sizes="160px" className="object-contain" />
                ) : (
                  <button type="button" disabled={!!busySlot} onClick={() => inputs.current[slot.view]?.click()} className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                    <Upload className="h-5 w-5" />
                    {busy ? "Uploading..." : "Add photo"}
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between p-2">
                <span className="text-xs font-semibold">{slot.label}</span>
                {image && (
                  <span className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" aria-label={`Replace ${slot.label} photo`} disabled={!!busySlot} onClick={() => inputs.current[slot.view]?.click()}><Replace className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Delete ${slot.label} photo`} disabled={!!busySlot} onClick={() => remove(image, slot.view)}><Trash2 className="h-4 w-4 text-rose-600" /></Button>
                  </span>
                )}
              </div>
              <input
                ref={el => { inputs.current[slot.view] = el; }}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void put(slot.view, file);
                }}
              />
            </li>
          );
        })}
      </ul>
      {set.unsorted.length > 0 && (
        <p className="text-xs text-amber-700">{set.unsorted.length} older garment photo(s) for this colour are not in a slot; the 3D room guesses their angle. Upload to the slots to be exact.</p>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
