"use client";

import React from "react";
import { CartProvider } from "./context/CartContext";
import { CartDrawer } from "./components/CartDrawer";

export function StoreLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="min-h-screen bg-[#FAF8F5] text-[#1C1C1C]">
        {children}
        <CartDrawer />
      </div>
    </CartProvider>
  );
}
