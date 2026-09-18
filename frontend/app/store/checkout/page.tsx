"use client";

import React, { useState, useEffect } from "react";
import { useCart } from "../context/CartContext";
import { apiPost, apiGet } from "@/lib/api";
import { checkoutSchema } from "@/lib/validations/checkout";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { VietQRModal, VietQRData } from "../components/VietQRModal";
import {
  ShoppingBag,
  CreditCard,
  Truck,
  QrCode,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
  MapPin,
  Phone,
  User as UserIcon,
  FileText,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User } from "@/lib/types";

export default function CheckoutPage() {
  const { cartItems, totalAmount, clearCart } = useCart();
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"vietqr" | "cod">("vietqr");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // VietQR Modal state
  const [vietqrModalOpen, setVietqrModalOpen] = useState(false);
  const [createdOrderIds, setCreatedOrderIds] = useState<number[]>([]);
  const [vietqrData, setVietqrData] = useState<VietQRData | null>(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const token = localStorage.getItem("token");
        if (token) {
          const user = await apiGet<User>("/users/me").catch(() => null);
          if (user) {
            setCurrentUser(user);
            setCustomerName(user.first_name || user.username || "");
          }
        }
      } catch (err) {
        console.error("Failed to load user info", err);
      }
    }
    loadUser();
  }, []);

  const shippingFee = totalAmount > 0 ? (totalAmount > 100 ? 0 : 15) : 0;
  const grandTotal = totalAmount + shippingFee;

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
    setSubmitting(true);

    try {
      const payload = {
        items: cartItems.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
        })),
        customer_name: customerName,
        customer_phone: customerPhone,
        shipping_address: shippingAddress,
        notes,
        payment_method: paymentMethod,
      };

      const response = await apiPost<{
        orders: { id: number }[];
        vietqr?: VietQRData;
      }>("/orders/checkout-cart", payload);

      const orderIds = response.orders.map((o) => o.id);
      setCreatedOrderIds(orderIds);

      // Clear cart from context
      clearCart();

      if (paymentMethod === "vietqr" && response.vietqr) {
        setVietqrData(response.vietqr);
        setVietqrModalOpen(true);
      } else {
        // COD order completed
        router.push(`/store/orders/success?order_ids=${orderIds.join(",")}`);
      }
    } catch (err: any) {
      console.error("Checkout error", err);
      setError(err.message || "Failed to complete checkout. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = () => {
    setVietqrModalOpen(false);
    router.push(`/store/orders/success?order_ids=${createdOrderIds.join(",")}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <Header currentUser={currentUser} onShopNow={() => router.push("/store")} />

      <main className="flex-1 max-w-7xl mx-auto px-5 lg:px-8 py-24 w-full">
        {/* Title */}
        <div className="mb-8 space-y-1">
          <div className="flex items-center gap-2 text-xs text-indigo-600 font-bold uppercase tracking-wider">
            <Link href="/store" className="hover:underline">Store</Link>
            <span>/</span>
            <span>Checkout</span>
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Complete Your Order</h1>
        </div>

        {cartItems.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 max-w-md mx-auto my-12 shadow-xs">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-400">
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Your Cart is Empty</h2>
            <p className="text-xs text-slate-500 mb-6">Explore our store and add products to proceed with checkout.</p>
            <Button
              onClick={() => router.push("/store")}
              className="bg-primary hover:bg-indigo-600 text-white rounded-xl px-6 font-semibold text-sm"
            >
              Explore Products
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Form Column */}
            <form onSubmit={handleCheckoutSubmit} className="lg:col-span-7 space-y-6">
              {/* Shipping Address Box */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base border-b border-slate-100 pb-3">
                  <MapPin className="w-5 h-5 text-indigo-600" />
                  <span>Shipping Information</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" /> Full Name
                    </label>
                    <Input
                      required
                      placeholder="John Doe"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="bg-slate-50/50 border-slate-200 text-xs h-10 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone Number
                    </label>
                    <Input
                      required
                      placeholder="+84 987 654 321"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="bg-slate-50/50 border-slate-200 text-xs h-10 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> Delivery Address
                  </label>
                  <Input
                    required
                    placeholder="123 Commerce St, District 1, Ho Chi Minh City"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="bg-slate-50/50 border-slate-200 text-xs h-10 rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" /> Delivery Notes (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Deliver during office hours..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Payment Methods Box */}
              <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center gap-2.5 text-slate-900 font-bold text-base border-b border-slate-100 pb-3">
                  <CreditCard className="w-5 h-5 text-indigo-600" />
                  <span>Payment Method</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* VietQR */}
                  <label
                    onClick={() => setPaymentMethod("vietqr")}
                    className={`p-4 rounded-2xl border flex items-center gap-3 cursor-pointer transition-all ${
                      paymentMethod === "vietqr"
                        ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-indigo-600 shadow-xs">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">VietQR Banking</h4>
                      <p className="text-[11px] text-slate-500">Scan QR Code instantly</p>
                    </div>
                  </label>

                  {/* COD */}
                  <label
                    onClick={() => setPaymentMethod("cod")}
                    className={`p-4 rounded-2xl border flex items-center gap-3 cursor-pointer transition-all ${
                      paymentMethod === "cod"
                        ? "border-indigo-600 bg-indigo-50/50 ring-2 ring-indigo-500/20"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-emerald-600 shadow-xs">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-xs">Cash on Delivery (COD)</h4>
                      <p className="text-[11px] text-slate-500">Pay upon delivery receipt</p>
                    </div>
                  </label>
                </div>
              </div>

              {error && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="w-full h-12 bg-primary hover:bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-all text-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Order...</span>
                  </>
                ) : (
                  <>
                    <span>Place Order · ${grandTotal.toLocaleString()}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            {/* Summary Column */}
            <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-6">
              <h3 className="font-bold text-slate-900 text-base border-b border-slate-100 pb-3">
                Order Summary ({cartItems.length} item{cartItems.length > 1 ? "s" : ""})
              </h3>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {cartItems.map(({ product, quantity }) => (
                  <div key={product.id} className="flex gap-3 items-center">
                    <div className="w-14 h-14 rounded-xl bg-slate-100 relative overflow-hidden flex-shrink-0 border border-slate-100">
                      {product.images?.[0]?.url || product.image_url ? (
                        <Image src={product.images?.[0]?.url || product.image_url || ""} alt={product.name} fill className="object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-slate-400">No Pic</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-slate-800 text-xs truncate">{product.name}</h4>
                      <p className="text-[11px] text-slate-400">Qty: {quantity}</p>
                    </div>
                    <span className="font-bold text-slate-900 text-xs">${(product.price * quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">${totalAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Shipping Fee</span>
                  <span className="font-semibold text-slate-900">
                    {shippingFee === 0 ? <span className="text-emerald-600 font-bold">Free</span> : `$${shippingFee}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-100">
                  <span>Total</span>
                  <span className="text-indigo-600 text-base">${grandTotal.toLocaleString()}</span>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center gap-2 text-[11px] text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <span>Encrypted 256-bit SSL transaction security</span>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />

      {/* VietQR Payment Modal */}
      {vietqrData && (
        <VietQRModal
          orderIds={createdOrderIds}
          vietqrData={vietqrData}
          isOpen={vietqrModalOpen}
          onClose={() => setVietqrModalOpen(false)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
