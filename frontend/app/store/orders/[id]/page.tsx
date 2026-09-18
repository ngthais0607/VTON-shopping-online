"use client";

import { useEffect, useState, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { apiGet } from "@/lib/api";
import { User } from "@/lib/types";
import { Header } from "../../components/Header";
import { Footer } from "../../components/Footer";
import { 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  Copy, 
  Check, 
  Truck, 
  ShieldCheck, 
  RefreshCw, 
  AlertCircle, 
  Package, 
  Sparkles,
  QrCode,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface TimelineStep {
  step: number;
  title: string;
  description: string;
  completed: boolean;
  timestamp?: string | null;
}

interface VietQRData {
  qr_url: string;
  bank_id: string;
  bank_name: string;
  account_no: string;
  account_name: string;
  memo: string;
  amount: number;
}

interface OrderTrackData {
  id: number;
  user_id: number | null;
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  total_amount: number;
  currency: string;
  status: string;
  payment_status: string;
  expires_at: string | null;
  paid_at: string | null;
  created_at: string;
  vietqr: VietQRData;
  timeline: TimelineStep[];
}

export default function OrderTrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const orderId = resolvedParams.id;
  const router = useRouter();

  const [order, setOrder] = useState<OrderTrackData | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedMemo, setCopiedMemo] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  const fetchTrackingData = useCallback(async () => {
    try {
      const data = await apiGet<OrderTrackData>(`/orders/track/${orderId}`);
      setOrder(data);
    } catch (err) {
      console.error("Failed to load tracking data", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  const loadUserData = useCallback(async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      if (token) {
        const user = await apiGet<User>("/users/me").catch(() => null);
        setCurrentUser(user);
      }
    } catch (e) {
      console.error("Error loading user", e);
    }
  }, []);

  useEffect(() => {
    loadUserData();
    fetchTrackingData();
  }, [loadUserData, fetchTrackingData]);

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
          color: "bg-sky-100 text-sky-800 border-sky-200 animate-pulse",
          icon: <Clock className="w-4 h-4 text-sky-600 animate-spin" style={{ animationDuration: "4s" }} />
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
          color: "bg-rose-100 text-rose-800 border-rose-200",
          icon: <AlertCircle className="w-4 h-4 text-rose-600" />
        };
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Header currentUser={currentUser} onShopNow={() => router.push("/store")} />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-24">
        {/* Navigation back button */}
        <button
          onClick={() => router.push("/store/orders")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-sky-600 transition-colors mb-6 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Orders
        </button>

        {loading ? (
          <div className="bg-white border border-sky-100 rounded-3xl p-16 text-center shadow-xs">
            <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-bold text-slate-600">Retrieving real-time order tracking details...</p>
          </div>
        ) : !order ? (
          <div className="bg-white border border-sky-100 rounded-3xl p-16 text-center shadow-xs">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-900">Order Not Found</h3>
            <p className="text-sm text-slate-500 mt-1 mb-6">Order #{orderId} could not be located in our system.</p>
            <button
              onClick={() => router.push("/store")}
              className="px-6 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-bold hover:bg-sky-700 transition-colors"
            >
              Return to Store
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Header Status Card */}
            <div className="bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 rounded-3xl p-8 text-white shadow-xl shadow-sky-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full blur-3xl -z-0" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-xs font-extrabold uppercase tracking-wider mb-3">
                    <Sparkles className="w-3.5 h-3.5" />
                    Live Order Tracker
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Order #{order.id}</h1>
                  <p className="text-sky-100 text-xs sm:text-sm mt-1">
                    Placed on {new Date(order.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {(() => {
                    const badge = getStatusBadge(order.status);
                    return (
                      <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-extrabold border shadow-sm ${badge.color}`}>
                        {badge.icon}
                        {badge.label}
                      </span>
                    );
                  })()}
                  <button
                    onClick={() => { setRefreshing(true); fetchTrackingData(); }}
                    disabled={refreshing}
                    className="p-2.5 rounded-2xl bg-white/20 hover:bg-white/30 text-white backdrop-blur-md transition-all active:scale-95 cursor-pointer"
                    title="Refresh order status"
                  >
                    <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Auto-reconciling Banner for Pending Orders */}
            {order.status === "pending" && (
              <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs font-semibold text-sky-900 backdrop-blur-md">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-sky-500 animate-ping" />
                  <span>Real-time payment reconciliation active. Checking status every 5s...</span>
                </div>
                <span className="text-sky-700 font-bold hidden sm:inline">Keep window open</span>
              </div>
            )}

            {/* Stepper Timeline */}
            <div className="bg-white rounded-3xl p-8 border border-sky-100 shadow-sm space-y-6">
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-sky-600" />
                Fulfillment Progress
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 relative">
                {order.timeline.map((item, idx) => (
                  <div key={item.step} className="relative flex sm:flex-col items-start gap-4 sm:gap-3">
                    <div className="flex items-center justify-center">
                      <div
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center font-extrabold text-sm transition-all ${
                          item.completed
                            ? "bg-sky-600 text-white shadow-md shadow-sky-500/25"
                            : "bg-slate-100 text-slate-400 border border-slate-200"
                        }`}
                      >
                        {item.completed ? <Check className="w-5 h-5 stroke-[3]" /> : item.step}
                      </div>
                    </div>
                    <div className="flex-1 space-y-1">
                      <h3 className={`text-xs font-extrabold ${item.completed ? "text-slate-900" : "text-slate-400"}`}>
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* VietQR Payment Card (Only shown if pending) */}
            {order.status === "pending" && order.vietqr && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl p-8 border border-sky-200 shadow-lg shadow-sky-500/5 grid md:grid-cols-2 gap-8 items-center"
              >
                <div className="text-center md:text-left space-y-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-100 text-sky-800 text-xs font-bold uppercase tracking-wider">
                    <QrCode className="w-3.5 h-3.5 text-sky-600" /> Automated VietQR
                  </span>
                  <h3 className="text-xl font-extrabold text-slate-900">Scan QR Code to Pay</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Open your banking app (MB, Vietcombank, Techcombank, etc.) and scan the QR code. Your order will reconcile automatically in seconds.
                  </p>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <span className="text-slate-500">Bank Name</span>
                      <span className="font-bold text-slate-900">{order.vietqr.bank_name}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <span className="text-slate-500">Account Number</span>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-slate-900 font-mono">{order.vietqr.account_no}</span>
                        <button
                          onClick={() => handleCopy(order.vietqr.account_no, "account")}
                          className="p-1 text-slate-400 hover:text-sky-600 transition-colors"
                          title="Copy Account Number"
                        >
                          {copiedAccount ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-xl bg-sky-50/80 border border-sky-200 text-xs">
                      <span className="text-sky-800 font-bold">Transfer Memo (Strict)</span>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sky-700 font-mono">{order.vietqr.memo}</span>
                        <button
                          onClick={() => handleCopy(order.vietqr.memo, "memo")}
                          className="p-1 text-sky-600 hover:text-sky-800 transition-colors"
                          title="Copy Transfer Memo"
                        >
                          {copiedMemo ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border border-slate-200/80">
                  <div className="relative w-52 h-52 bg-white rounded-xl p-3 shadow-md border border-slate-100">
                    <Image
                      src={order.vietqr.qr_url}
                      alt="VietQR Payment Code"
                      fill
                      className="object-contain p-2"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium mt-4 text-center">
                    Amount: <strong className="text-sky-600 font-extrabold text-sm">${order.total_amount.toLocaleString()}</strong>
                  </p>
                </div>
              </motion.div>
            )}

            {/* Order Items & Summary Breakdown */}
            <div className="bg-white rounded-3xl p-8 border border-sky-100 shadow-sm space-y-6">
              <h3 className="text-base font-extrabold text-slate-900">Order Items & Summary</h3>

              <div className="flex items-center justify-between py-4 border-y border-slate-100 text-sm">
                <div>
                  <h4 className="font-bold text-slate-900">{order.product_name}</h4>
                  <p className="text-xs text-slate-500 mt-0.5">Quantity: {order.quantity} x ${order.unit_price.toFixed(2)}</p>
                </div>
                <span className="font-extrabold text-slate-900">${(order.unit_price * order.quantity).toFixed(2)}</span>
              </div>

              <div className="space-y-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-900">${order.total_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Express Dispatch & Shipping</span>
                  <span className="font-bold text-emerald-600">FREE</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-slate-100 text-sm font-extrabold text-slate-900">
                  <span>Total Paid</span>
                  <span className="text-sky-600 text-base">${order.total_amount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
