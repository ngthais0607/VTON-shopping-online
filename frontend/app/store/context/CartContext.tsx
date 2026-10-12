"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { Product } from "@/lib/types";
import { getAvailableStock } from '@/lib/inventory';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartContextType {
  isLoaded: boolean;
  cartItems: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  totalAmount: number;
  totalCount: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = "fastapi_store_cart";

function restoreCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const items: CartItem[] = [];
  for (const item of value) {
    const p = item?.product;
    if (!p || !Number.isInteger(p.id) || p.id <= 0 || typeof p.name !== 'string' ||
        !Number.isFinite(p.price) || p.price <= 0 || typeof p.currency !== 'string' ||
        !Array.isArray(p.images) || !p.is_active ||
        ![p.stock_quantity,p.reserved_quantity,p.sold_quantity].every(n=>Number.isInteger(n) && n >= 0) ||
        !Number.isInteger(item.quantity) || item.quantity <= 0) continue;
    const quantity = Math.min(item.quantity, getAvailableStock(p));
    if (quantity > 0 && !items.some(existing=>existing.product.id === p.id)) items.push({product:p,quantity});
  }
  return items;
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cart from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        setCartItems(restoreCart(JSON.parse(saved)));
      }
    } catch (e) {
      console.error("Failed to load cart from localStorage", e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save cart to localStorage on change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
      } catch (e) {
        console.error("Failed to save cart to localStorage", e);
      }
    }
  }, [cartItems, isLoaded]);

  const addToCart = (product: Product, quantity: number = 1) => {
    if (!Number.isInteger(quantity) || quantity <= 0 || !product.is_active || getAvailableStock(product) <= 0) return;
    setCartItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = { product, quantity: Math.min(updated[existingIndex].quantity + quantity, getAvailableStock(product)) };
        return updated;
      }
      return [...prev, { product, quantity: Math.min(quantity, getAvailableStock(product)) }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: number) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: Math.min(quantity, getAvailableStock(item.product)) } : item
      )
    );
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const totalAmount = cartItems.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );

  const totalCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        isLoaded,
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        totalAmount,
        totalCount,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
