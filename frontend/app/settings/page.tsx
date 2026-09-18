'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiGet, apiPut } from '@/lib/api';
import { User } from '@/lib/types';
import { UserCheck, KeyRound, Store, Bell, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // States cho Form Thông tin tài khoản
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');

  // States cho Form Mật khẩu
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // States cho Form Cấu hình Store (lưu LocalStorage)
  const [storeName, setStoreName] = useState('My eCommerce Store');
  const [currency, setCurrency] = useState('USD');

  // Load thông tin User đăng nhập
  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        const user = await apiGet<User>('/users/me');
        setFirstName(user.first_name || '');
        setLastName(user.last_name || '');
        setEmail(user.email || '');
        setUsername(user.username || '');

        // Load store settings từ localStorage nếu có
        const savedStore = localStorage.getItem('store_settings');
        if (savedStore) {
          const parsed = JSON.parse(savedStore);
          setStoreName(parsed.storeName || 'My eCommerce Store');
          setCurrency(parsed.currency || 'USD');
        }
      } catch (err) {
        console.error('Failed to load user settings', err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Show thông báo tạm thời
  const triggerNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // 1. Submit đổi thông tin cá nhân
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiPut('/users/me', {
        first_name: firstName,
        last_name: lastName,
        email,
        username,
      });
      triggerNotification('success', 'Profile information updated successfully!');
      // Refresh trang để cập nhật Header
      window.location.reload();
    } catch (err: any) {
      triggerNotification('error', err.message || 'Failed to update profile.');
    }
  };

  // 2. Submit đổi mật khẩu
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      triggerNotification('error', 'New passwords do not match!');
      return;
    }
    try {
      await apiPut('/users/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      triggerNotification('success', 'Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      triggerNotification('error', err.message || 'Failed to update password.');
    }
  };

  // 3. Submit lưu cấu hình Store vào LocalStorage
  const handleSaveStoreSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('store_settings', JSON.stringify({ storeName, currency }));
    triggerNotification('success', 'Store configurations saved successfully!');
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50">
      <Header
        title="Settings"
        subtitle="Manage your personal admin account, security credentials, and store configurations"
      />

      <main className="flex-1 p-8 max-w-4xl mx-auto w-full space-y-6">
        {/* Hộp hiển thị thông báo trạng thái */}
        {message && (
          <div
            className={`flex items-center gap-3 p-4 rounded-xl border text-sm transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${message.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                : 'bg-rose-50 text-rose-800 border-rose-100'
              }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        {loading ? (
          <Card className="p-12 text-center text-slate-500 border border-slate-100 bg-white">
            <span className="flex flex-col items-center justify-center gap-3">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" />
              <span className="text-sm font-medium text-slate-400">Loading configurations...</span>
            </span>
          </Card>
        ) : (
          <Tabs defaultValue="account" className="w-full">
            <TabsList className="bg-slate-100 p-1 rounded-xl mb-8 flex w-full md:w-auto md:inline-flex border border-slate-200/50">
              <TabsTrigger value="account" className="rounded-lg py-2 px-4 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                <UserCheck className="w-4 h-4 mr-2" /> Account
              </TabsTrigger>
              <TabsTrigger value="security" className="rounded-lg py-2 px-4 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                <KeyRound className="w-4 h-4 mr-2" /> Security
              </TabsTrigger>
              <TabsTrigger value="store" className="rounded-lg py-2 px-4 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                <Store className="w-4 h-4 mr-2" /> Store Settings
              </TabsTrigger>
              <TabsTrigger value="notifications" className="rounded-lg py-2 px-4 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm">
                <Bell className="w-4 h-4 mr-2" /> Notifications
              </TabsTrigger>
            </TabsList>

            {/* 1. Account Tab */}
            <TabsContent value="account">
              <form onSubmit={handleUpdateProfile}>
                <Card className="p-6 border border-slate-100 bg-white shadow-sm rounded-2xl space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-950">Account Information</h3>
                    <p className="text-slate-400 text-xs mt-1">Update your basic login name and active email address</p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">First Name</label>
                        <Input
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Your first name"
                          className="bg-white rounded-xl py-2.5"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Last Name</label>
                        <Input
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Your last name"
                          className="bg-white rounded-xl py-2.5"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Username</label>
                      <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="username"
                        required
                        className="bg-white rounded-xl py-2.5"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Email Address</label>
                      <Input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="yourname@domain.com"
                        required
                        className="bg-white rounded-xl py-2.5"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <Button type="submit" className="rounded-xl px-6 py-2.5 bg-slate-950 text-white hover:bg-slate-900 transition-colors">
                      Save Profile Changes
                    </Button>
                  </div>
                </Card>
              </form>
            </TabsContent>

            {/* 2. Security Tab */}
            <TabsContent value="security">
              <form onSubmit={handleUpdatePassword}>
                <Card className="p-6 border border-slate-100 bg-white shadow-sm rounded-2xl space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-950">Password & Security</h3>
                    <p className="text-slate-400 text-xs mt-1">Safeguard your admin session by updating credentials</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Current Password</label>
                      <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="bg-white rounded-xl py-2.5"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">New Password</label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        required
                        className="bg-white rounded-xl py-2.5"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Confirm New Password</label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        required
                        className="bg-white rounded-xl py-2.5"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <Button type="submit" className="rounded-xl px-6 py-2.5 bg-slate-950 text-white hover:bg-slate-900 transition-colors">
                      Update Password
                    </Button>
                  </div>
                </Card>
              </form>
            </TabsContent>

            {/* 3. Store Tab */}
            <TabsContent value="store">
              <form onSubmit={handleSaveStoreSettings}>
                <Card className="p-6 border border-slate-100 bg-white shadow-sm rounded-2xl space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-slate-950">Store Preferences</h3>
                    <p className="text-slate-400 text-xs mt-1">Configure global variables for the client storefront interface</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Store Branding Name</label>
                      <Input
                        value={storeName}
                        onChange={(e) => setStoreName(e.target.value)}
                        placeholder="e.g. Acme Corporation"
                        required
                        className="bg-white rounded-xl py-2.5"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Default Currency</label>
                      <Input
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        placeholder="e.g. USD, VND, EUR"
                        required
                        className="bg-white rounded-xl py-2.5"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <Button type="submit" className="rounded-xl px-6 py-2.5 bg-slate-950 text-white hover:bg-slate-900 transition-colors">
                      Save Store Configurations
                    </Button>
                  </div>
                </Card>
              </form>
            </TabsContent>

            {/* 4. Notifications Tab */}
            <TabsContent value="notifications">
              <Card className="p-6 border border-slate-100 bg-white shadow-sm rounded-2xl space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-950">Notification Preferences</h3>
                  <p className="text-slate-400 text-xs mt-1">Configure email alerts on order completions and stock alerts</p>
                </div>

                <div className="py-6 border-y border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Email Notifications</p>
                    <p className="text-xs text-slate-400 mt-0.5">Receive alerts when client places pending orders</p>
                  </div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-50 text-slate-600 border">
                    Disabled
                  </span>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
