"use client";

import { useEffect, useMemo, useState } from "react";

import { getAvailableStock, isVariantInStock } from "@/lib/inventory";
import type { ProductVariant } from "@/lib/types";

export interface AvailableColor {
  name: string;
  hex: string | null;
  hasStock: boolean;
}

export interface AvailableSize {
  size: string;
  inStock: boolean;
  availableStock: number;
}

export interface UseVariantSelectionProps {
  variants?: ProductVariant[];
  defaultPrice: number;
  initialVariantId?: number;
}

export interface UseVariantSelectionReturn {
  selectedColor: string | null;
  selectedSize: string | null;
  selectedVariant: ProductVariant | null;
  availableColors: AvailableColor[];
  availableSizes: AvailableSize[];
  isOutOfStock: boolean;
  price: number;
  setColor: (color: string) => void;
  setSize: (size: string) => void;
  selectVariant: (variantId: number) => void;
}

export function useVariantSelection({
  variants = [],
  defaultPrice,
  initialVariantId,
}: UseVariantSelectionProps): UseVariantSelectionReturn {
  // Determine initial variant
  const initialVariant = useMemo(() => {
    if (initialVariantId) {
      const found = variants.find((v) => v.id === initialVariantId);
      if (found) return found;
    }
    const firstInStock = variants.find((v) => isVariantInStock(v));
    return firstInStock ?? variants[0] ?? null;
  }, [variants, initialVariantId]);

  const [selectedColor, setSelectedColor] = useState<string | null>(
    () => initialVariant?.color_name ?? null,
  );
  const [selectedSize, setSelectedSize] = useState<string | null>(
    () => initialVariant?.size ?? null,
  );

  useEffect(() => {
    if (
      variants.length > 0 &&
      (!selectedColor || !variants.some((v) => v.color_name === selectedColor))
    ) {
      const target = initialVariant ?? variants[0];
      if (target) {
        setSelectedColor(target.color_name);
        setSelectedSize(target.size);
      }
    }
  }, [variants, selectedColor, initialVariant]);

  // Available unique colors
  const availableColors = useMemo<AvailableColor[]>(() => {
    const map = new Map<string, { hex: string | null; hasStock: boolean }>();
    for (const v of variants) {
      const inStock = isVariantInStock(v);
      const existing = map.get(v.color_name);
      if (!existing) {
        map.set(v.color_name, {
          hex: v.color_hex,
          hasStock: inStock,
        });
      } else if (inStock && !existing.hasStock) {
        existing.hasStock = true;
      }
    }
    return Array.from(map.entries()).map(([name, info]) => ({
      name,
      hex: info.hex,
      hasStock: info.hasStock,
    }));
  }, [variants]);

  // Available sizes for currently selected color
  const availableSizes = useMemo<AvailableSize[]>(() => {
    if (!selectedColor) return [];
    const colorVariants = variants.filter((v) => v.color_name === selectedColor);
    return colorVariants.map((v) => ({
      size: v.size,
      inStock: isVariantInStock(v),
      availableStock: getAvailableStock(v),
    }));
  }, [variants, selectedColor]);

  // Active selected variant
  const selectedVariant = useMemo(() => {
    if (!selectedColor || !selectedSize) return null;
    return (
      variants.find(
        (v) => v.color_name === selectedColor && v.size === selectedSize,
      ) ?? null
    );
  }, [variants, selectedColor, selectedSize]);

  const isOutOfStock = useMemo(() => {
    if (!selectedVariant) return true;
    return !isVariantInStock(selectedVariant);
  }, [selectedVariant]);

  const price = useMemo(() => {
    if (selectedVariant && selectedVariant.price !== null) {
      return selectedVariant.price;
    }
    return defaultPrice;
  }, [selectedVariant, defaultPrice]);

  const setColor = (newColor: string) => {
    setSelectedColor(newColor);
    const colorVariants = variants.filter((v) => v.color_name === newColor);
    // Check if current selectedSize exists and has stock in new color
    const currentSizeVariant = colorVariants.find((v) => v.size === selectedSize);
    if (currentSizeVariant && isVariantInStock(currentSizeVariant)) {
      return;
    }
    // Otherwise select first in-stock size in new color
    const firstInStock = colorVariants.find((v) => isVariantInStock(v));
    if (firstInStock) {
      setSelectedSize(firstInStock.size);
    } else if (colorVariants.length > 0) {
      setSelectedSize(colorVariants[0].size);
    }
  };

  const setSize = (newSize: string) => {
    setSelectedSize(newSize);
  };

  const selectVariant = (variantId: number) => {
    const found = variants.find((v) => v.id === variantId);
    if (found) {
      setSelectedColor(found.color_name);
      setSelectedSize(found.size);
    }
  };

  return {
    selectedColor,
    selectedSize,
    selectedVariant,
    availableColors,
    availableSizes,
    isOutOfStock,
    price,
    setColor,
    setSize,
    selectVariant,
  };
}
