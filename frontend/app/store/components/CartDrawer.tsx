"use client";

import React from "react";
import { useCart } from "../context/CartContext";
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "motion/react";

export function CartDrawer() {
  const { cartItems, isCartOpen, setIsCartOpen, updateQuantity, removeFromCart, totalAmount, totalCount } = useCart();

  const shippingFee = totalAmount > 0 ? (totalAmount > 100 ? 0 : 15) : 0;
  const finalTotal = totalAmount + shippingFee;

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsCartOpen(false)}
            className="fixed inset-0 bg-black z-50 backdrop-blur-xs"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200"
          >
            {/* Header */}
            <div className="p-5 border-b border-sky-100 flex items-center justify-between bg-sky-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center font-bold">
                  <ShoppingBag className="w-4 h-4 text-sky-600" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-lg leading-none">Your Cart</h2>
                  <p className="text-xs text-slate-500 mt-1">{totalCount} item{totalCount !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-2 rounded-full hover:bg-slate-200/60 text-slate-500 hover:text-slate-900 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {cartItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-16 h-16 rounded-full bg-sky-50 flex items-center justify-center mb-4 text-sky-500">
                    <ShoppingBag className="w-8 h-8" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-700">Your cart is empty</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Explore our collection and add your favorite items to your cart.
                  </p>
                  <Button
                    onClick={() => setIsCartOpen(false)}
                    className="mt-6 bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white font-medium text-sm rounded-xl px-6 shadow-md shadow-sky-500/20"
                  >
                    Start Shopping
                  </Button>
                </div>
              ) : (
                cartItems.map(({ product, quantity }) => (
                  <div
                    key={product.id}
                    className="flex gap-4 p-3 rounded-2xl border border-sky-100 hover:border-sky-200 transition-all bg-white shadow-xs"
                  >
                    {/* Image */}
                    <div className="w-20 h-20 rounded-xl bg-slate-100 relative overflow-hidden flex-shrink-0 border border-slate-100">
                      {product.images?.[0]?.url || product.image_url ? (
                        <Image
                          src={product.images?.[0]?.url || product.image_url || ""}
                          alt={product.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-semibold">
                          No Pic
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="font-semibold text-slate-900 text-sm line-clamp-1">{product.name}</h4>
                          <button
                            onClick={() => removeFromCart(product.id)}
                            className="text-slate-400 hover:text-rose-500 transition-colors p-0.5"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{product.category?.name || "Product"}</p>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <span className="font-bold text-slate-900 text-sm">
                          ${(product.price * quantity).toLocaleString()}
                        </span>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-1 bg-sky-50/80 rounded-lg p-1 border border-sky-100">
                          <button
                            onClick={() => updateQuantity(product.id, quantity - 1)}
                            className="w-5 h-5 rounded-md bg-white flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-xs"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-bold text-slate-800">{quantity}</span>
                          <button
                            onClick={() => updateQuantity(product.id, quantity + 1)}
                            className="w-5 h-5 rounded-md bg-white flex items-center justify-center text-slate-600 hover:text-slate-900 shadow-xs"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer Summary & Checkout */}
            {cartItems.length > 0 && (
              <div className="p-5 border-t border-sky-100 bg-sky-50/30 space-y-3">
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span className="font-semibold text-slate-900">${totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated Shipping</span>
                    <span className="font-semibold text-slate-900">
                      {shippingFee === 0 ? <span className="text-emerald-600 font-bold">Free</span> : `$${shippingFee}`}
                    </span>
                  </div>
                  {shippingFee > 0 && (
                    <p className="text-[11px] text-sky-600 font-medium">
                      Add ${(100 - totalAmount).toFixed(0)} more for Free Shipping!
                    </p>
                  )}
                  <div className="border-t border-sky-100 pt-2 flex justify-between text-sm font-bold text-slate-900">
                    <span>Total</span>
                    <span className="text-sky-600 text-base">${finalTotal.toLocaleString()}</span>
                  </div>
                </div>

                <Link href="/store" onClick={() => setIsCartOpen(false)} className="block w-full">
                  <Button className="w-full h-11 bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md shadow-sky-500/25 active:scale-[0.98] transition-all">
                    <span>Checkout</span>
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
