"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPatch } from "@/lib/api";
import { User, Package, Heart, CheckCircle2, ArrowRight, Save, AlertCircle, RefreshCw } from "lucide-react";
import { Header } from "../components/Header";
import { Footer } from "../components/Footer";
import { displayDate, formatCurrency } from "@/lib/utils";
import { getOrderStatusPresentation } from "@/lib/order-status";
import type { User as UserProfile, Order as OrderItem, Page } from "@/lib/types";

type SavedItem = { id?: number; slug?: string; name?: string; title?: string; price?: number; currency?: string };

export default function CustomerAccountPage() {
  const [activeTab, setActiveTab] = useState<"profile" | "orders" | "wishlist">("profile");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [updating, setUpdating] = useState(false);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [wishlist, setWishlist] = useState<SavedItem[]>([]);

  const fetchUserOrders = useCallback(async (userId: number) => {
    setOrdersLoading(true);
    try {
      const data = await apiGet<Page<OrderItem> | OrderItem[]>("/orders/user/" + userId);
      setOrders(Array.isArray(data) ? data : (data?.items ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load your orders");
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<UserProfile>("/users/me");
      setProfile(data);
      setFirstName(data.first_name || "");
      setLastName(data.last_name || "");
      setUsername(data.username || "");
      setEmail(data.email || "");
      void fetchUserOrders(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user profile. Please log in.");
    } finally {
      setLoading(false);
    }
  }, [fetchUserOrders]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'wishlist') setActiveTab('wishlist');
    void fetchProfile();
    try {
      const stored = localStorage.getItem("truelook_wishlist") || localStorage.getItem("luxestore_wishlist");
      const saved: unknown = stored ? JSON.parse(stored) : [];
      if (Array.isArray(saved)) setWishlist(saved);
    } catch {
      setWishlist([]);
    }
  }, [fetchProfile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    setSaveSuccess(null);
    setError(null);
    try {
      const updated = await apiPatch<UserProfile>("/users/me", { username, email, first_name: firstName, last_name: lastName });
      setProfile(updated);
      setSaveSuccess("Your account details have been updated.");
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile.");
    } finally {
      setUpdating(false);
    }
  };

  const tabs = [
    { id: "profile" as const, label: "Profile", detail: "Profile Details", icon: User },
    { id: "orders" as const, label: "Orders", detail: "Order History", icon: Package, count: orders.length },
    { id: "wishlist" as const, label: "Saved items", detail: "Saved on this browser", icon: Heart, count: wishlist.length },
  ];
  const inputClass = "min-h-12 w-full border border-[#E8E3DB] bg-[#FAF8F5]/50 px-4 py-3 text-sm outline-none focus:border-[#1C1C1C] focus:ring-2 focus:ring-[#1C1C1C]/15";
  const displayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.username;

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-[#1C1C1C]">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 pb-20 pt-40 sm:px-8 lg:px-12 lg:pt-56">
        <div className="mb-10 flex flex-col justify-between gap-6 border-b border-[#E8E3DB] pb-10 sm:flex-row sm:items-end">
          <div>
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1C1C1C]">Your space</p>
            <h1 className="text-4xl font-medium leading-tight tracking-[-0.045em] sm:text-6xl" style={{ fontFamily: "var(--font-display)" }}>Your account.</h1>
            {profile && <p className="mt-4 break-words text-sm text-[#6B6761]">Hello, {displayName}. <span className="mt-1 block sm:ml-2 sm:inline">{profile.email}</span></p>}
          </div>
          <Link href="/store" className="inline-flex min-h-11 items-center gap-4 self-start border-b border-[#1C1C1C] py-2 text-sm font-medium sm:self-auto">Continue shopping <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {loading ? (
          <div role="status" className="flex min-h-64 items-center justify-center gap-3 border border-[#E8E3DB] bg-white p-8 text-sm text-[#6B6761]"><RefreshCw className="h-5 w-5 animate-spin text-[#1C1C1C]" />Loading Account Portal...</div>
        ) : !profile ? (
          <div className="mx-auto max-w-lg border border-[#E8E3DB] bg-white p-8 text-center sm:p-12">
            <AlertCircle className="mx-auto mb-5 h-8 w-8 text-[#1C1C1C]" />
            <h2 className="text-2xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)" }}>Sign in to continue</h2>
            <p role="alert" className="mt-3 text-sm leading-6 text-[#6B6761]">{error}</p>
            <Link href="/login?next=/store/account" className="mt-6 inline-flex min-h-12 items-center justify-center bg-[#1C1C1C] px-6 text-sm font-medium text-white hover:bg-[#1C1C1C]">Sign In to Your Account</Link>
          </div>
        ) : (
          <div className="grid items-start gap-7 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-12">
            <nav aria-label="Account navigation" className="grid gap-1 border border-[#E8E3DB] bg-white p-2 lg:sticky lg:top-48">
              {tabs.map(({ id, label, detail, icon: Icon, count }) => <button type="button" key={id} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)} className={"flex min-h-16 items-center gap-3 px-4 py-3 text-left transition-colors " + (activeTab === id ? "bg-[#F1ECE4] text-[#1C1C1C]" : "text-[#6B6761] hover:bg-[#FAF8F5]")}>
                <Icon className="h-4 w-4 shrink-0" /><span className="flex-1"><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-[10px]">{detail}</span></span>{typeof count === "number" && <span className="font-mono text-xs">{count.toString().padStart(2, "0")}</span>}
              </button>)}
            </nav>
            <div className="min-w-0">
              {error && <div role="alert" className="mb-5 flex items-start gap-3 border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
              {activeTab === "profile" && <section className="border border-[#E8E3DB] bg-white p-6 sm:p-9">
                <div className="mb-8 border-b border-[#E8E3DB] pb-6">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[#1C1C1C]">01 / Profile</p>
                  <h2 className="text-2xl font-medium tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>Personal details</h2>
                  <p className="mt-2 text-sm leading-6 text-[#6B6761]">Update your account details.</p>
                </div>
                {saveSuccess && <p role="status" className="mb-6 flex items-center gap-2 border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />{saveSuccess}</p>}
                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2"><label htmlFor="account-first-name" className="block text-xs font-medium">First name</label><input id="account-first-name" autoComplete="given-name" value={firstName} onChange={e => setFirstName(e.target.value)} className={inputClass} /></div>
                    <div className="space-y-2"><label htmlFor="account-last-name" className="block text-xs font-medium">Last name</label><input id="account-last-name" autoComplete="family-name" value={lastName} onChange={e => setLastName(e.target.value)} className={inputClass} /></div>
                    <div className="space-y-2"><label htmlFor="account-username" className="block text-xs font-medium">Username</label><input id="account-username" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required className={inputClass} /></div>
                    <div className="space-y-2"><label htmlFor="account-email" className="block text-xs font-medium">Email</label><input id="account-email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className={inputClass} /></div>
                  </div>
                  <div className="flex justify-end border-t border-[#E8E3DB] pt-6"><button type="submit" disabled={updating} className="inline-flex min-h-12 w-full items-center justify-center gap-3 bg-[#1C1C1C] px-6 text-sm font-medium text-white hover:bg-[#1C1C1C] disabled:opacity-50 sm:w-auto">{updating ? <><RefreshCw className="h-4 w-4 animate-spin" />Saving...</> : <><Save className="h-4 w-4" />Save Changes</>}</button></div>
                </form>
              </section>}
              {activeTab === "orders" && <section className="border border-[#E8E3DB] bg-white p-6 sm:p-9">
                <div className="mb-7 border-b border-[#E8E3DB] pb-6"><p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[#1C1C1C]">02 / Orders</p><h2 className="text-2xl font-medium tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>Order history</h2><p className="mt-2 text-sm leading-6 text-[#6B6761]">View your orders and their current status.</p></div>
                {ordersLoading ? <p role="status" className="py-12 text-center text-sm text-[#6B6761]">Loading your orders...</p> : orders.length === 0 ? <EmptyState icon="orders" title="You have no orders yet" description="Explore the collection and find your next favorite." /> : <div className="divide-y divide-[#E8E3DB]">{orders.map(order => <article key={order.id} className="flex flex-col justify-between gap-5 py-6 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <div className="min-w-0 space-y-2">
                    <p className="break-all font-mono text-[11px] text-[#1C1C1C]">#{order.public_code || order.id}</p>
                    <h3 className="text-base font-medium leading-6">{order.product_name || order.items?.[0]?.product_name || "Order"}</h3>
                    <p className="text-xs leading-5 text-[#6B6761]">{displayDate(order.created_at, "dd/MM/yyyy")} · Quantity: {order.quantity ?? order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 1}</p>
                    <span className="inline-flex border border-[#E8E3DB] bg-[#FAF8F5] px-2.5 py-1 text-[10px] font-medium">{getOrderStatusPresentation(order.status).label}</span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 sm:flex-col sm:items-end">
                    <p className="text-lg font-semibold">{formatCurrency(order.total ?? order.total_amount, order.currency)}</p>
                    {order.public_code ? <Link href={"/store/orders/" + encodeURIComponent(order.public_code)} className="inline-flex min-h-11 items-center gap-3 border-b border-[#1C1C1C] text-xs font-medium">Track Order <ArrowRight className="h-3.5 w-3.5" /></Link> : <Link href="/store/orders" className="inline-flex min-h-11 items-center border-b border-[#1C1C1C] text-xs font-medium">View My Orders</Link>}
                  </div>
                </article>)}</div>}
              </section>}
              {activeTab === "wishlist" && <section className="border border-[#E8E3DB] bg-white p-6 sm:p-9">
                <div className="mb-7 border-b border-[#E8E3DB] pb-6"><p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-[#1C1C1C]">03 / Saved</p><h2 className="text-2xl font-medium tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-display)" }}>Your selections</h2><p className="mt-2 text-sm leading-6 text-[#6B6761]">Saved only in this browser. These items do not sync across accounts or devices.</p></div>
                {wishlist.length === 0 ? <EmptyState icon="wishlist" title="No saved items yet" description="Save your favorites as you explore the store." /> : <div className="grid gap-4 sm:grid-cols-2">{wishlist.map((item, idx) => <div key={idx} className="flex min-w-0 items-start justify-between gap-4 border border-[#E8E3DB] p-5"><div className="min-w-0"><p className="text-sm font-medium leading-6">{item.name || item.title || "Saved items"}</p>{item.price != null && <p className="mt-2 text-sm text-[#1C1C1C]">{formatCurrency(Number(item.price), item.currency)}</p>}</div><Link href={item.slug || item.id ? `/store/products/${item.slug || item.id}` : "/store/collection"} className="inline-flex min-h-11 items-center border-b border-[#1C1C1C] text-xs font-medium">View <ArrowRight className="ml-2 h-3.5 w-3.5" /></Link></div>)}</div>}
              </section>}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: "orders" | "wishlist"; title: string; description: string }) {
  const Icon = icon === "orders" ? Package : Heart;
  return <div className="bg-[#FAF8F5] px-5 py-12 text-center"><Icon className="mx-auto mb-5 h-8 w-8 text-[#1C1C1C]" /><h3 className="text-lg font-medium">{title}</h3><p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#6B6761]">{description}</p><Link href="/store" className="mt-5 inline-flex min-h-11 items-center gap-3 border-b border-[#1C1C1C] text-sm font-medium">Explore products <ArrowRight className="h-4 w-4" /></Link></div>;
}
