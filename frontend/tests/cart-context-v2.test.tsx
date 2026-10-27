import React from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";

import { CartProvider, useCart } from "@/app/store/context/CartContext";
import type { VariantLookupItem } from "@/lib/types";

const mockVariantItem: VariantLookupItem = {
  id: 101,
  product_id: 1,
  product_name: "Áo Thun Classic TrueLook",
  product_slug: "ao-thun-classic-truelook",
  sku: "TL-AO-DEN-M",
  size: "M",
  color_name: "Đen",
  color_hex: "#000000",
  price: 250000,
  stock_quantity: 15,
  reserved_quantity: 2,
  sold_quantity: 3,
  available_stock: 10,
  is_active: true,
  image_url: "https://example.com/ao-den.jpg",
};

const mockVariantItem2: VariantLookupItem = {
  id: 102,
  product_id: 1,
  product_name: "Áo Thun Classic TrueLook",
  product_slug: "ao-thun-classic-truelook",
  sku: "TL-AO-TRANG-L",
  size: "L",
  color_name: "Trắng",
  color_hex: "#FFFFFF",
  price: 260000,
  stock_quantity: 8,
  reserved_quantity: 0,
  sold_quantity: 0,
  available_stock: 8,
  is_active: true,
  image_url: "https://example.com/ao-trang.jpg",
};

let swrMockData: VariantLookupItem[] = [mockVariantItem, mockVariantItem2];

vi.mock("swr", () => ({
  default: (key: string | null) => {
    if (!key) return { data: undefined, error: undefined, isLoading: false };
    return {
      data: swrMockData,
      error: undefined,
      isLoading: false,
    };
  },
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

describe("CartContext V2 (truelook_cart_v2)", () => {
  beforeEach(() => {
    localStorage.clear();
    swrMockData = [mockVariantItem, mockVariantItem2];
  });

  it("starts empty and ignores deprecated 'fastapi_store_cart' localStorage key", () => {
    localStorage.setItem(
      "fastapi_store_cart",
      JSON.stringify([{ product: { id: 99, name: "Old Item" }, quantity: 1 }])
    );

    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.cartItems).toEqual([]);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.totalAmount).toBe(0);
  });

  it("adds variant to cart and stores under 'truelook_cart_v2'", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addToCart(
        {
          id: 1,
          name: "Áo Thun Classic TrueLook",
          price: 250000,
          variants: [{ id: 101, sku: "TL-AO-DEN-M", is_active: true } as any],
        } as any,
        2,
        101
      );
    });

    const stored = JSON.parse(localStorage.getItem("truelook_cart_v2") || "[]");
    expect(stored).toEqual([{ variantId: 101, productId: 1, quantity: 2 }]);
    expect(result.current.totalCount).toBe(2);
    expect(result.current.totalAmount).toBe(500000);
  });

  it("combines quantities when adding the same variant multiple times", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addToCart({ id: 1, variants: [{ id: 101 }] } as any, 2, 101);
    });

    act(() => {
      result.current.addToCart({ id: 1, variants: [{ id: 101 }] } as any, 3, 101);
    });

    const stored = JSON.parse(localStorage.getItem("truelook_cart_v2") || "[]");
    expect(stored).toEqual([{ variantId: 101, productId: 1, quantity: 5 }]);
    expect(result.current.totalCount).toBe(5);
  });

  it("enriches items with live variant data including size, color, sku", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addToCart({ id: 1, variants: [{ id: 101 }] } as any, 1, 101);
    });

    const item = result.current.cartItems[0];
    expect(item).toBeDefined();
    expect(item.variantId).toBe(101);
    expect(item.variant?.sku).toBe("TL-AO-DEN-M");
    expect(item.variant?.size).toBe("M");
    expect(item.variant?.color_name).toBe("Đen");
  });

  it("updates quantity and removes item when quantity reaches 0", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addToCart({ id: 1, variants: [{ id: 101 }] } as any, 2, 101);
    });

    act(() => {
      result.current.updateQuantity(101, 4);
    });
    expect(result.current.totalCount).toBe(4);

    act(() => {
      result.current.updateQuantity(101, 0);
    });
    expect(result.current.cartItems).toHaveLength(0);
    expect(result.current.totalCount).toBe(0);
  });

  it("bounds quantity to available stock from live variant lookup", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      // available_stock for 101 is 10
      result.current.addToCart({ id: 1, variants: [{ id: 101 }] } as any, 1, 101);
    });

    act(() => {
      result.current.updateQuantity(101, 99);
    });

    expect(result.current.cartItems[0].quantity).toBe(10);
    expect(result.current.totalCount).toBe(10);
  });

  it("clears cart completely on clearCart()", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addToCart({ id: 1, variants: [{ id: 101 }] } as any, 1, 101);
    });

    act(() => {
      result.current.clearCart();
    });

    expect(result.current.cartItems).toHaveLength(0);
    expect(localStorage.getItem("truelook_cart_v2")).toBe("[]");
  });

  it("strictly removes and updates by variantId without colliding with productId", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      // Item 1: variantId 1, productId 101
      result.current.addToCart({ id: 101, variants: [{ id: 1, is_active: true }] } as any, 2, 1);
      // Item 2: variantId 101, productId 2
      result.current.addToCart({ id: 2, variants: [{ id: 101, is_active: true }] } as any, 3, 101);
    });

    expect(result.current.cartItems).toHaveLength(2);

    // Removing variantId 1 must NOT remove item 2 even though item 2 has productId: 2 and item 1 has productId: 101
    act(() => {
      result.current.removeFromCart(1);
    });

    expect(result.current.cartItems).toHaveLength(1);
    expect(result.current.cartItems[0].variantId).toBe(101);

    // Updating variantId 101 must only update item 2
    act(() => {
      result.current.updateQuantity(101, 5);
    });
    expect(result.current.cartItems[0].quantity).toBe(5);
  });

  it("auto-selects variant when product has a single active variant", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addToCart({
        id: 99,
        name: "Single Variant Item",
        price: 150000,
        variants: [{ id: 555, is_active: true }],
      } as any, 1);
    });

    expect(result.current.cartItems).toHaveLength(1);
    expect(result.current.cartItems[0].variantId).toBe(555);
    expect(result.current.cartItems[0].productId).toBe(99);
  });
});
