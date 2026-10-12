"use client";
import { useEffect, useSyncExternalStore } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { useSession } from '@/hooks/use-session';
import { ApiError } from '@/lib/api';
import { getSessionNotice, subscribeSession } from '@/lib/session';
export function LayoutClientWrapper({ children }: { children: React.ReactNode }) {
  const notice = useSyncExternalStore(subscribeSession, getSessionNotice, () => null);
  return <>{notice && <p role="alert" className="p-4 bg-amber-50">{notice}</p>}<GuardedLayout>{children}</GuardedLayout></>;
}
function GuardedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const {user, isLoading, error} = useSession();
  const isAuth = pathname === '/login' || pathname === '/register';
  const customerPage = pathname === '/store/checkout' || pathname === '/store/account' || pathname.startsWith('/store/orders');
  const isPublic = pathname === '/' || isAuth || (pathname.startsWith('/store') && !customerPage);
  const adminPage = !isPublic && !customerPage;
  useEffect(() => {
    if (isLoading) return;
    if (!user && !isPublic && (!error || (error instanceof ApiError && error.status === 401))) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (user && adminPage && user.role !== 'admin') router.replace('/store');
    else if (user && isAuth) {
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next?.startsWith('/store/') && !next.includes('\\') ? next : user.role === 'admin' ? '/dashboard' : '/store');
    }
  }, [user, isLoading, error, isPublic, adminPage, isAuth, pathname, router]);
  if (!isPublic && error && !(error instanceof ApiError && error.status === 401)) {
    return <div role="alert" className="p-8">{error.message} <button onClick={() => window.location.reload()}>Retry</button></div>;
  }
  if (!isPublic && (isLoading || !user || (adminPage && user.role !== 'admin'))) return <div className="p-8">Verifying access...</div>;
  if (adminPage) return <div className="flex min-h-screen bg-slate-50"><Sidebar/><div className="flex-1 overflow-x-hidden">{children}</div></div>;
  return <div className="w-full min-h-screen bg-slate-50">{children}</div>;
}
