'use client';
import { useSyncExternalStore } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { apiGet, logoutSession } from '@/lib/api';
import { getAccessToken, getSessionGeneration, subscribeSession } from '@/lib/session';
import { User } from '@/lib/types';

export function useSession() {
  const token = useSyncExternalStore(subscribeSession, getAccessToken, () => null);
  const generation = useSyncExternalStore(subscribeSession, getSessionGeneration, () => 0);
  const { mutate } = useSWRConfig();
  const { data, error, isLoading } = useSWR<User, Error>(token ? ['/users/me', generation] : null,
    () => apiGet<User>('/users/me'), { shouldRetryOnError: false });
  const logout = async () => {
    try { await logoutSession(); }
    finally { await mutate(() => true, undefined, { revalidate: false }); }
  };
  return { user: token ? data ?? null : null, error, isLoading, logout };
}
