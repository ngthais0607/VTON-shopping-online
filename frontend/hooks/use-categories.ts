"use client";
import useSWR from 'swr';
import { swrFetcher } from '@/lib/swr-config';
import { Category, Page } from '@/lib/types';
import { PageParams, pageOffset, fetchAllPages } from '@/lib/pagination';
export function useCategories(params: PageParams = {}) {
  const page = params.page ?? 1, limit = params.pageSize ?? 20;
  const query = new URLSearchParams({limit: String(limit), offset: String(pageOffset(page, limit))});
  if (params.search) query.set('search', params.search);
  const {data, error, isLoading, mutate} = useSWR<Page<Category>>(`/categories?${query}`, swrFetcher);
  return {categories: data?.items ?? [], total: data?.total ?? 0, page, limit, isLoading, isError: !!error, error, mutate};
}
export function useCategoryOptions() {
  const {data, error, isLoading, mutate} = useSWR<Category[]>('/category-options', () => fetchAllPages<Category>('/categories'));
  return {categories:data ?? [], error, isLoading, mutate};
}
