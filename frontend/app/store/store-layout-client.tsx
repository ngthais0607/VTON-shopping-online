"use client";

import React from "react";
import { CartProvider } from "./context/CartContext";
import { CartDrawer } from "./components/CartDrawer";

export function StoreLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      <div className="min-h-screen bg-slate-50/50">
        {children}
        <CartDrawer />
      </div>
    </CartProvider>
  );
}
