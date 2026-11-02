"use client";

import { useState } from "react";
import Image from "next/image";
import { Trash2 } from "lucide-react";
import { apiDelete } from "@/lib/api";
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
};

export function AdminProductImages({ productId, images = [], onImagesChange, onUploadSuccess, onFileSelected, onBusyChange, colors = [] }: Props) {
  const [kind, setKind] = useState<ProductImageKind>("model_photo");
  const [colorName, setColorName] = useState("");
  const [selected, setSelected] = useState<ProductImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cover = images.find(image => image.is_primary) || images[0];

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
            Image type
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
      <ImageUploader
        productId={productId}
        kind={kind}
        colorName={colorName || null}
        isPrimary={kind === "model_photo"}
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
      {productId && images.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">Uploading a model photo saves a new cover immediately. Other image types are added to the gallery. Previous images stay until you delete them.</p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((image, index) => (
              <li key={image.id} className="overflow-hidden rounded-md border border-border bg-white">
                <div className="relative aspect-square bg-background">
                  <Image src={image.url} alt={`Product image ${index + 1}`} fill sizes="160px" className="object-contain" />
                </div>
                <div className="flex items-center justify-between gap-2 p-2">
                  <span className="text-xs text-muted-foreground">{image.id === cover?.id ? "Cover image" : `Image ${index + 1}`}{image.kind && image.kind !== "model_photo" ? ` · ${KIND_LABELS[image.kind] ?? image.kind}` : ""}{image.color_name ? ` · ${image.color_name}` : ""}</span>
                  <Button type="button" variant="ghost" size="sm" aria-label={`Delete image ${index + 1}`} disabled={deleting || uploading} onClick={() => { setError(null); setSelected(image); }}>
                    <Trash2 className="h-4 w-4 text-rose-600" />
                  </Button>
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
