"use client";

import { apiUpload } from "@/lib/api";
import type { ProductImage, ProductImageKind } from "@/lib/types";
import { Loader2,UploadCloud,X } from "lucide-react";
import Image from "next/image";
import React,{ useEffect,useRef,useState } from "react";

interface ImageUploaderProps {
  productId?: number;
  currentImageUrl?: string;
  onUploadSuccess: (url: string) => void;
  onImageUploaded?: (image: ProductImage) => void;
  onFileSelected?: (file: File | null) => void;
  onBusyChange?: (busy: boolean) => void;
  /** Sent to the API; defaults match the previous behaviour (model_photo, primary). */
  kind?: ProductImageKind;
  colorName?: string | null;
  isPrimary?: boolean;
  label?: string;
  hint?: string;
}

const MAX_SIDE = 8192;
const VTON_MIN_SIDE = 256;

/** Decodes the file in the browser so obviously bad images fail before upload. */
async function checkImage(file: File, kind: ProductImageKind): Promise<string | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return "This file is corrupt or cannot be read as an image.";
  }
  const { width, height } = bitmap;
  bitmap.close?.();
  if (width > MAX_SIDE || height > MAX_SIDE || width * height > 16_000_000) {
    return "Image is too large: at most 8192 px per side and 16 megapixels.";
  }
  if (kind === "vton_garment" && Math.min(width, height) < VTON_MIN_SIDE) {
    return `Try-on garment images must be at least ${VTON_MIN_SIDE} px on each side (this one is ${width}×${height}).`;
  }
  return null;
}

export function ImageUploader({ productId, currentImageUrl, onUploadSuccess, onImageUploaded, onFileSelected, onBusyChange, kind = "model_photo", colorName = null, isPrimary = true, label = "Product Image", hint = "PNG, JPG, WEBP up to 5MB" }: ImageUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [error, setError] = useState<string | null>(null);
  const [pickedName, setPickedName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const localPreview = useRef<string | null>(null);
  const busyRef = useRef(false);
  useEffect(() => () => { if (localPreview.current) URL.revokeObjectURL(localPreview.current); }, []);
  useEffect(() => { setPreviewUrl(currentImageUrl || null); }, [currentImageUrl, productId]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    if (busyRef.current) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Please select a valid image file (PNG, JPG, WEBP)");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Product image must not exceed 5MB");
      return;
    }

    setError(null);
    setUploading(true);
    busyRef.current = true;
    onBusyChange?.(true);
    const problem = typeof createImageBitmap === "function" ? await checkImage(file, kind) : null;
    if (problem) {
      setError(problem);
      setUploading(false);
      busyRef.current = false;
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onFileSelected?.(file);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("is_primary", String(isPrimary));
      formData.append("kind", kind);
      if (colorName) formData.append("color_name", colorName);

      let uploadedUrl: string;
      let uploadedImage: ProductImage | undefined;
      if (productId) {
        const response = await apiUpload<ProductImage>(`/products/${productId}/upload-image`, formData);
        uploadedUrl = response.url;
        uploadedImage = response;
        onFileSelected?.(null);
      } else {
        if (localPreview.current) URL.revokeObjectURL(localPreview.current);
        uploadedUrl = URL.createObjectURL(file);
        localPreview.current = uploadedUrl;
        setPickedName(file.name);
      }

      if (isPrimary) setPreviewUrl(uploadedUrl);
      if (uploadedImage) onImageUploaded?.(uploadedImage);
      onUploadSuccess(uploadedUrl);
    } catch (err: any) {
      console.error("Upload failed", err);
      setError(err.message || "Failed to upload image to MinIO");
    } finally {
      setUploading(false);
      busyRef.current = false;
      onBusyChange?.(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleRemove = () => {
    if (localPreview.current) { URL.revokeObjectURL(localPreview.current); localPreview.current = null; }
    setPreviewUrl(null);
    setPickedName(null);
    onFileSelected?.(null);
    onUploadSuccess("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={uploading}
            className="hidden"
            onChange={handleChange}
          />


      <label className="text-xs font-semibold text-foreground block">{label}</label>

      {previewUrl ? (
        <div className="relative rounded border border-border overflow-hidden group bg-background aspect-video flex items-center justify-center">
          <Image
            src={previewUrl}
            alt="Product Preview"
            fill
            sizes="(max-width: 640px) 90vw, 560px"
            className="object-contain"
          />
          <div className="absolute inset-0 flex items-end justify-center gap-2 bg-black/25 p-3 opacity-100 transition-opacity sm:items-center sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 bg-white text-foreground text-xs font-semibold rounded shadow-none hover:bg-secondary transition-colors"
            >
              Change Image
            </button>
            <button
              type="button"
              onClick={handleRemove}
              aria-label="Remove selected image"
              disabled={!!productId || uploading}
              className="p-1.5 bg-rose-500 text-white rounded shadow-none hover:bg-rose-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload product image"
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inputRef.current?.click(); } }}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-2 ${
            dragActive
              ? "border-primary bg-secondary/50 scale-[0.99]"
              : "border-border hover:border-primary bg-background/50"
          }`}
        >
          {uploading ? (
            <div className="flex flex-col items-center space-y-2 text-primary py-4">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xs font-semibold">Uploading image...</span>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-secondary text-primary flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-foreground">
                  Click to upload or drag & drop
                </p>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              </div>
            </>
          )}
        </div>
      )}

      {pickedName && !previewUrl && (
        <p className="flex items-center justify-between gap-2 rounded border border-border bg-background px-3 py-1.5 text-xs text-foreground">
          <span className="truncate">Selected: {pickedName}</span>
          <button type="button" onClick={handleRemove} aria-label={`Remove ${pickedName}`} className="font-semibold text-rose-600">Remove</button>
        </p>
      )}
      {error && <p role="alert" className="text-xs text-rose-500 font-medium">{error}</p>}
      {uploading && previewUrl && <p role="status" className="text-xs text-primary">Uploading image...</p>}
    </div>
  );
}
