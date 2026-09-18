"use client";

import React, { Suspense } from "react";
import { CheckCircle2, ShoppingBag, ArrowRight, Package, Clock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderIdsStr = searchParams.get("order_ids") || "";
  const orderIds = orderIdsStr ? orderIdsStr.split(",") : [];

  return (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-3xl border border-slate-200/80 shadow-xl text-center space-y-6">
      <div className="w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
        <CheckCircle2 className="w-10 h-10" />
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Order Placed Successfully!</h1>
        <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
          Thank you for shopping with LuxeStore. Your order has been confirmed and is being processed.
        </p>
      </div>

      {orderIds.length > 0 && (
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 text-xs text-slate-600 space-y-1">
          <span className="font-semibold text-slate-500">Order Reference IDs:</span>
          <div className="flex flex-wrap gap-1.5 justify-center pt-1 font-mono font-bold text-slate-900">
            {orderIds.map((id) => (
              <span key={id} className="bg-white px-2.5 py-1 rounded-lg border border-slate-200 shadow-xs">
                #{id}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-left text-xs">
        <div className="p-3.5 rounded-2xl bg-indigo-50/50 border border-indigo-100 flex items-center gap-2.5">
          <Clock className="w-4 h-4 text-indigo-600 flex-shrink-0" />
          <div>
            <span className="font-bold text-slate-900 block">Est. Delivery</span>
            <span className="text-[11px] text-slate-500">2 - 4 Business Days</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50/50 border border-emerald-100 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <div>
            <span className="font-bold text-slate-900 block">Status</span>
            <span className="text-[11px] text-emerald-700 font-semibold">Confirmed</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Link href="/store/orders" className="flex-1">
          <Button variant="outline" className="w-full h-11 rounded-xl text-xs font-semibold border-slate-200">
            <Package className="w-4 h-4 mr-1.5 text-slate-500" />
            View My Orders
          </Button>
        </Link>

        <Link href="/store" className="flex-1">
          <Button className="w-full h-11 rounded-xl text-xs font-semibold bg-primary hover:bg-indigo-600 text-white shadow-md shadow-indigo-100 flex items-center justify-center gap-1.5">
            <span>Continue Shopping</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/50">
      <Header currentUser={null} onShopNow={() => {}} />
      <main className="flex-1 flex items-center justify-center p-5 py-24">
        <Suspense fallback={<div className="text-center text-xs text-slate-500">Loading order status...</div>}>
          <OrderSuccessContent />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
