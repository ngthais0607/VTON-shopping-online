"use client";

import React, { useState, useEffect, useRef } from "react";
import { useCart } from "../context/CartContext";
import { apiPost } from "@/lib/api";
import { checkoutSchema } from "@/lib/validations/checkout";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { VietQRModal, VietQRData } from "../components/VietQRModal";
import {
  ShoppingBag,
  CreditCard,
  Truck,
  QrCode,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckoutResponse, CheckoutCommand } from "@/lib/types";
import { useSession } from "@/hooks/use-session";
import { formatCurrency } from "@/lib/utils";

export default function CheckoutPage() {
  const { cartItems, totalAmount, clearCart, isLoaded } = useCart();
  const submissionPending = useRef(false);
  const router = useRouter();

  const { user: currentUser } = useSession();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"vietqr" | "cod">("cod");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // VietQR Modal state
  const [vietqrModalOpen, setVietqrModalOpen] = useState(false);
  const [createdOrderIds, setCreatedOrderIds] = useState<number[]>([]);
  const [createdOrderCodes, setCreatedOrderCodes] = useState<string[]>([]);
  const [vietqrData, setVietqrData] = useState<VietQRData | null>(null);

  useEffect(() => {
    if (currentUser) {
      setCustomerName(name => name || currentUser.first_name || currentUser.username || "");
    }
  }, [currentUser]);

  const shippingFee = 0;
  const grandTotal = totalAmount;

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || submissionPending.current) return;
    if (cartItems.length === 0) {
      setError("Your cart is empty. Please add items to checkout.");
      return;
    }

    const validation = checkoutSchema.safeParse({
      fullName: customerName,
      phone: customerPhone,
      address: shippingAddress,
      city: "Default City",
    });

    if (!validation.success) {
      setError(validation.error.issues[0]?.message || "Invalid input data");
      return;
    }

    setError(null);
    submissionPending.current = true;
    setSubmitting(true);

    try {
      const payload: CheckoutCommand = {
        items: cartItems.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
        customer_name: validation.data.fullName,
        customer_phone: validation.data.phone,
        shipping_address: validation.data.address,
        notes,
        payment_method: paymentMethod,
      };

      const response = await apiPost<CheckoutResponse>("/orders/checkout-cart", payload);

      const orderIds = response.orders.map((o) => o.id);
      const publicCodes = response.orders
        .map((o) => o.public_code)
        .filter((c): c is string => Boolean(c));
      setCreatedOrderIds(orderIds);
      setCreatedOrderCodes(publicCodes);

      // Clear cart from context
      clearCart();

      if (response.payment_method === "vietqr" && response.vietqr) {
        setVietqrData(response.vietqr);
        setVietqrModalOpen(true);
      } else {
        // COD order completed
        const parts: string[] = [];
        if (publicCodes.length) parts.push(`codes=${publicCodes.join(",")}`);
        if (orderIds.length) parts.push(`order_ids=${orderIds.join(",")}`);
        router.push(`/store/orders/success${parts.length ? `?${parts.join("&")}` : ""}`);
      }
    } catch (err: any) {

      setError(err.message || "Failed to complete checkout. Please try again.");
    } finally {
      submissionPending.current = false;
      setSubmitting(false);
    }
  };

  const handleContinue = () => {
    setVietqrModalOpen(false);
    const parts: string[] = [];
    if (createdOrderCodes.length) parts.push(`codes=${createdOrderCodes.join(",")}`);
    if (createdOrderIds.length) parts.push(`order_ids=${createdOrderIds.join(",")}`);
    router.push(`/store/orders/success${parts.length ? `?${parts.join("&")}` : ""}`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-[#1C1C1C]">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-20 pt-24 sm:px-8 lg:px-12 lg:pt-36">
        <ol aria-label="Checkout progress" className="mb-12 flex items-center justify-center gap-4 border-b border-border pb-8 text-[10px] uppercase tracking-[0.16em] sm:gap-10">
          <li><a href="#shipping">01 · Shipping</a></li><li aria-hidden="true" className="h-px w-6 bg-border sm:w-16" /><li><a href="#payment" className="text-muted-foreground">02 · Payment</a></li><li aria-hidden="true" className="h-px w-6 bg-border sm:w-16" /><li><a href="#review" className="text-muted-foreground">03 · Review</a></li>
        </ol>
        <div className="mb-10 border-b border-[#E8E3DB] pb-10">
          <nav aria-label="Breadcrumb" className="mb-7 flex items-center gap-2 text-xs text-[#6B6761]"><Link href="/store" className="hover:text-[#1C1C1C]">Store</Link><span aria-hidden="true">/</span><span>Checkout</span></nav>
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <h1 className="text-4xl font-medium leading-[1.04] tracking-[-0.045em] sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>Complete<br className="hidden sm:block" /> your order.</h1>
            <p className="max-w-sm text-sm leading-7 text-[#6B6761]">One more step to make it yours.<br />Check your details and choose a payment method.</p>
          </div>
        </div>
        {!isLoaded ? <div role="status" className="flex min-h-64 items-center justify-center gap-3 border border-[#E8E3DB] bg-white p-8 text-sm text-[#6B6761]"><Loader2 className="h-5 w-5 animate-spin text-[#1C1C1C]" />Loading cart...</div> : cartItems.length === 0 ? (
          <div className="mx-auto my-8 max-w-xl border border-[#E8E3DB] bg-white px-6 py-16 text-center">
            <ShoppingBag className="mx-auto mb-6 h-9 w-9 text-[#1C1C1C]" />
            <h2 className="text-3xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Your bag is empty.</h2>
            <p className="mx-auto mb-7 mt-3 max-w-xs text-sm leading-6 text-[#6B6761]">Explore the store and add an item before checking out.</p>
            <Button onClick={() => router.push("/store")} className="min-h-12 rounded-none bg-[#1C1C1C] px-6 text-sm font-medium text-white hover:bg-[#1C1C1C]">Explore products <ArrowRight className="ml-3 h-4 w-4" /></Button>
          </div>
        ) : (
          <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)] lg:gap-10">
            <form onSubmit={handleCheckoutSubmit} className="min-w-0 space-y-6">
              <section id="shipping" className="scroll-mt-28 border border-[#E8E3DB] bg-white p-5 sm:p-8">
                <div className="mb-7 flex items-center gap-4 border-b border-[#E8E3DB] pb-5">
                  <span className="font-mono text-xs text-[#1C1C1C]">01</span>
                  <h2 className="text-xl font-medium tracking-tight sm:text-2xl" style={{ fontFamily: "var(--font-display)" }}>Delivery details</h2>
                  <MapPin className="ml-auto h-4 w-4 text-[#6B6761]" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2"><label htmlFor="checkout-name" className="text-xs font-medium">Full name</label><Input id="checkout-name" name="name" autoComplete="name" required placeholder="John Doe" value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-12 rounded-none border-[#E8E3DB] bg-[#FAF8F5]/50 text-sm" /></div>
                  <div className="space-y-2"><label htmlFor="checkout-phone" className="text-xs font-medium">Phone number</label><Input id="checkout-phone" name="tel" type="tel" autoComplete="tel" required placeholder="+84 987 654 321" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="h-12 rounded-none border-[#E8E3DB] bg-[#FAF8F5]/50 text-sm" /></div>
                  <div className="space-y-2 sm:col-span-2"><label htmlFor="checkout-address" className="text-xs font-medium">Delivery address</label><Input id="checkout-address" name="street-address" autoComplete="street-address" required placeholder="123 Commerce St, District 1, Ho Chi Minh City" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} className="h-12 rounded-none border-[#E8E3DB] bg-[#FAF8F5]/50 text-sm" /></div>
                  <div className="space-y-2 sm:col-span-2"><label htmlFor="checkout-notes" className="text-xs font-medium">Notes <span className="font-normal text-[#6B6761]">(optional)</span></label><textarea id="checkout-notes" rows={3} placeholder="Deliver during office hours..." value={notes} onChange={e => setNotes(e.target.value)} className="w-full resize-y border border-[#E8E3DB] bg-[#FAF8F5]/50 p-3 text-sm outline-none focus:border-[#1C1C1C] focus:ring-2 focus:ring-[#1C1C1C]/15" /></div>
                </div>
              </section>
              <fieldset id="payment" className="min-w-0 scroll-mt-28 border border-[#E8E3DB] bg-white p-5 sm:p-8">
                <legend className="sr-only">Payment method</legend>
                <div className="mb-6 flex items-center gap-4 border-b border-[#E8E3DB] pb-5"><span className="font-mono text-xs text-[#1C1C1C]">02</span><h2 className="text-xl font-medium tracking-tight sm:text-2xl" style={{ fontFamily: "var(--font-display)" }}>Payment method</h2><CreditCard className="ml-auto h-4 w-4 text-[#6B6761]" /></div>
                <div className="space-y-3">
                  <label className={"flex min-h-24 cursor-pointer items-center gap-4 border p-4 transition-colors " + (paymentMethod === "cod" ? "border-[#1C1C1C] bg-[#F1ECE4]" : "border-[#E8E3DB] hover:border-[#1C1C1C]")}>
                    <input type="radio" name="paymentMethod" value="cod" checked={paymentMethod === "cod"} onChange={() => setPaymentMethod("cod")} className="h-4 w-4 shrink-0 accent-[#1C1C1C]" />
                    <Truck className="h-5 w-5 shrink-0 text-[#1C1C1C]" />
                    <span><span className="block text-sm font-medium">Cash on Delivery (COD)</span><span className="mt-1 block text-xs leading-5 text-[#6B6761]">Pay when your order arrives.</span></span>
                  </label>
                  <label className={"flex min-h-24 cursor-pointer items-center gap-4 border p-4 transition-colors " + (paymentMethod === "vietqr" ? "border-[#1C1C1C] bg-[#F1ECE4]" : "border-[#E8E3DB] hover:border-[#1C1C1C]")}>
                    <input type="radio" name="paymentMethod" value="vietqr" checked={paymentMethod === "vietqr"} onChange={() => setPaymentMethod("vietqr")} className="h-4 w-4 shrink-0 accent-[#1C1C1C]" />
                    <QrCode className="h-5 w-5 shrink-0 text-[#1C1C1C]" />
                    <span><span className="block text-sm font-medium">VietQR Banking</span><span className="mt-1 block text-xs leading-5 text-[#6B6761]">Scan the code after placing your order. An administrator checks the transfer before confirming payment.</span></span>
                  </label>
                </div>
              </fieldset>
              {error && <div role="alert" className="border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">{error}</div>}
              <Button type="submit" disabled={submitting} className="flex min-h-14 w-full items-center justify-between gap-3 rounded-none bg-[#1C1C1C] px-5 py-4 text-sm font-medium text-white hover:bg-[#1C1C1C] disabled:opacity-60">
                {submitting ? <><span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Processing Order...</span></> : <><span className="min-w-0 whitespace-normal text-left">Place Order · {formatCurrency(grandTotal)}</span><ArrowRight className="h-4 w-4 shrink-0" /></>}
              </Button>
              <p className="text-center text-xs leading-6 text-[#6B6761]">By placing your order, you confirm that these details are correct. <Link href="/store/terms" className="text-[#1C1C1C] underline underline-offset-4">Terms of use</Link></p>
            </form>
            <aside id="review" aria-label="Order summary" className="min-w-0 scroll-mt-28 border border-[#E8E3DB] bg-white lg:sticky lg:top-28">
              <div className="flex items-start justify-between gap-4 border-b border-[#E8E3DB] p-5 sm:p-7"><div><p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#1C1C1C]">Your selections</p><h2 className="text-2xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Order summary</h2></div><span className="pt-1 font-mono text-xs text-[#6B6761]">{cartItems.length.toString().padStart(2, "0")}</span></div>
              <div className="max-h-[440px] space-y-5 overflow-y-auto p-5 sm:p-7">
                {cartItems.map(({ product, quantity, variant, variantId }) => <div key={variantId || product.id} className="flex items-start gap-4">
                  <div className="relative h-24 w-20 shrink-0 overflow-hidden bg-[#F0F0E8]">
                    {variant?.image_url || product.images?.[0]?.url || product.image_url ? <Image src={variant?.image_url || product.images?.[0]?.url || product.image_url || ""} alt={product.name} fill sizes="80px" className="object-cover" /> : <div className="flex h-full items-center justify-center"><ShoppingBag aria-label="No product image available" className="h-6 w-6 text-[#6B6761]" /></div>}
                  </div>
                  <div className="min-w-0 flex-1"><h3 className="text-sm font-medium leading-5">{product.name}</h3>{(variant?.size || variant?.color_name) && <p className="mt-1 text-xs leading-5 text-[#6B6761]">{[variant.size && "Size " + variant.size, variant.color_name && "Color " + variant.color_name].filter(Boolean).join(" · ")}</p>}{variant?.sku && <p className="mt-0.5 break-all font-mono text-[10px] text-[#6B6761]">SKU: {variant.sku}</p>}<div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-[#6B6761]">Quantity: {quantity}</span><span className="font-semibold">{formatCurrency((variant?.price ?? product.price) * quantity, product.currency)}</span></div></div>
                </div>)}
              </div>
              <div className="space-y-4 border-t border-[#E8E3DB] p-5 text-sm sm:p-7">
                <div className="flex flex-wrap justify-between gap-3 text-[#6B6761]"><span>Subtotal</span><span className="text-[#1C1C1C]">{formatCurrency(totalAmount)}</span></div>
                <div className="flex flex-wrap justify-between gap-3 text-[#6B6761]"><span>Shipping</span><span className="text-[#1C1C1C]">{formatCurrency(shippingFee)}</span></div>
                <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[#E8E3DB] pt-5"><span className="font-medium">Total</span><strong className="text-2xl font-semibold tracking-tight">{formatCurrency(grandTotal)}</strong></div>
              </div>
              <div className="flex items-start gap-3 border-t border-[#E8E3DB] bg-[#F1ECE4] p-5 text-xs leading-6 text-[#1C1C1C] sm:px-7"><ShieldCheck className="mt-1 h-4 w-4 shrink-0" /><p>Your order is created after confirmation. Payment status appears separately in your order details.</p></div>
            </aside>
          </div>
        )}
      </main>
      <Footer />
      {vietqrData && <VietQRModal vietqrData={vietqrData} isOpen={vietqrModalOpen} onClose={() => setVietqrModalOpen(false)} onContinue={handleContinue} />}
    </div>
  );
}
