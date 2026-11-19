'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { Header } from '@/components/header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { logoutSession } from '@/lib/api';
import { registerSchema } from '@/lib/validations/auth';
import { apiGet, apiPatch } from '@/lib/api';
import { User } from '@/lib/types';
import { UserCheck, KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SettingsPage() {
  const { mutate } = useSWRConfig();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'profile' | 'password' | null>(null);
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

  // Load thông tin User đăng nhập
  const loadSettings = useCallback(async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const user = await apiGet<User>('/users/me');
        setFirstName(user.first_name || '');
        setLastName(user.last_name || '');
        setEmail(user.email || '');
        setUsername(user.username || '');

      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load user settings');
      } finally {
        setLoading(false);
      }
  }, []);
  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Show thông báo tạm thời
  const triggerNotification = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // 1. Submit đổi thông tin cá nhân
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving('profile');
    try {
      await apiPatch('/users/me', {
        first_name: firstName,
        last_name: lastName,
        email,
        username,
      });
      triggerNotification('success', 'Profile information updated successfully!');
      await mutate(key => Array.isArray(key) && key[0] === '/users/me');
    } catch (err: any) {
      triggerNotification('error', err.message || 'Failed to update profile.');
    } finally {
      setSaving(null);
    }
  };

  // 2. Submit đổi mật khẩu
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (newPassword !== confirmPassword) {
      triggerNotification('error', 'New passwords do not match!');
      return;
    }
    setSaving('password');
    try {
      const checked = registerSchema.shape.password.safeParse(newPassword);
      if (!checked.success) throw new Error(checked.error.issues[0]?.message);
      await apiPatch('/users/me/password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
      try { await logoutSession(); } finally { window.location.href = '/login'; }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      triggerNotification('error', err.message || 'Failed to update password.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background/50">
      <Header
        title="Settings"
        subtitle="Manage your profile and password"
      />

      <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
        {/* Hộp hiển thị thông báo trạng thái */}
        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`flex items-center gap-3 p-4 rounded-md border text-sm transition-all animate-in fade-in slide-in-from-top-4 duration-300 ${message.type === 'success'
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
          <Card className="p-12 text-center text-muted-foreground border border-border bg-white">
            <span className="flex flex-col items-center justify-center gap-3">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
              <span className="text-sm font-medium text-muted-foreground">Loading configurations...</span>
            </span>
          </Card>
        ) : loadError ? (
          <Card className="space-y-4 p-6"><p role="alert" className="text-sm text-destructive">{loadError}</p><Button variant="outline" onClick={() => void loadSettings()}>Retry settings</Button></Card>
        ) : (
          <Tabs defaultValue="account" className="w-full">
            <TabsList className="bg-secondary p-1 rounded-md mb-8 flex w-full md:w-auto md:inline-flex border border-border/50">
              <TabsTrigger value="account" className="rounded py-2 px-4 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-none">
                <UserCheck className="w-4 h-4 mr-2" /> Account
              </TabsTrigger>
              <TabsTrigger value="security" className="rounded py-2 px-4 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-none">
                <KeyRound className="w-4 h-4 mr-2" /> Security
              </TabsTrigger>
            </TabsList>

            {/* 1. Account Tab */}
            <TabsContent value="account">
              <form onSubmit={handleUpdateProfile}>
                <Card className="p-6 border border-border bg-white shadow-none rounded space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Account Information</h3>
                    <p className="text-muted-foreground text-xs mt-1">Update your basic login name and active email address</p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label htmlFor="settings-first-name" className="text-xs font-semibold text-foreground">First Name</label>
                        <Input
                          id="settings-first-name" autoComplete="given-name" value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          placeholder="Your first name"
                          className="bg-white rounded-md py-2.5"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="settings-last-name" className="text-xs font-semibold text-foreground">Last Name</label>
                        <Input
                          id="settings-last-name" autoComplete="family-name" value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          placeholder="Your last name"
                          className="bg-white rounded-md py-2.5"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="settings-username" className="text-xs font-semibold text-foreground">Username</label>
                      <Input
                        id="settings-username" autoComplete="username" value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="username"
                        required
                        className="bg-white rounded-md py-2.5"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="settings-email" className="text-xs font-semibold text-foreground">Email Address</label>
                      <Input
                        type="email"
                        id="settings-email" autoComplete="email" value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="yourname@domain.com"
                        required
                        className="bg-white rounded-md py-2.5"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <Button type="submit" disabled={saving !== null} className="rounded-md px-6 py-2.5 bg-primary text-white hover:bg-primary/90 transition-colors">
                      {saving === 'profile' ? 'Saving...' : 'Save Profile Changes'}
                    </Button>
                  </div>
                </Card>
              </form>
            </TabsContent>

            {/* 2. Security Tab */}
            <TabsContent value="security">
              <form onSubmit={handleUpdatePassword}>
                <Card className="p-6 border border-border bg-white shadow-none rounded space-y-6">
                  <div>
                    <h3 className="text-base font-bold text-foreground">Password & Security</h3>
                    <p className="text-muted-foreground text-xs mt-1">Safeguard your admin session by updating credentials</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="settings-current-password" className="text-xs font-semibold text-foreground">Current Password</label>
                      <Input
                        type="password"
                        id="settings-current-password" autoComplete="current-password" value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="bg-white rounded-md py-2.5"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="settings-new-password" className="text-xs font-semibold text-foreground">New Password</label>
                      <Input
                        type="password"
                        id="settings-new-password" autoComplete="new-password" value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        required
                        className="bg-white rounded-md py-2.5"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="settings-confirm-password" className="text-xs font-semibold text-foreground">Confirm New Password</label>
                      <Input
                        type="password"
                        id="settings-confirm-password" autoComplete="new-password" value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        required
                        className="bg-white rounded-md py-2.5"
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border">
                    <Button type="submit" disabled={saving !== null} className="rounded-md px-6 py-2.5 bg-primary text-white hover:bg-primary/90 transition-colors">
                      {saving === 'password' ? 'Updating...' : 'Update Password'}
                    </Button>
                  </div>
                </Card>
              </form>
            </TabsContent>

          </Tabs>
        )}
      </main>
    </div>
  );
}
