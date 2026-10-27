"use client";
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { useSession } from '@/hooks/use-session';
import { ApiError, silentRefresh } from '@/lib/api';
import { getAccessToken, getSessionNotice, subscribeSession } from '@/lib/session';
export function LayoutClientWrapper({ children }: { children: React.ReactNode }) {
  const notice = useSyncExternalStore(subscribeSession, getSessionNotice, () => null);
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    const restore = getAccessToken() ? Promise.resolve() : silentRefresh().catch(() => {});
    restore.finally(() => { if (mounted) setSessionReady(true); });
    return () => { mounted = false; };
  }, []);
  return <>{notice && <p role="alert" className="p-4 bg-amber-50">{notice}</p>}<GuardedLayout sessionReady={sessionReady}>{children}</GuardedLayout></>;
}
function GuardedLayout({ children, sessionReady }: { children: React.ReactNode; sessionReady: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const {user, isLoading, error} = useSession();
  const isAuth = pathname === '/login' || pathname === '/register';
  const customerPage = pathname === '/store/checkout' || pathname === '/store/account' || pathname.startsWith('/store/orders');
  const isPublic = pathname === '/' || isAuth || (pathname.startsWith('/store') && !customerPage);
  const adminPage = !isPublic && !customerPage;
  useEffect(() => {
    if (!sessionReady || isLoading) return;
    if (!user && !isPublic && (!error || (error instanceof ApiError && error.status === 401))) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (user && adminPage && user.role !== 'admin') router.replace('/store');
    else if (user && isAuth) {
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next?.startsWith('/store/') && !next.includes('\\') ? next : user.role === 'admin' ? '/dashboard' : '/store');
    }
  }, [user, isLoading, error, isPublic, adminPage, isAuth, pathname, router, sessionReady]);
  if (!isPublic && error && !(error instanceof ApiError && error.status === 401)) {
    return <div role="alert" className="p-8">{error.message} <button onClick={() => window.location.reload()}>Retry</button></div>;
  }
  if (!isPublic && (!sessionReady || isLoading || !user || (adminPage && user.role !== 'admin'))) return <div className="p-8">Verifying access...</div>;
  if (adminPage) return <div className="flex min-h-screen bg-slate-50"><Sidebar/><div className="flex-1 overflow-x-hidden">{children}</div></div>;
  return <div className="w-full min-h-screen bg-slate-50">{children}</div>;
}
