"use client";

import { useState } from "react";
import Image from "next/image";
import { Star, Trash2 } from "lucide-react";
import { apiDelete, apiPatch } from "@/lib/api";
import { PRODUCT_IMAGE_KINDS, type ProductImage, type ProductImageKind } from "@/lib/types";
import { ImageUploader } from "@/components/image-uploader";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";

interface Props {
  productId?: number;
  images?: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
  onUploadSuccess: (url: string) => void;
  onFileSelected?: (file: File | null) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Colour names of the product's variants, offered when tagging an image. */
  colors?: string[];
}

const KIND_LABELS: Record<ProductImageKind, string> = {
  model_photo: "Model photo",
  flat_lay: "Flat lay (garment only)",
  detail: "Detail",
  size_chart: "Size chart",
  catalog: "Catalog",
  vton_garment: "Try-on garment (hidden from gallery)",
};

export function AdminProductImages({ productId, images = [], onImagesChange, onUploadSuccess, onFileSelected, onBusyChange, colors = [] }: Props) {
  const [kind, setKind] = useState<ProductImageKind>("model_photo");
  const [colorName, setColorName] = useState("");
  const [selected, setSelected] = useState<ProductImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cover = images.find(image => image.is_primary) || images[0];

  async function updateImage(image: ProductImage, patch: { is_primary?: boolean; color_name?: string | null }) {
    if (!productId || uploading) return;
    setError(null);
    setUploading(true);
    onBusyChange?.(true);
    try {
      const saved = await apiPatch<ProductImage, typeof patch>(`/products/${productId}/images/${image.id}`, patch);
      const next = images.map(item => item.id === saved.id
        ? saved
        : saved.is_primary ? { ...item, is_primary: false } : item);
      onImagesChange(saved.is_primary ? [saved, ...next.filter(item => item.id !== saved.id)] : next);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to update image");
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  }

  async function deleteImage() {
    if (!productId || !selected || deleting) return;
    setDeleting(true);
    setError(null);
    onBusyChange?.(true);
    try {
      await apiDelete(`/products/${productId}/images/${selected.id}`);
      // Match the API fallback cover when no remaining image is marked primary.
      onImagesChange(images.filter(image => image.id !== selected.id).sort((a, b) =>
        Number(!!b.is_primary) - Number(!!a.is_primary) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
      ));
      setSelected(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to delete image");
    } finally {
      setDeleting(false);
      onBusyChange?.(false);
    }
  }

  return (
    <section className="space-y-4" aria-label="Product images">
      {productId && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-foreground">
            Upload next image as
            <select
              value={kind}
              disabled={uploading}
              onChange={event => setKind(event.target.value as ProductImageKind)}
              className="mt-1 block w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm font-normal"
            >
              {PRODUCT_IMAGE_KINDS.map(value => <option key={value} value={value}>{KIND_LABELS[value]}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-foreground">
            Colour
            <select
              value={colorName}
              disabled={uploading}
              onChange={event => setColorName(event.target.value)}
              className="mt-1 block w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm font-normal"
            >
              <option value="">All colours</option>
              {colors.map(color => <option key={color} value={color}>{color}</option>)}
            </select>
          </label>
        </div>
      )}
      {productId && kind === "vton_garment" ? (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Hidden from the gallery. Garment only (no mannequin or person), front view, plain background, at least 256 px.
        </p>
      ) : productId ? (
        <p className="text-xs text-muted-foreground">
          Any PNG, JPG or WebP photo can be tried on. Shoppers pick which photo to use on the product page.
        </p>
      ) : null}
      <ImageUploader
        productId={productId}
        kind={kind}
        colorName={colorName || null}
        isPrimary={!productId || (kind !== "vton_garment" && !images.some(image => image.kind !== "vton_garment"))}
        currentImageUrl={cover?.url}
        onFileSelected={onFileSelected}
        onBusyChange={busy => { setUploading(busy); onBusyChange?.(busy); }}
        onImageUploaded={image => {
          const others = images.filter(previous => previous.id !== image.id);
          onImagesChange(image.is_primary
            ? [image, ...others.map(previous => ({ ...previous, is_primary: false }))]
            : [...others, image]);
        }}
        onUploadSuccess={onUploadSuccess}
      />
      {error && !selected && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      {productId && images.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">The first image becomes the cover. To change it, use the star on any image. Tag each image with its colour so shoppers see the right photos when they pick a colour.</p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((image, index) => (
              <li key={image.id} className="overflow-hidden rounded-md border border-border bg-white">
                <div className="relative aspect-square bg-background">
                  <Image src={image.url} alt={`Product image ${index + 1}`} fill sizes="160px" className="object-contain" />
                </div>
                <div className="space-y-2 p-2">
                  <span className="block text-xs text-muted-foreground">{image.id === cover?.id ? "Cover image" : `Image ${index + 1}`}{image.kind && image.kind !== "model_photo" ? ` · ${KIND_LABELS[image.kind] ?? image.kind}` : ""}</span>
                  <div className="flex items-center gap-1">
                    <select
                      aria-label={`Colour for image ${index + 1}`}
                      value={image.color_name ?? ""}
                      disabled={uploading || deleting}
                      onChange={event => updateImage(image, { color_name: event.target.value || null })}
                      className="min-w-0 flex-1 rounded-md border border-border bg-white px-1.5 py-1 text-xs"
                    >
                      <option value="">All colours</option>
                      {image.color_name && !colors.includes(image.color_name) && <option value={image.color_name}>{image.color_name}</option>}
                      {colors.map(color => <option key={color} value={color}>{color}</option>)}
                    </select>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Set image ${index + 1} as cover`} title="Set as cover" disabled={uploading || deleting || image.id === cover?.id} onClick={() => updateImage(image, { is_primary: true })}>
                      <Star className={`h-4 w-4 ${image.id === cover?.id ? "fill-amber-400 text-amber-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Delete image ${index + 1}`} disabled={deleting || uploading} onClick={() => { setError(null); setSelected(image); }}>
                      <Trash2 className="h-4 w-4 text-rose-600" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <AlertDialog open={!!selected} onOpenChange={open => { if (!open && !deleting) setSelected(null); }}>
        <AlertDialogContent className="admin-dialog">
          <AlertDialogTitle>Delete product image?</AlertDialogTitle>
          <AlertDialogDescription>The selected image will be removed from this product and storage. Other images will be kept.</AlertDialogDescription>
          {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={deleting} onClick={() => setSelected(null)}>Cancel</Button>
            <Button type="button" disabled={deleting} onClick={deleteImage} className="bg-rose-600 hover:bg-rose-700">{deleting ? "Deleting..." : "Delete image"}</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
