"use client";

import { apiGet } from "@/lib/api";
import { useEffect, useState } from "react";

interface Eligibility {
  eligible: boolean;
  reason?: string | null;
}

const REASONS: Record<string, string> = {
  disabled_by_admin: "Switched off for this product. Tick \"Offer virtual try-on\" and save to turn it back on.",
  category_unsupported: "This category has no try-on mapping. Use Tops, Outerwear, Bottoms or Dresses & skirts.",
  cloth_type_disabled: "This garment type is turned off on the server (VTON_CLOTH_TYPES).",
  garment_image_missing: "This product has no usable photo yet. Upload a PNG, JPG or WebP product photo below; shoppers try on the photo they select.",
};

/** Shows, for a saved product, whether shoppers will see the Try on button and what is missing if not. */
export function TryOnStatus({ productId, imageId, refreshKey }: { productId?: number; imageId?: string; refreshKey?: string | number }) {
  const [state, setState] = useState<Eligibility | "error" | null>(null);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setState(null);
    (async () => {
      try {
        const result = await apiGet<Eligibility>(
          `/vton/products/${productId}/eligibility${imageId ? `?image_id=${encodeURIComponent(imageId)}` : ""}`,
        );
        if (!cancelled) setState(result ?? "error");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [productId, imageId, refreshKey]);

  if (!productId) {
    return (
      <p className="text-xs text-muted-foreground">
        After saving, this panel shows whether shoppers will see the Try on button. A product photo is needed first.
      </p>
    );
  }
  if (state === null) return <p role="status" className="text-xs text-muted-foreground">Checking try-on status…</p>;
  if (state === "error") return <p className="text-xs text-muted-foreground">Try-on status is unavailable right now.</p>;
  if (state.eligible) {
    return (
      <p role="status" className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
        Try-on is live: shoppers see the Try on button for this product.
      </p>
    );
  }
  return (
    <p role="status" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
      Not offered yet. {REASONS[state.reason ?? ""] ?? "Check the category and garment image."}
    </p>
  );
}
