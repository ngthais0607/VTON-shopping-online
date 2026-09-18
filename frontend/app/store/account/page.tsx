'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { apiGet, apiPut } from '@/lib/api';
import { User, Package, Heart, CheckCircle2, Clock, XCircle, ArrowRight, ShieldCheck, Key, Save, AlertCircle, RefreshCw } from 'lucide-react';

interface UserProfile {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  created_at?: string;
}

interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  unit_price: number;
  quantity: number;
  total_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
}

export default function CustomerAccountPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'orders' | 'wishlist'>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  
  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [updating, setUpdating] = useState(false);

  // Orders state
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Wishlist state
  const [wishlist, setWishlist] = useState<any[]>([]);

  useEffect(() => {
    fetchProfile();
    loadWishlist();
  }, []);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<UserProfile>('/users/me');
      setProfile(data);
      setFirstName(data.first_name || '');
      setLastName(data.last_name || '');
      setUsername(data.username || '');
      setEmail(data.email || '');
      fetchUserOrders(data.id);
    } catch (err: any) {
      setError(err.message || 'Failed to load user profile. Please log in.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUserOrders = async (userId: number) => {
    setOrdersLoading(true);
    try {
      const data = await apiGet<OrderItem[]>(`/orders/user/${userId}`);
      setOrders(data);
    } catch (err) {
      console.error('Failed to load user orders', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadWishlist = () => {
    try {
      const stored = localStorage.getItem('luxestore_wishlist');
      if (stored) {
        setWishlist(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load wishlist from localStorage', e);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);
    setSaveSuccess(null);
    setError(null);
    try {
      const updated = await apiPut<UserProfile>('/users/me', {
        username,
        email,
        first_name: firstName,
        last_name: lastName,
      });
      setProfile(updated);
      setSaveSuccess('Profile information updated successfully!');
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile.');
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> Paid & Verified
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-amber-700 bg-amber-50 rounded-full border border-amber-200">
            <Clock className="w-3.5 h-3.5" /> Pending Payment
          </span>
        );
      case 'expired':
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-rose-700 bg-rose-50 rounded-full border border-rose-200">
            <XCircle className="w-3.5 h-3.5" /> {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold text-slate-700 bg-slate-50 rounded-full border border-slate-200">
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-sky-50/50 py-16 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sky-700 font-medium">
          <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
          <span>Loading Account Portal...</span>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-sky-50/50 py-16 px-4">
        <div className="max-w-md mx-auto bg-white rounded-2xl p-8 border border-sky-100 shadow-xl text-center">
          <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Authentication Required</h2>
          <p className="text-slate-600 text-sm mb-6">{error}</p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full px-5 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 text-white font-medium hover:from-sky-600 hover:to-sky-700 transition shadow-md shadow-sky-500/20"
          >
            Sign In to Your Account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/70 via-slate-50 to-white text-slate-800">
      {/* Header Banner */}
      <div className="relative bg-gradient-to-r from-sky-600 via-sky-500 to-cyan-600 text-white py-12 px-4 shadow-lg overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent opacity-60"></div>
        <div className="max-w-6xl mx-auto relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center text-3xl font-extrabold text-white shadow-xl">
              {profile?.first_name ? profile.first_name[0].toUpperCase() : profile?.username[0].toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  Welcome, {profile?.first_name ? `${profile.first_name} ${profile.last_name || ''}` : profile?.username}
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/20 backdrop-blur-sm border border-white/30 text-white capitalize">
                  {profile?.role}
                </span>
              </div>
              <p className="text-sky-100 text-sm mt-1">{profile?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/store"
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium border border-white/20 backdrop-blur-sm transition"
            >
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Navigation Sidebar */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-2xl p-3 border border-sky-100 shadow-sm space-y-1 sticky top-24">
              <button
                onClick={() => setActiveTab('profile')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  activeTab === 'profile'
                    ? 'bg-sky-50 text-sky-700 font-semibold border border-sky-200/80 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <User className={`w-4 h-4 ${activeTab === 'profile' ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>Profile Details</span>
              </button>

              <button
                onClick={() => setActiveTab('orders')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  activeTab === 'orders'
                    ? 'bg-sky-50 text-sky-700 font-semibold border border-sky-200/80 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Package className={`w-4 h-4 ${activeTab === 'orders' ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>Order History</span>
                {orders.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-sky-100 text-sky-700 font-bold">
                    {orders.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('wishlist')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  activeTab === 'wishlist'
                    ? 'bg-sky-50 text-sky-700 font-semibold border border-sky-200/80 shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Heart className={`w-4 h-4 ${activeTab === 'wishlist' ? 'text-sky-600' : 'text-slate-400'}`} />
                <span>Wishlist</span>
                {wishlist.length > 0 && (
                  <span className="ml-auto px-2 py-0.5 text-xs rounded-full bg-rose-100 text-rose-700 font-bold">
                    {wishlist.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="md:col-span-3">
            {/* PROFILE TAB */}
            {activeTab === 'profile' && (
              <div className="bg-white rounded-2xl p-6 md:p-8 border border-sky-100 shadow-sm">
                <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Personal Information</h2>
                    <p className="text-slate-500 text-sm">Update your personal account details and preferences.</p>
                  </div>
                  <ShieldCheck className="w-8 h-8 text-sky-500/40" />
                </div>

                {saveSuccess && (
                  <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <span>{saveSuccess}</span>
                  </div>
                )}

                {error && (
                  <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleUpdateProfile} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">First Name</label>
                      <input
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="e.g. John"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Last Name</label>
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="e.g. Doe"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Username</label>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">Email Address</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 text-sm"
                      />
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={updating}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-medium text-sm transition shadow-md shadow-sky-500/20 disabled:opacity-50"
                    >
                      {updating ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" /> Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ORDERS TAB */}
            {activeTab === 'orders' && (
              <div className="bg-white rounded-2xl p-6 md:p-8 border border-sky-100 shadow-sm">
                <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Your Orders</h2>
                    <p className="text-slate-500 text-sm">Review order history and real-time VietQR fulfillment status.</p>
                  </div>
                  <Package className="w-8 h-8 text-sky-500/40" />
                </div>

                {ordersLoading ? (
                  <div className="py-12 text-center text-slate-500 text-sm">Loading your orders...</div>
                ) : orders.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium mb-1">No orders found</p>
                    <p className="text-slate-400 text-xs mb-4">You haven&apos;t placed any orders with us yet.</p>
                    <Link
                      href="/store"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-semibold hover:bg-sky-600 transition"
                    >
                      Start Shopping
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map((order) => (
                      <div
                        key={order.id}
                        className="p-5 rounded-2xl border border-sky-100 bg-white hover:border-sky-300 transition shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="text-base font-bold text-slate-900">Order #{order.id}</span>
                            {getStatusBadge(order.status)}
                          </div>
                          <p className="text-sm font-medium text-slate-700">{order.product_name}</p>
                          <p className="text-xs text-slate-400">
                            Quantity: {order.quantity} • Total: <span className="font-bold text-sky-700">${order.total_amount?.toFixed(2)}</span>
                          </p>
                        </div>

                        <div className="flex items-center gap-3">
                          <Link
                            href={`/store/orders/${order.id}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs font-semibold transition border border-sky-200/60"
                          >
                            <span>Track Order</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* WISHLIST TAB */}
            {activeTab === 'wishlist' && (
              <div className="bg-white rounded-2xl p-6 md:p-8 border border-sky-100 shadow-sm">
                <div className="flex items-center justify-between pb-6 border-b border-slate-100 mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Saved Wishlist</h2>
                    <p className="text-slate-500 text-sm">Your favorite saved items for quick access.</p>
                  </div>
                  <Heart className="w-8 h-8 text-rose-400/40" />
                </div>

                {wishlist.length === 0 ? (
                  <div className="py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <Heart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-600 font-medium mb-1">Your wishlist is empty</p>
                    <p className="text-slate-400 text-xs mb-4">Save products you love while browsing our store.</p>
                    <Link
                      href="/store"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-semibold hover:bg-sky-600 transition"
                    >
                      Browse Products
                    </Link>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {wishlist.map((item, idx) => (
                      <div key={idx} className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900 text-sm">{item.name || item.title || 'Saved Product'}</p>
                          <p className="text-xs text-sky-600 font-bold">${item.price}</p>
                        </div>
                        <Link
                          href="/store"
                          className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-700 text-xs font-semibold hover:bg-sky-100"
                        >
                          View
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
