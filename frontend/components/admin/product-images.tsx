"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Star, Trash2, X } from "lucide-react";
import { apiDelete, apiPatch, apiPut } from "@/lib/api";
import { PRODUCT_IMAGE_KINDS, type ProductImage, type ProductImageKind } from "@/lib/types";
import { ImageUploader } from "@/components/image-uploader";
import { AngleSlots } from "@/components/admin/angle-slots";
import { allSlotImages } from "@/lib/demo-upper/productFit";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";

interface Props {
  productId?: number;
  productSlug?: string;
  images?: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
  onUploadSuccess: (url: string) => void;
  /** New product only: images chosen so far, uploaded after the product is created. */
  stagedFiles?: File[];
  onStagedFilesChange?: (files: File[]) => void;
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

const GENERAL_KINDS = PRODUCT_IMAGE_KINDS.filter(value => value === "model_photo" || value === "detail" || value === "size_chart");

export function AdminProductImages({ productId, productSlug, images = [], onImagesChange, onUploadSuccess, stagedFiles = [], onStagedFilesChange, onBusyChange, colors = [] }: Props) {
  const [kind, setKind] = useState<ProductImageKind>("model_photo");
  const [colorName, setColorName] = useState("");
  const [selected, setSelected] = useState<ProductImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stagedUrls = useMemo(() => stagedFiles.map(file => URL.createObjectURL(file)), [stagedFiles]);
  useEffect(() => () => stagedUrls.forEach(url => URL.revokeObjectURL(url)), [stagedUrls]);
  function moveStaged(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= stagedFiles.length) return;
    const next = [...stagedFiles];
    [next[index], next[target]] = [next[target], next[index]];
    onStagedFilesChange?.(next);
  }
  // Photos in a 3D angle slot live in their own panel; this grid holds the rest (other colours, details...).
  const gallery = useMemo(() => {
    const slotIds = new Set(allSlotImages(images).map(image => image.id));
    return images.filter(image => !slotIds.has(image.id));
  }, [images]);
  const cover = gallery.find(image => image.is_primary) || gallery[0];

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

  async function moveImage(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (!productId || uploading || target < 0 || target >= gallery.length) return;
    const reordered = [...gallery];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setError(null);
    setUploading(true);
    onBusyChange?.(true);
    try {
      const saved = await apiPut<ProductImage[], { image_ids: string[] }>(
        `/products/${productId}/images/order`,
        { image_ids: [...reordered, ...allSlotImages(images)].map(image => image.id) },
      );
      onImagesChange(saved);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to reorder images");
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
            Add image as
            <select
              value={kind}
              disabled={uploading}
              onChange={event => setKind(event.target.value as ProductImageKind)}
              className="mt-1 block w-full rounded-md border border-border bg-white px-2 py-1.5 text-sm font-normal"
            >
              {GENERAL_KINDS.map(value => <option key={value} value={value}>{KIND_LABELS[value]}</option>)}
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
      {productId ? (
        <p className="text-xs text-muted-foreground">
          Use this for the shop gallery and other shirt colours: pick a colour, then add its photos. Shoppers pick which photo to use on the product page.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Save the product first, then add the Front / 45° / Side / Back photos for the 3D fitting room.</p>
      )}
      {productId && <AngleSlots productId={productId} productSlug={productSlug} images={images} colors={colors} onImagesChange={onImagesChange} onBusyChange={onBusyChange} />}
      <ImageUploader
        productId={productId}
        multiple
        dropzoneOnly
        label="Add images"
        kind={kind}
        colorName={colorName || null}
        isPrimary={!productId || !gallery.length}
        currentImageUrl={cover?.url}
        onFilesPicked={productId ? undefined : files => onStagedFilesChange?.([...stagedFiles, ...files])}
        onBusyChange={busy => { setUploading(busy); onBusyChange?.(busy); }}
        onImageUploaded={image => {
          const others = images.filter(previous => previous.id !== image.id);
          onImagesChange(image.is_primary
            ? [image, ...others.map(previous => ({ ...previous, is_primary: false }))]
            : [...others, image]);
        }}
        onUploadSuccess={onUploadSuccess}
      />
      {stagedFiles.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">{stagedFiles.length} image(s) will be uploaded when you save. The first one becomes the cover; use the arrows to reorder.</p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {stagedFiles.map((file, index) => (
              <li key={`${file.name}-${index}`} className="overflow-hidden rounded-md border border-border bg-white">
                <div className="relative aspect-square bg-background">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={stagedUrls[index]} alt={`Staged image ${index + 1}`} className="h-full w-full object-contain" />
                </div>
                <div className="space-y-1 p-2">
                  <span className="block truncate text-xs text-muted-foreground">{index === 0 ? "Cover image" : `Image ${index + 1}`} · {file.name}</span>
                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="sm" aria-label={`Move staged image ${index + 1} earlier`} disabled={index === 0} onClick={() => moveStaged(index, -1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Move staged image ${index + 1} later`} disabled={index === stagedFiles.length - 1} onClick={() => moveStaged(index, 1)}><ChevronRight className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Remove staged image ${index + 1}`} onClick={() => onStagedFilesChange?.(stagedFiles.filter((_, i) => i !== index))}><X className="h-4 w-4 text-rose-600" /></Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && !selected && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      {productId && gallery.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">The first image becomes the cover (star). Use the arrows to change the display order. Tag each image with its colour so shoppers see the right photos when they pick a colour.</p>
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {gallery.map((image, index) => (
              <li key={image.id} className="overflow-hidden rounded-md border border-border bg-white">
                <div className="relative aspect-square bg-background">
                  <Image src={image.url} alt={`Product image ${index + 1}`} fill sizes="160px" className="object-contain" />
                </div>
                <div className="space-y-2 p-2">
                  <span className="block text-xs text-muted-foreground">{image.id === cover?.id ? "Cover image" : `Image ${index + 1}`}{image.kind && image.kind !== "model_photo" ? ` · ${KIND_LABELS[image.kind] ?? image.kind}` : ""}</span>
                  <div className="flex flex-wrap items-center gap-1">
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
                    <Button type="button" variant="ghost" size="sm" aria-label={`Move image ${index + 1} earlier`} title="Move earlier" disabled={uploading || deleting || index === 0} onClick={() => moveImage(index, -1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" aria-label={`Move image ${index + 1} later`} title="Move later" disabled={uploading || deleting || index === gallery.length - 1} onClick={() => moveImage(index, 1)}>
                      <ChevronRight className="h-4 w-4" />
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
