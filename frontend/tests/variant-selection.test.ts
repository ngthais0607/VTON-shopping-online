import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useVariantSelection } from "@/hooks/use-variant-selection";
import type { ProductVariant } from "@/lib/types";

const mockVariants: ProductVariant[] = [
  {
    id: 1,
    product_id: 10,
    sku: "SHIRT-RED-S",
    size: "S",
    color_name: "Red",
    color_hex: "#FF0000",
    price: 150000,
    stock_quantity: 10,
    reserved_quantity: 2,
    sold_quantity: 3,
    available_stock: 5,
    is_active: true,
  },
  {
    id: 2,
    product_id: 10,
    sku: "SHIRT-RED-M",
    size: "M",
    color_name: "Red",
    color_hex: "#FF0000",
    price: null,
    stock_quantity: 5,
    reserved_quantity: 5,
    sold_quantity: 0,
    available_stock: 0,
    is_active: true,
  },
  {
    id: 3,
    product_id: 10,
    sku: "SHIRT-BLUE-S",
    size: "S",
    color_name: "Blue",
    color_hex: "#0000FF",
    price: 160000,
    stock_quantity: 4,
    reserved_quantity: 4,
    sold_quantity: 0,
    available_stock: 0,
    is_active: true,
  },
  {
    id: 4,
    product_id: 10,
    sku: "SHIRT-BLUE-M",
    size: "M",
    color_name: "Blue",
    color_hex: "#0000FF",
    price: 160000,
    stock_quantity: 8,
    reserved_quantity: 1,
    sold_quantity: 2,
    available_stock: 5,
    is_active: true,
  },
];

describe("useVariantSelection", () => {
  it("initializes with first in-stock variant by default", () => {
    const { result } = renderHook(() =>
      useVariantSelection({
        variants: mockVariants,
        defaultPrice: 140000,
      }),
    );

    expect(result.current.selectedColor).toBe("Red");
    expect(result.current.selectedSize).toBe("S");
    expect(result.current.selectedVariant?.id).toBe(1);
    expect(result.current.price).toBe(150000);
    expect(result.current.isOutOfStock).toBe(false);
  });

  it("lists available colors with in-stock indicators", () => {
    const { result } = renderHook(() =>
      useVariantSelection({
        variants: mockVariants,
        defaultPrice: 140000,
      }),
    );

    expect(result.current.availableColors).toEqual([
      { name: "Red", hex: "#FF0000", hasStock: true },
      { name: "Blue", hex: "#0000FF", hasStock: true },
    ]);
  });

  it("lists available sizes for the active color with individual stock status", () => {
    const { result } = renderHook(() =>
      useVariantSelection({
        variants: mockVariants,
        defaultPrice: 140000,
      }),
    );

    // Active color is Red: S has stock (5), M is out of stock (0)
    expect(result.current.availableSizes).toEqual([
      { size: "S", inStock: true, availableStock: 5 },
      { size: "M", inStock: false, availableStock: 0 },
    ]);
  });

  it("updates selected size and falls back to default price when variant price is null", () => {
    const { result } = renderHook(() =>
      useVariantSelection({
        variants: mockVariants,
        defaultPrice: 140000,
      }),
    );

    act(() => {
      result.current.setSize("M");
    });

    expect(result.current.selectedSize).toBe("M");
    expect(result.current.selectedVariant?.id).toBe(2);
    expect(result.current.price).toBe(140000);
    expect(result.current.isOutOfStock).toBe(true);
  });

  it("switches color and auto-selects an in-stock size if previous size is out of stock", () => {
    const { result } = renderHook(() =>
      useVariantSelection({
        variants: mockVariants,
        defaultPrice: 140000,
      }),
    );

    // Red-S is currently selected. Blue-S is out of stock, but Blue-M has stock.
    act(() => {
      result.current.setColor("Blue");
    });

    expect(result.current.selectedColor).toBe("Blue");
    // Blue-M has stock, Blue-S does not
    expect(result.current.selectedSize).toBe("M");
    expect(result.current.selectedVariant?.id).toBe(4);
    expect(result.current.price).toBe(160000);
    expect(result.current.isOutOfStock).toBe(false);
  });

  it("allows selecting a variant directly by ID", () => {
    const { result } = renderHook(() =>
      useVariantSelection({
        variants: mockVariants,
        defaultPrice: 140000,
      }),
    );

    act(() => {
      result.current.selectVariant(4);
    });

    expect(result.current.selectedColor).toBe("Blue");
    expect(result.current.selectedSize).toBe("M");
    expect(result.current.selectedVariant?.id).toBe(4);
  });
});
