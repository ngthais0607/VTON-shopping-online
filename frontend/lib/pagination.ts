import { apiGet } from './api';
import { Page } from './types';
export interface PageParams { page?: number; pageSize?: number; search?: string }
export const pageOffset = (page: number, pageSize: number): number => (Math.max(1, page) - 1) * pageSize;
export async function fetchAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (;;) {
    const page = await apiGet<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${items.length}`);
    items.push(...page.items);
    if (items.length >= page.total || page.items.length === 0) return items;
  }
}
