import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import React from "react";
import { SWRConfig } from "swr";
import { CartProvider, useCart } from "../app/store/context/CartContext";
import { Product } from "@/lib/types";
import { apiGet } from "@/lib/api";

// These tests cover cached products while live lookup returns no metadata.
vi.mock("@/lib/api", () => ({ apiGet: vi.fn().mockResolvedValue([]) }));

const mockProduct: Product = {
  id: 101,
  name: "Pastel Blue Watch",
  price: 299,
  stock_quantity: 20,
  reserved_quantity: 0,
  sold_quantity: 0,
  is_active: true,
  currency: "USD",
  description: "Luxury watch",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  category: null,
  images: [],
  variants: [
    {
      id: 1001,
      product_id: 101,
      sku: "WATCH-DEF",
      size: "ONE_SIZE",
      color_name: "Default",
      price: 299,
      stock_quantity: 20,
      reserved_quantity: 0,
      sold_quantity: 0,
      is_active: true,
    } as any,
  ],
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
    <CartProvider>{children}</CartProvider>
  </SWRConfig>
);

describe("CartContext", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(apiGet).mockClear();
  });

  it("should start with an empty cart", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.cartItems).toEqual([]);
    expect(result.current.totalAmount).toBe(0);
    expect(result.current.totalCount).toBe(0);
  });

  it("should add items to cart and calculate totals correctly", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    await act(async () => {
      result.current.addToCart(mockProduct, 2);
    });

    expect(result.current.cartItems.length).toBe(1);
    expect(result.current.cartItems[0].quantity).toBe(2);
    expect(result.current.totalAmount).toBe(598);
    expect(result.current.totalCount).toBe(2);
    await waitFor(() => expect(apiGet).toHaveBeenCalledExactlyOnceWith('/products/variants/lookup?ids=1001'));
    expect(result.current.totalAmount).toBe(598);
  });

  it("should update quantity and remove item when quantity is 0", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    await act(async () => {
      result.current.addToCart(mockProduct, 3);
    });

    act(() => {
      result.current.updateQuantity(1001, 5);
    });
    expect(result.current.totalCount).toBe(5);

    act(() => {
      result.current.updateQuantity(1001, 0);
    });
    expect(result.current.cartItems.length).toBe(0);
  });

  it("should clear cart items on clearCart()", async () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    await act(async () => {
      result.current.addToCart(mockProduct, 1);
    });
    expect(result.current.cartItems.length).toBe(1);

    act(() => {
      result.current.clearCart();
    });
    expect(result.current.cartItems.length).toBe(0);
  });
  it('ignores malformed persisted objects without crashing', () => {
    localStorage.setItem('fastapi_store_cart', JSON.stringify({items:'invalid'}));
    expect(()=>renderHook(()=>useCart(),{wrapper})).not.toThrow();
  });
  it('rejects fractional persisted quantities and inactive products', () => {
    localStorage.setItem('fastapi_store_cart', JSON.stringify([{product:mockProduct,quantity:1.5}]));
    const {result}=renderHook(()=>useCart(),{wrapper});
    expect(result.current.cartItems).toEqual([]);
    act(()=>result.current.addToCart({...mockProduct,is_active:false},1));
    expect(result.current.cartItems).toEqual([]);
  });
  it('bounds updates to available stock and ignores fractional additions',async()=>{
    const {result}=renderHook(()=>useCart(),{wrapper});
    act(()=>result.current.addToCart(mockProduct,1.5));
    expect(result.current.cartItems).toEqual([]);
    await act(async()=>{result.current.addToCart(mockProduct,1);});
    act(()=>result.current.updateQuantity(1001,99));
    expect(result.current.totalCount).toBe(20);
  });
});
