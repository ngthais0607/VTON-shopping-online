'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, Package, FolderOpen, ShoppingCart, Users, Settings, LogOut, Menu, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Categories', href: '/categories', icon: FolderOpen },
  { name: 'Orders', href: '/orders', icon: ShoppingCart },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useSession();
  const [open, setOpen] = useState(false);
  const handleLogout = async () => {
    try { await logout(); router.push('/login'); router.refresh(); }
    catch { /* The shared session notice survives the layout unmounting. */ }
  };
  const content = (mobile = false) => <>
    <Link href="/dashboard" onClick={() => setOpen(false)} className="block border-b border-border px-7 pb-8 pt-10">
      <span className="font-display text-[38px] font-normal leading-none tracking-[-0.035em] text-foreground">TrueLook<span className="ml-1 align-top text-sm text-[#B89B6A]">®</span></span>
      <span className="mt-3 block text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">The administration atelier</span>
    </Link>
    <nav aria-label={mobile ? 'Mobile admin' : 'Admin'} className="flex-1 space-y-2 overflow-y-auto px-4 py-8">
      <p className="mb-5 px-3 text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Manage your store</p>
      {navigation.map(({ name, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? 'page' : undefined}
          className={cn('flex min-h-12 items-center gap-3 border-l-2 px-3 py-3 text-[13px] font-medium transition-colors', active ? 'border-[#B89B6A] bg-[#F1ECE4] text-foreground' : 'border-transparent text-muted-foreground hover:bg-[#F1ECE4]/60 hover:text-foreground')}>
          <Icon aria-hidden="true" className="h-[18px] w-[18px]" />{name}
        </Link>;
      })}
    </nav>
    <div className="space-y-2 border-t border-border p-3">
      <Link href="/store" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-between rounded-md px-3 py-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground">View storefront<ArrowUpRight aria-hidden="true" className="h-4 w-4" /></Link>
      <button onClick={handleLogout} className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"><LogOut aria-hidden="true" className="h-4 w-4" />Log Out</button>
    </div>
  </>;
  return <>
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-[#FAF8F5] lg:flex">{content()}</aside>
    <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur lg:hidden">
      <Link href="/dashboard" className="font-display text-3xl font-normal tracking-[-0.035em]">TrueLook<span className="ml-3 font-sans text-[9px] font-medium uppercase tracking-widest text-muted-foreground">Admin</span></Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><button aria-label="Open navigation" className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-card"><Menu aria-hidden="true" className="h-5 w-5" /></button></DialogTrigger>
        <DialogContent className="inset-y-0 left-0 flex h-dvh w-[min(20rem,90vw)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-y-0 border-l-0 bg-card p-0 sm:max-w-none">
          <DialogTitle className="sr-only">Admin navigation</DialogTitle>
          <DialogDescription className="sr-only">Navigate your TrueLook store administration workspace.</DialogDescription>
          {content(true)}
        </DialogContent>
      </Dialog>
    </div>
  </>;
}
