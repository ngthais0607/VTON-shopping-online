import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import React from "react";
import { CartProvider, useCart } from "../app/store/context/CartContext";
import { Product } from "@/lib/types";

const mockProduct: Product = {
  id: 101,
  name: "Pastel Blue Watch",
  price: 299,
  stock_quantity: 20,
  reserved_quantity: 0,
  sold_quantity: 0,
  is_active: true,
  currency: "USD",
  description: "Luxury watch"
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

describe("CartContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("should start with an empty cart", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.cartItems).toEqual([]);
    expect(result.current.totalAmount).toBe(0);
    expect(result.current.totalCount).toBe(0);
  });

  it("should add items to cart and calculate totals correctly", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addToCart(mockProduct, 2);
    });

    expect(result.current.cartItems.length).toBe(1);
    expect(result.current.cartItems[0].quantity).toBe(2);
    expect(result.current.totalAmount).toBe(598);
    expect(result.current.totalCount).toBe(2);
  });

  it("should update quantity and remove item when quantity is 0", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addToCart(mockProduct, 3);
    });

    act(() => {
      result.current.updateQuantity(mockProduct.id, 5);
    });
    expect(result.current.totalCount).toBe(5);

    act(() => {
      result.current.updateQuantity(mockProduct.id, 0);
    });
    expect(result.current.cartItems.length).toBe(0);
  });

  it("should clear cart items on clearCart()", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => {
      result.current.addToCart(mockProduct, 1);
    });
    expect(result.current.cartItems.length).toBe(1);

    act(() => {
      result.current.clearCart();
    });
    expect(result.current.cartItems.length).toBe(0);
  });
});
