'use client';

import { useEffect, useState } from 'react';
import { Search, Bell, User, LogOut, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { apiGet } from '@/lib/api';
import { User as UserType } from '@/lib/types';
import Link from 'next/link';

interface HeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

export function Header({ title, subtitle, children }: HeaderProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);

  useEffect(() => {
    async function fetchMe() {
      try {
        const user = await apiGet<UserType>('/users/me');
        setCurrentUser(user);
      } catch (err) {
        console.error('Failed to fetch user info', err);
      }
    }
    fetchMe();
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('token');
    router.push('/login');
    router.refresh();
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    const first = firstName?.charAt(0) || '';
    const last = lastName?.charAt(0) || '';
    return (first + last).toUpperCase() || 'U';
  };

  return (
    <header className="bg-white border-b border-slate-100 sticky top-0 z-40">
      <div className="px-8 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {children}
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Search..."
              className="pl-10 h-10 bg-slate-50 border-slate-200 w-64 rounded-xl"
            />
          </div>

          <Button variant="ghost" size="icon" className="text-slate-600 rounded-xl hover:bg-slate-50">
            <Bell className="w-5 h-5" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full ring-2 ring-slate-100 hover:scale-105 transition-all">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-gradient-to-tr from-indigo-500 to-purple-600 text-white text-xs font-semibold">
                    {currentUser
                      ? getInitials(currentUser.first_name, currentUser.last_name)
                      : 'AD'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1.5 border border-slate-100 rounded-2xl shadow-xl bg-white">
              <div className="px-2 py-2">
                <p className="font-semibold text-slate-900 text-sm">
                  {currentUser
                    ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`
                    : 'Admin User'}
                </p>
                <p className="text-[11px] text-slate-400 font-medium truncate">
                  {currentUser?.email || 'admin@example.com'}
                </p>
              </div>
              <DropdownMenuSeparator className="bg-slate-100" />

              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center w-full px-2 py-2 text-sm text-slate-700 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <User className="mr-2 h-4 w-4 text-slate-400" />
                  Profile & Settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuSeparator className="bg-slate-100" />

              <DropdownMenuItem
                onClick={handleSignOut}
                className="flex items-center w-full px-2 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 focus:bg-red-50 focus:text-red-700 cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4 text-red-400" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
