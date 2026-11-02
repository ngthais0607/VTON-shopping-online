"use client";

import { apiGet } from '@/lib/api';
import { Order } from '@/lib/types';
import { formatCurrency } from "@/lib/utils";
import { ArrowRight,CheckCircle2,Package } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import useSWR from 'swr';
import { Footer } from "../../components/Footer";
import { Header } from "../../components/Header";

function OrderSuccessContent() {
  const searchParams = useSearchParams();
  const orderIdsStr = searchParams.get("order_ids") || "";
  const codesStr = searchParams.get("codes") || "";
  const publicCodes = codesStr ? codesStr.split(",").filter(Boolean) : [];
  const orderIds = orderIdsStr ? Array.from(new Set(orderIdsStr.split(",").filter(id => /^[1-9]\d*$/.test(id)))) : [];
  const {data: orders, error, isLoading, mutate} = useSWR<Order[]>(orderIds.length ? ['checkout-orders', orderIds.join(',')] : null,
    () => Promise.all(orderIds.map(id => apiGet<Order>(`/orders/${id}`))), {shouldRetryOnError:false});
  const totals = orders?.reduce<Record<string, number>>((result, order) => {
    result[order.currency] = (result[order.currency] ?? 0) + order.total_amount;
    return result;
  }, {});

  return (
    <div className="grid w-full max-w-5xl border border-[#E8E3DB] bg-white lg:grid-cols-[0.8fr_1.2fr]">
      <div className="flex flex-col justify-between gap-8 border-b border-[#E8E3DB] bg-[#F1ECE4] p-7 sm:p-10 lg:border-b-0 lg:border-r">
        <div><p className="mb-10 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C1C1C]">TrueLook / Orders</p><CheckCircle2 className="mb-6 h-11 w-11 stroke-1 text-[#1C1C1C]" /><h1 className="text-4xl font-medium leading-[1.05] tracking-[-0.045em] sm:text-5xl" style={{ fontFamily: "var(--font-display)" }}>Thank you for<br />choosing us.</h1></div>
        <p className="max-w-xs text-sm leading-7 text-[#6B6761]">Your order has been placed. Open each order to check its payment and processing status.</p>
      </div>
      <div className="min-w-0 space-y-7 p-7 sm:p-10">
        <div className="border-b border-[#E8E3DB] pb-6"><p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-[#1C1C1C]">Order Placed Successfully!</p><h2 className="text-2xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Order details</h2></div>
        {publicCodes.length > 0 ? (
          <div><p className="mb-3 text-xs text-[#6B6761]">Order tracking code</p><div className="flex flex-col gap-2">{publicCodes.map(code => <Link href={"/store/orders/" + encodeURIComponent(code)} key={code} className="flex min-h-12 items-center justify-between gap-4 border border-[#E8E3DB] px-4 py-3 hover:border-[#1C1C1C]"><span className="break-all font-mono text-xs">#{code}</span><ArrowRight className="h-4 w-4 shrink-0 text-[#1C1C1C]" /></Link>)}</div></div>
        ) : orderIds.length > 0 ? (
          <div><p className="mb-3 text-xs text-[#6B6761]">Order Reference IDs</p><div className="flex flex-wrap gap-2">{orderIds.map(id => <Link href={"/store/orders/" + id} key={id} className="inline-flex min-h-11 items-center border border-[#E8E3DB] px-4 font-mono text-xs hover:border-[#1C1C1C]">#{id}</Link>)}</div></div>
        ) : <p className="text-sm leading-7 text-[#6B6761]">Open your order history to view orders placed with your account.</p>}
        {isLoading && <p role="status" className="text-sm text-[#6B6761]">Loading committed order total...</p>}
        {error && <div role="alert" className="border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">Unable to load order total. <button onClick={() => mutate()} className="min-h-11 underline underline-offset-4">Retry</button></div>}
        {totals && <div className="flex flex-col justify-between gap-3 border-y border-[#E8E3DB] py-6 sm:flex-row"><span className="text-sm text-[#6B6761]">Committed order total</span><div className="space-y-1">{Object.entries(totals).map(([currency, total]) => <p key={currency} className="text-2xl font-semibold tracking-tight">{currency === "VND" ? formatCurrency(total, currency) : total.toFixed(2) + " " + currency}</p>)}</div></div>}
        <div className="flex items-start gap-3 bg-[#FAF8F5] p-4 text-xs leading-6 text-[#6B6761]"><Package className="mt-1 h-4 w-4 shrink-0 text-[#1C1C1C]" /><p>Placing an order does not confirm payment. Check your order details for COD and VietQR status.</p></div>
        <div className="flex flex-col gap-3">
          <Link href="/store/orders" className="flex min-h-12 items-center justify-between gap-4 bg-[#1C1C1C] px-5 text-sm font-medium text-white hover:bg-[#1C1C1C]">View My Orders <ArrowRight className="h-4 w-4" /></Link>
          <Link href="/store" className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-[#6B6761] underline underline-offset-4 hover:text-[#1C1C1C]">Continue Shopping</Link>
        </div>
      </div>
    </div>
  );
}

export default function OrderSuccessPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-[#1C1C1C]">
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-5 pb-20 pt-40 sm:px-8 lg:px-12 lg:pt-56">
        <Suspense fallback={<div role="status" className="py-16 text-center text-sm text-[#6B6761]">Loading order status...</div>}><OrderSuccessContent /></Suspense>
      </main>
      <Footer />
    </div>
  );
}
