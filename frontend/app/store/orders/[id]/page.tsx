"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiGet, ApiError } from "@/lib/api";
import { TrackingResponse } from "@/lib/types";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  Copy, 
  Check, 
  RefreshCw, 
  AlertCircle, 
  Package, 
  QrCode
} from "lucide-react";
import { displayDate, formatCurrency } from "@/lib/utils";

export default function OrderTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;
  const router = useRouter();

  const [order, setOrder] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  const fetchTrackingData = useCallback(async () => {
    setError(null);
    try {
      const data = await apiGet<TrackingResponse>(`/orders/track/${orderId}`);
      setOrder(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {setOrder(null);setError('You cannot access this order.');}
      else if (err instanceof ApiError && err.status === 404) {setOrder(null);setError('Order not found.');}
      else setError(err instanceof Error ? err.message : 'Unable to load order.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchTrackingData();
  }, [fetchTrackingData]);

  // Auto-polling for pending orders every 5 seconds
  useEffect(() => {
    if (!order || order.status !== "pending") return;

    const interval = setInterval(() => {
      fetchTrackingData();
    }, 5000);

    return () => clearInterval(interval);
  }, [order, fetchTrackingData]);

  const handleCopy = (text: string, type: "memo" | "account") => {
    navigator.clipboard.writeText(text);
    if (type === "memo") {
      setCopiedMemo(true);
      setTimeout(() => setCopiedMemo(false), 2000);
    } else {
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2000);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return {
          label: "Payment Confirmed",
          color: "bg-emerald-100 text-emerald-800 border-emerald-200",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        };
      case "pending":
        return {
          label: "Awaiting VietQR Payment",
          color: "bg-amber-50 text-amber-800 border-amber-200",
          icon: <Clock className="w-4 h-4 text-amber-700" style={{ animationDuration: "4s" }} />
        };
      case "confirmed":
        return {
          label: "COD Confirmed",
          color: "bg-[#F1ECE4] text-[#1C1C1C] border-[#E8E3DB]",
          icon: <CheckCircle2 className="w-4 h-4 text-[#1C1C1C]" />
        };
      case "shipped":
        return {
          label: "Shipped",
          color: "bg-[#F1ECE4] text-[#1C1C1C] border-[#E8E3DB]",
          icon: <Package className="w-4 h-4 text-[#1C1C1C]" />
        };
      case "delivered":
        return {
          label: "Delivered",
          color: "bg-emerald-100 text-emerald-800 border-emerald-200",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        };
      case "cancelled":
        return {
          label: "Order Cancelled",
          color: "bg-rose-100 text-rose-800 border-rose-200",
          icon: <AlertCircle className="w-4 h-4 text-rose-600" />
        };
      case "expired":
        return {
          label: "Order Expired",
          color: "bg-slate-100 text-slate-600 border-slate-200",
          icon: <AlertCircle className="w-4 h-4 text-slate-500" />
        };
      default:
        return {
          label: status,
          color: "bg-slate-100 text-slate-800 border-slate-200",
          icon: <AlertCircle className="w-4 h-4 text-slate-600" />
        };
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-[#1C1C1C]">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-20 pt-24 sm:px-8 lg:px-12 lg:pt-36">
        <button onClick={() => router.push("/store/orders")} className="mb-7 inline-flex min-h-11 items-center gap-2 text-xs text-[#6B6761] hover:text-[#1C1C1C]"><ArrowLeft className="h-3.5 w-3.5" />Back to My Orders</button>
        {error && <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 border border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800"><p>{error}</p><button onClick={() => fetchTrackingData()} className="min-h-11 font-medium underline underline-offset-4">Retry</button></div>}
        {loading ? (
          <div role="status" className="flex min-h-64 items-center justify-center gap-3 border border-[#E8E3DB] bg-white p-6 text-sm text-[#6B6761]"><RefreshCw className="h-5 w-5 animate-spin text-[#1C1C1C]" />Loading order details...</div>
        ) : !order ? (
          <div className="border border-[#E8E3DB] bg-white px-6 py-16 text-center"><AlertCircle className="mx-auto mb-5 h-9 w-9 text-[#1C1C1C]" /><h1 className="text-3xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Order not found.</h1><p className="mx-auto mt-3 max-w-sm break-words text-sm leading-7 text-[#6B6761]">Unable to display order #{orderId}. Check your tracking link or try reloading.</p><button onClick={() => router.push("/store")} className="mt-7 min-h-12 bg-[#1C1C1C] px-6 text-sm font-medium text-white hover:bg-[#1C1C1C]">Back to store</button></div>
        ) : (
          <div>
            <div className="mb-9 flex flex-col justify-between gap-6 border-b border-[#E8E3DB] pb-9 lg:flex-row lg:items-end">
              <div className="min-w-0"><p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C1C1C]">Order tracking</p><h1 className="text-4xl font-medium leading-[1.05] tracking-[-0.045em] sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>Your order.</h1><p className="mt-5 break-all font-mono text-xs text-[#1C1C1C]">#{order.public_code || order.id}</p><p className="mt-2 text-xs text-[#6B6761]">Placed on: {displayDate(order.created_at, "dd/MM/yyyy HH:mm")}</p></div>
              <div className="flex items-center gap-3">
                {(() => { const badge = getStatusBadge(order.status); return <span className={"inline-flex min-h-11 items-center gap-2 border px-4 py-2 text-xs font-medium " + badge.color}>{badge.icon}{badge.label}</span>; })()}
                <button onClick={() => { setRefreshing(true); fetchTrackingData(); }} disabled={refreshing} aria-label="Refresh order status" title="Refresh order status" className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#E8E3DB] bg-white text-[#1C1C1C] hover:border-[#1C1C1C] disabled:opacity-50"><RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} /></button>
              </div>
            </div>
            {order.status === "pending" && <p role="status" className="mb-6 flex items-start gap-3 border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900"><Clock className="mt-1 h-4 w-4 shrink-0" />Awaiting administrator verification of your VietQR payment. Status refreshes every 5 seconds.</p>}
            <section className="mb-6 border border-[#E8E3DB] bg-white p-5 sm:p-8">
              <div className="mb-7 flex items-center gap-3"><span className="font-mono text-xs text-[#1C1C1C]">01</span><h2 className="text-2xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Order progress</h2></div>
              <ol className="grid gap-6 sm:grid-cols-4 sm:gap-5">{order.timeline.map(item => <li key={item.step} className="relative flex gap-4 sm:flex-col sm:gap-4">
                <div className={"flex h-10 w-10 shrink-0 items-center justify-center border text-sm font-medium " + (item.completed ? "border-[#1C1C1C] bg-[#1C1C1C] text-white" : "border-[#E8E3DB] bg-[#FAF8F5] text-[#6B6761]")}>{item.completed ? <Check className="h-4 w-4" /> : item.step}</div>
                <div className="border-t border-[#E8E3DB] pt-3"><h3 className={"text-sm font-medium leading-6 " + (item.completed ? "text-[#1C1C1C]" : "text-[#6B6761]")}>{item.title}</h3><p className="mt-1 text-xs leading-6 text-[#6B6761]">{item.description}</p></div>
              </li>)}</ol>
            </section>
            {order.status === "pending" && order.vietqr && <section className="mb-6 grid gap-8 border border-[#E8E3DB] bg-white p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0"><div className="mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-[#1C1C1C]"><QrCode className="h-4 w-4" />VietQR Banking</div><h2 className="text-3xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Bank transfer details</h2><p className="mb-6 mt-3 max-w-xl text-sm leading-7 text-[#6B6761]">Scan with your banking app and use the exact amount and payment memo. An administrator verifies the transfer before updating your order.</p>
                <dl className="divide-y divide-[#E8E3DB] border-y border-[#E8E3DB] text-sm">
                  <div className="flex flex-wrap justify-between gap-3 py-4"><dt className="text-[#6B6761]">Bank</dt><dd className="font-medium">{order.vietqr.bank_name}</dd></div>
                  <div className="flex flex-wrap items-center justify-between gap-3 py-3"><dt className="text-[#6B6761]">Account number</dt><dd className="flex min-w-0 items-center gap-2"><span className="break-all font-mono text-xs font-medium">{order.vietqr.account_no}</span><button onClick={() => handleCopy(order.vietqr!.account_no, "account")} title="Copy Account Number" aria-label="Copy Account Number" className="flex h-11 w-11 shrink-0 items-center justify-center text-[#1C1C1C] hover:bg-[#F1ECE4]">{copiedAccount ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></dd></div>
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F1ECE4] px-3 py-2 text-[#1C1C1C]"><dt className="text-xs font-medium">Payment memo</dt><dd className="flex min-w-0 items-center gap-2"><span className="break-all font-mono text-xs font-semibold">{order.vietqr.memo}</span><button onClick={() => handleCopy(order.vietqr!.memo, "memo")} title="Copy Transfer Memo" aria-label="Copy Transfer Memo" className="flex h-11 w-11 shrink-0 items-center justify-center hover:bg-white">{copiedMemo ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</button></dd></div>
                </dl>
              </div>
              <div className="flex flex-col items-center justify-center border border-[#E8E3DB] bg-[#FAF8F5] p-5 sm:p-8"><div className="relative aspect-square w-full max-w-56 border border-[#E8E3DB] bg-white"><Image src={order.vietqr.qr_url} alt="VietQR Payment Code" fill sizes="224px" className="object-contain p-3" /></div><p className="mt-5 text-xs text-[#6B6761]">Transfer amount</p><strong className="mt-2 text-xl font-semibold text-[#1C1C1C]">{formatCurrency(order.total_amount, order.currency)}</strong></div>
            </section>}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
              <section className="min-w-0 border border-[#E8E3DB] bg-white p-5 sm:p-8">
                <div className="mb-6 flex items-center gap-3"><span className="font-mono text-xs text-[#1C1C1C]">02</span><h2 className="text-2xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Order items</h2></div>
                {order.items?.length ? <div className="divide-y divide-[#E8E3DB]">{order.items.map((item, index) => <div key={index} className="flex flex-col justify-between gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row">
                  <div className="min-w-0"><h3 className="text-base font-medium leading-6">{item.product_name}</h3>{(item.size || item.color_name) && <p className="mt-1 text-xs leading-6 text-[#6B6761]">{[item.size && "Size " + item.size, item.color_name && "Color " + item.color_name].filter(Boolean).join(" · ")}</p>}{item.sku && <p className="mt-1 break-all font-mono text-[10px] text-[#6B6761]">SKU: {item.sku}</p>}<p className="mt-2 text-xs text-[#6B6761]">Quantity: {item.quantity}{item.unit_price != null ? " × " + formatCurrency(item.unit_price, order.currency) : ""}</p></div>
                  {item.subtotal != null && <span className="shrink-0 text-sm font-semibold">{formatCurrency(item.subtotal, order.currency)}</span>}
                </div>)}</div> : <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-medium">{order.product_name || "Order items"}</h3><p className="mt-2 text-xs text-[#6B6761]">Quantity: {order.quantity ?? 1}</p></div><span className="text-sm font-semibold">{formatCurrency(order.total_amount, order.currency)}</span></div>}
              </section>
              <aside className="min-w-0 border border-[#E8E3DB] bg-white">
                <div className="p-5 sm:p-7"><h2 className="mb-6 text-2xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Order summary</h2><dl className="space-y-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><dt className="text-[#6B6761]">Method</dt><dd className="font-medium">{order.payment_method === "cod" ? "Cash on delivery" : "VietQR Banking"}</dd></div><div className="flex flex-wrap items-end justify-between gap-3 border-t border-[#E8E3DB] pt-5"><dt className="font-medium">Total</dt><dd className="text-2xl font-semibold tracking-tight">{formatCurrency(order.total_amount, order.currency)}</dd></div></dl></div>
                {(order.customer_name || order.customer_phone) && <div className="space-y-2 border-t border-[#E8E3DB] bg-[#FAF8F5] p-5 sm:p-7"><h3 className="mb-3 text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6761]">Recipient</h3><p className="break-words text-sm font-medium">{order.customer_name}</p><p className="text-sm text-[#6B6761]">{order.customer_phone}</p></div>}
              </aside>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
