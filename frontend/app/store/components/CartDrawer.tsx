"use client";
import { useCart } from "../context/CartContext";
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { StoreDialog } from "@/components/store/store-dialog";
import { formatCurrency } from "@/lib/utils";
import { getProductImageUrl } from "@/lib/placeholder-images";
export function CartDrawer() {
  const { cartItems, isCartOpen, setIsCartOpen, updateQuantity, removeFromCart, totalAmount, totalCount } = useCart();
  return <StoreDialog open={isCartOpen} onClose={() => setIsCartOpen(false)} title="Your bag" description={(totalCount || 0) + " items · Your everyday edit"} drawer>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
      {cartItems.length === 0 ? <div className="flex h-full min-h-60 flex-col items-center justify-center px-5 py-12 text-center"><ShoppingBag className="mb-6 h-9 w-9 text-primary" /><h3 className="text-xl font-semibold" style={{ fontFamily: "var(--font-display)" }}>A fresh start for your wardrobe.</h3><p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">Your bag is empty. Explore the collection and find something you love.</p><button onClick={() => setIsCartOpen(false)} className="mt-7 min-h-12 bg-primary px-6 text-sm text-primary-foreground">Keep exploring</button></div> : <div className="divide-y divide-border">{cartItems.map(({ product, quantity, variant, variantId }) => <div key={variantId} className="flex gap-4 py-5 first:pt-0">
        <Link href={"/store/products/" + (product.slug || product.id)} onClick={() => setIsCartOpen(false)} className="relative h-32 w-24 shrink-0 overflow-hidden bg-secondary"><Image src={variant?.image_url || getProductImageUrl(product)} alt={product.name} fill sizes="96px" className="object-cover" /></Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1"><Link href={"/store/products/" + (product.slug || product.id)} onClick={() => setIsCartOpen(false)} className="text-sm font-medium leading-6">{product.name}</Link><button aria-label={"Remove " + product.name} onClick={() => removeFromCart(variantId)} className="flex h-10 w-10 shrink-0 items-center justify-center text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></div>
          <p className="mt-1 text-xs text-muted-foreground">{[variant?.color_name, variant?.size && "Size " + variant.size].filter(Boolean).join(" / ")}</p>
          <p className="mt-2 text-sm font-semibold">{formatCurrency((variant?.price ?? product.price) * quantity, product.currency)}</p>
          <div className="mt-3 inline-flex items-center border border-border"><button aria-label={"Decrease quantity " + product.name} onClick={() => updateQuantity(variantId, quantity - 1)} className="flex h-9 w-9 items-center justify-center hover:bg-secondary"><Minus className="h-3 w-3" /></button><span className="w-8 text-center text-xs" aria-live="polite">{quantity}</span><button aria-label={"Increase quantity " + product.name} disabled={variant?.available_stock != null && quantity >= variant.available_stock} onClick={() => updateQuantity(variantId, quantity + 1)} className="flex h-9 w-9 items-center justify-center hover:bg-secondary disabled:opacity-30"><Plus className="h-3 w-3" /></button></div>
        </div>
      </div>)}</div>}
    </div>
    {cartItems.length > 0 && <div className="shrink-0 space-y-4 border-t border-border bg-secondary/50 p-5 sm:p-6"><div className="flex items-baseline justify-between gap-3"><span className="text-sm">Subtotal</span><span className="text-xl font-semibold">{formatCurrency(totalAmount)}</span></div><p className="text-xs leading-5 text-muted-foreground">Review delivery details and payment methods in the next step.</p><Link href="/store/checkout" onClick={() => setIsCartOpen(false)} className="flex min-h-12 items-center justify-between bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-foreground">Checkout <ArrowRight className="h-4 w-4" /></Link><button onClick={() => setIsCartOpen(false)} className="min-h-10 w-full text-xs underline underline-offset-4">Continue shopping</button></div>}
  </StoreDialog>;
}
