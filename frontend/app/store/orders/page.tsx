"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { Order, User } from "@/lib/types";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { ShoppingBag, ArrowLeft, Clock, CheckCircle2, XCircle, AlertCircle, RefreshCw, CreditCard } from "lucide-react";
import { format } from "date-fns";

export default function CustomerOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();

    async function loadData() {
        try {
            // 1. Lấy thông tin user hiện tại để lấy ID
            const user = await apiGet<User>("/users/me");
            setCurrentUser(user);

            // 2. Lấy đơn hàng của riêng user này thông qua API /orders/user/{user_id}
            const ordersData = await apiGet<Order[]>(`/orders/user/${user.id}`);
            setOrders(ordersData);
        } catch (err) {
            console.error("Failed to load customer orders", err);
            // Nếu token hết hạn hoặc chưa đăng nhập, tự động đẩy về trang Login
            router.push("/login");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        loadData();
    }, []);

    const handleRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case "paid":
                return "bg-emerald-50 text-emerald-700 border-emerald-200";
            case "pending":
                return "bg-amber-50 text-amber-700 border-amber-200";
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
            case "cancelled":
                return <XCircle className="w-4 h-4 text-rose-600" />;
            default:
                return <AlertCircle className="w-4 h-4 text-slate-500" />;
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
            {/* Kế thừa Header chung của Storefront */}
            <Header currentUser={currentUser} onShopNow={() => router.push("/store")} />

            <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-24">
                {/* Nút quay lại trang mua sắm */}
                <button
                    onClick={() => router.push("/store")}
                    className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 transition-colors mb-6 cursor-pointer"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Store
                </button>

                {/* Tiêu đề & Nút tải lại */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">My Orders</h1>
                        <p className="text-sm text-slate-500 mt-1">Track and manage your purchasing history</p>
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                        title="Refresh order history"
                    >
                        <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
                    </button>
                </div>

                {/* Nội dung danh sách đơn hàng */}
                {loading ? (
                    <div className="bg-white border border-sky-100 rounded-3xl p-12 text-center shadow-xs">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-slate-500">Loading your orders...</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className="bg-white border border-sky-100 rounded-3xl p-16 text-center shadow-xs">
                        <div className="w-16 h-16 rounded-full bg-sky-50 flex items-center justify-center mx-auto mb-4">
                            <ShoppingBag className="w-8 h-8 text-sky-500" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 mb-1">No orders yet</h3>
                        <p className="text-slate-500 text-sm max-w-xs mx-auto mb-6">
                            Looks like you haven&apos;t placed any orders yet. Check out our products and start shopping!
                        </p>
                        <button
                            onClick={() => router.push("/store")}
                            className="px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white text-sm font-bold shadow-md shadow-sky-500/25 cursor-pointer active:scale-95 transition-all"
                        >
                            Shop Now
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {orders.map((order) => (
                            <div
                                key={order.id}
                                className="bg-white border border-sky-100 rounded-2xl shadow-xs hover:shadow-md hover:border-sky-200 transition-all p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
                            >
                                {/* Thông tin sản phẩm */}
                                <div className="space-y-1.5 flex-1">
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-sky-600 uppercase tracking-wider">
                                            Order #{order.id}
                                        </span>
                                        <span className="text-xs text-slate-400 font-semibold">
                                            {format(new Date(order.created_at), "MMM dd, yyyy HH:mm")}
                                        </span>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900">{order.product_name}</h3>
                                    <div className="flex items-center gap-4 text-sm text-slate-500 font-medium">
                                        <span>Quantity: <strong className="text-slate-800">{order.quantity}</strong></span>
                                        <span>Unit Price: <strong className="text-slate-800">${order.unit_price.toFixed(2)}</strong></span>
                                    </div>
                                </div>

                                {/* Trạng thái & Tổng tiền */}
                                <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 min-w-[150px] border-t md:border-t-0 pt-3 md:pt-0">
                                    <div className="text-left md:text-right">
                                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-0.5">Total Amount</p>
                                        <p className="text-xl font-black text-slate-950">${order.total.toFixed(2)}</p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span
                                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border capitalize ${getStatusBadgeClass(
                                                order.status
                                            )}`}
                                        >
                                            {getStatusIcon(order.status)}
                                            {order.status}
                                        </span>
                                    </div>
                                </div>

                                {/* Nút xem chi tiết & theo dõi đơn hàng */}
                                <div className="md:border-l md:border-sky-100 md:pl-4 flex items-center justify-stretch md:justify-center w-full md:w-auto pt-2 md:pt-0">
                                    <button
                                        onClick={() => router.push(`/store/orders/${order.id}`)}
                                        className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 via-sky-600 to-cyan-600 hover:from-sky-600 hover:to-cyan-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md shadow-sky-500/20 active:scale-95 transition-all cursor-pointer"
                                    >
                                        <CreditCard className="w-3.5 h-3.5" />
                                        {order.status === "pending" ? "Pay & Track" : "Track Order"}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Kế thừa Footer chung */}
            <Footer />
        </div>
    );
}
