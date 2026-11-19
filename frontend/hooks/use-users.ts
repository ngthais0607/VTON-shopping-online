"use client";
import { PageParams,pageOffset } from '@/lib/pagination';
import { swrFetcher } from '@/lib/swr-config';
import { Page,User } from '@/lib/types';
import useSWR from 'swr';
export function useUsers(params: PageParams = {}) {
  const page = params.page ?? 1, limit = params.pageSize ?? 20;
  const query = new URLSearchParams({limit: String(limit), offset: String(pageOffset(page, limit))});
  if (params.search) query.set('search', params.search);
  const {data, error, isLoading, mutate} = useSWR<Page<User>>(`/users?${query}`, swrFetcher);
  return {users: data?.items ?? [], total: data?.total ?? 0, page, limit, isLoading, isError: !!error, error, mutate};
}
