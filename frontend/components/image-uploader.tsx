"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, X, Image as ImageIcon, Loader2, CheckCircle2 } from "lucide-react";
import { apiUpload } from "@/lib/api";
import Image from "next/image";

interface ImageUploaderProps {
  productId?: number;
  currentImageUrl?: string;
  onUploadSuccess: (url: string) => void;
}

export function ImageUploader({ productId, currentImageUrl, onUploadSuccess }: ImageUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!file.type.startsWith("image/")) {
      setError("Please select a valid image file (PNG, JPG, WEBP)");
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // If productId exists, call API endpoint; else fallback to object URL preview
      let uploadedUrl = URL.createObjectURL(file);

      if (productId) {
        const response = await apiUpload<{ image?: { image_url: string } }>(
          `/products/${productId}/upload-image`,
          formData
        );
        if (response?.image?.image_url) {
          uploadedUrl = response.image.image_url;
        }
      }

      setPreviewUrl(uploadedUrl);
      onUploadSuccess(uploadedUrl);
    } catch (err: any) {
      console.error("Upload failed", err);
      setError(err.message || "Failed to upload image to MinIO");
    } finally {
      setUploading(false);
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
    setPreviewUrl(null);
    onUploadSuccess("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-semibold text-slate-700 block">Product Image (MinIO Storage)</label>

      {previewUrl ? (
        <div className="relative rounded-2xl border border-slate-200 overflow-hidden group bg-slate-50 aspect-video flex items-center justify-center">
          <Image
            src={previewUrl}
            alt="Product Preview"
            fill
            className="object-contain"
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-xs">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="px-3 py-1.5 bg-white text-slate-800 text-xs font-semibold rounded-lg shadow-sm hover:bg-slate-100 transition-colors"
            >
              Change Image
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-1.5 bg-rose-500 text-white rounded-lg shadow-sm hover:bg-rose-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-2 ${
            dragActive
              ? "border-indigo-500 bg-indigo-50/50 scale-[0.99]"
              : "border-slate-300 hover:border-indigo-400 bg-slate-50/50"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleChange}
          />

          {uploading ? (
            <div className="flex flex-col items-center space-y-2 text-indigo-600 py-4">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xs font-semibold">Uploading to MinIO...</span>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-slate-800">
                  Click to upload or drag & drop
                </p>
                <p className="text-[11px] text-slate-400">PNG, JPG, WEBP up to 10MB</p>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-rose-500 font-medium">{error}</p>}
    </div>
  );
}
