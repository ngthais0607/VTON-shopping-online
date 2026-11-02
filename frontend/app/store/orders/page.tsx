"use client";
import { displayDate, formatCurrency } from '@/lib/utils';


import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { Order, Page, User } from "@/lib/types";
import { getOrderStatusPresentation } from "@/lib/order-status";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { ShoppingBag, ArrowLeft, Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw, CreditCard, Truck } from "lucide-react";

export default function CustomerOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [cancellingId, setCancellingId] = useState<number | null>(null);
    const router = useRouter();

    const loadData = useCallback(async () => {
        setError(null);
        try {
            // Fetch the signed-in user.
            const user = await apiGet<User>("/users/me");

            // Load orders belonging to this user.
            const ordersData = await apiGet<Page<Order> | Order[]>(`/orders/user/${user.id}?limit=20&offset=0`);
            setOrders(Array.isArray(ordersData) ? ordersData : ordersData.items);
        } catch (err) {
            console.error("Failed to load customer orders", err);
            // Redirect to sign in when the session is unavailable.
            if (err instanceof ApiError && err.status === 401) router.push("/login?next=/store/orders");
            else setError(err instanceof Error ? err.message : "Unable to load orders");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [router]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleRefresh = () => {
        setRefreshing(true);
        void loadData();
    };

    const handleCancelOrder = async (orderId: number) => {
        if (!window.confirm("Are you sure you want to cancel this order?")) return;
        setCancellingId(orderId);
        try {
            await apiPost(`/orders/${orderId}/cancel`, {});
            await loadData();
        } catch (err) {
            alert(err instanceof Error ? err.message : "Failed to cancel order");
        } finally {
            setCancellingId(null);
        }
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case "paid":
                return "bg-emerald-50 text-emerald-700 border-emerald-200";
            case "pending":
                return "bg-amber-50 text-amber-700 border-amber-200";
            case "confirmed":
                return "bg-[#F1ECE4] text-[#1C1C1C] border-[#E8E3DB]";
            case "shipped":
                return "bg-[#F1ECE4] text-[#1C1C1C] border-[#E8E3DB]";
            case "delivered":
                return "bg-emerald-50 text-emerald-700 border-emerald-200";
            case "expired":
                return "bg-slate-100 text-slate-500 border-slate-200";
            case "cancelled":
                return "bg-rose-50 text-rose-700 border-rose-200";
            default:
                return "bg-slate-50 text-slate-600 border-slate-100";
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "paid":
                return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
            case "pending":
                return <Clock className="w-4 h-4 text-amber-600" />;
            case "confirmed":
                return <CheckCircle2 className="w-4 h-4 text-[#1C1C1C]" />;
            case "shipped":
                return <Truck className="w-4 h-4 text-[#1C1C1C]" />;
            case "delivered":
                return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
            case "cancelled":
                return <XCircle className="w-4 h-4 text-rose-600" />;
            default:
                return <AlertCircle className="w-4 h-4 text-slate-500" />;
        }
    };

    return (
        <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-[#1C1C1C]">
            <Header />
            <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-20 pt-40 sm:px-8 lg:px-12 lg:pt-56">
                <button onClick={() => router.push("/store")} className="mb-7 flex min-h-11 items-center gap-2 text-xs text-[#6B6761] hover:text-[#1C1C1C]"><ArrowLeft className="h-3.5 w-3.5" />Back to store</button>
                <div className="mb-10 flex items-end justify-between gap-5 border-b border-[#E8E3DB] pb-9">
                    <div><p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C1C1C]">Order history</p><h1 className="text-4xl font-medium leading-[1.05] tracking-[-0.045em] sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>My<br />orders.</h1><p className="mt-4 text-sm leading-6 text-[#6B6761]">Track and manage your orders.</p></div>
                    <button onClick={handleRefresh} disabled={refreshing} aria-label="Refresh order history" title="Refresh order history" className="flex h-12 w-12 shrink-0 items-center justify-center border border-[#E8E3DB] bg-white text-[#1C1C1C] hover:border-[#1C1C1C] disabled:opacity-50"><RefreshCw className={"h-4 w-4 " + (refreshing ? "animate-spin" : "")} /></button>
                </div>
                {error ? <div role="alert" className="flex flex-col justify-between gap-4 border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800 sm:flex-row sm:items-center"><p>{error}</p><button onClick={handleRefresh} className="min-h-11 self-start border-b border-rose-800 font-medium">Retry</button></div> : loading ? (
                    <div role="status" className="flex min-h-64 items-center justify-center gap-3 border border-[#E8E3DB] bg-white p-6 text-sm text-[#6B6761]"><RefreshCw className="h-5 w-5 animate-spin text-[#1C1C1C]" />Loading your orders...</div>
                ) : orders.length === 0 ? (
                    <div className="border border-[#E8E3DB] bg-white px-6 py-16 text-center sm:py-24"><ShoppingBag className="mx-auto mb-6 h-10 w-10 text-[#1C1C1C]" /><h2 className="text-3xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>No orders yet.</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-[#6B6761]">Find something you love in the collection and start your TrueLook journey.</p><button onClick={() => router.push("/store")} className="mt-7 min-h-12 bg-[#1C1C1C] px-6 text-sm font-medium text-white hover:bg-[#1C1C1C]">Explore products</button></div>
                ) : (
                    <div>
                        <div className="mb-5 flex justify-between text-[10px] uppercase tracking-[0.18em] text-[#6B6761]"><span>{orders.length.toString().padStart(2, "0")} orders</span><span>Current status</span></div>
                        <div className="space-y-4">{orders.map(order => (
                            <article key={order.id} className="grid gap-6 border border-[#E8E3DB] bg-white p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center lg:gap-8">
                                <div className="min-w-0">
                                    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]"><span className="break-all font-mono text-[#1C1C1C]">#{order.public_code || order.id}</span><span className="text-[#6B6761]">{displayDate(order.created_at, "dd/MM/yyyy HH:mm")}</span></div>
                                    <h2 className="text-xl font-medium leading-7 tracking-tight" style={{ fontFamily: "var(--font-display)" }}>{order.product_name || (order.items?.length ? order.items[0].product_name + (order.items.length > 1 ? " (+" + (order.items.length - 1) + " items)" : "") : "Order #" + order.id)}</h2>
                                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs leading-5 text-[#6B6761]"><span>Quantity: <strong className="font-medium text-[#1C1C1C]">{order.quantity ?? order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 1}</strong></span>{order.unit_price != null ? <span>Unit price: <strong className="font-medium text-[#1C1C1C]">{formatCurrency(order.unit_price, order.currency)}</strong></span> : order.items?.length ? <span>{order.items.length} items</span> : null}<span>{order.payment_method === "cod" ? "Cash on delivery" : "VietQR payment"}</span></div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#E8E3DB] pt-5 lg:flex-col lg:items-end lg:border-t-0 lg:pt-0">
                                    <div><p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[#6B6761]">Total</p><p className="text-2xl font-semibold tracking-tight">{formatCurrency(order.total ?? order.total_amount, order.currency)}</p></div>
                                    <span className={"inline-flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-medium " + getStatusBadgeClass(order.status)}>{getStatusIcon(order.status)}{getOrderStatusPresentation(order.status).label}</span>
                                </div>
                                <div className="flex flex-wrap gap-3 border-t border-[#E8E3DB] pt-5 lg:min-w-40 lg:flex-col lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
                                    <button onClick={() => order.public_code && router.push("/store/orders/" + encodeURIComponent(order.public_code))} disabled={!order.public_code} className="flex min-h-11 flex-1 items-center justify-center gap-2 bg-[#1C1C1C] px-5 py-3 text-xs font-medium text-white hover:bg-[#1C1C1C] disabled:opacity-50 lg:flex-auto"><CreditCard className="h-3.5 w-3.5" />{order.status === "pending" ? "Pay & Track" : "Track Order"}</button>
                                    {((order.payment_method === "vietqr" && order.status === "pending") || (order.payment_method === "cod" && order.status === "confirmed")) && <button onClick={() => handleCancelOrder(order.id)} disabled={cancellingId === order.id} className="flex min-h-11 flex-1 items-center justify-center gap-2 border border-rose-200 px-4 py-3 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 lg:flex-auto"><XCircle className="h-3.5 w-3.5" />{cancellingId === order.id ? "Cancelling..." : "Cancel Order"}</button>}
                                </div>
                            </article>
                        ))}</div>
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
}
