'use client';

import { useState } from 'react';
import { User, LogOut, ChevronDown, ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useSession } from '@/hooks/use-session';

interface HeaderProps { title: string; subtitle?: string; children?: React.ReactNode; }

export function Header({ title, subtitle, children }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useSession();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const handleSignOut = async () => {
    try { await logout(); router.push('/login'); router.refresh(); }
    catch (error) { setLogoutError(error instanceof Error ? error.message : 'Server logout failed; local session cleared.'); }
  };
  const initials = `${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`.toUpperCase() || 'AD';
  return <header className="border-b border-border bg-white">
    {logoutError && <p role="alert" className="border-b border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{logoutError}</p>}
    <div className="flex min-h-[104px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-10">
      <div className="min-w-0">
        <p className="mb-1.5 flex items-center gap-3 text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground"><span className="h-px w-7 bg-[#B89B6A]" />TrueLook / Administration</p>
        <h1 className="font-display text-[26px] font-normal leading-tight tracking-[-0.02em] text-foreground sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1 max-w-xl text-[13px] leading-snug text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {children}
        <Link href="/store" className="hidden min-h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-secondary xl:inline-flex">View store<ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label="Account menu" className="h-9 gap-2 rounded-md border border-border bg-card px-2">
              <Avatar className="h-6 w-6"><AvatarFallback className="bg-secondary text-[10px] font-semibold text-primary">{initials}</AvatarFallback></Avatar>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 rounded border-border bg-card p-2 shadow-sm">
            <div className="px-2 py-3"><p className="text-sm font-semibold text-foreground">{[user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Administrator'}</p><p className="mt-1 truncate text-xs text-muted-foreground">{user?.email}</p></div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/settings" className="min-h-10 cursor-pointer"><User aria-hidden="true" className="mr-2 h-4 w-4" />Profile &amp; Settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} className="min-h-10 cursor-pointer text-destructive"><LogOut aria-hidden="true" className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </header>;
}
