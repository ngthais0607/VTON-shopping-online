import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, expect, it, vi } from 'vitest';
import { useProducts } from '../hooks/use-products';
import { useCategories } from '../hooks/use-categories';
import { useOrders } from '../hooks/use-orders';
import { useCategoryOptions } from '../hooks/use-categories';
const { get } = vi.hoisted(() => ({get:vi.fn()}));
vi.mock('@/lib/api', () => ({apiGet:get}));
const wrapper = ({children}:{children:React.ReactNode}) => <SWRConfig value={{provider:()=>new Map(),dedupingInterval:0,shouldRetryOnError:false}}>{children}</SWRConfig>;
beforeEach(() => {get.mockReset();});
it('sends supported sort and offset parameters', async () => {
  get.mockResolvedValue({items:[],total:30,limit:10,offset:10});
  const {result} = renderHook(()=>useProducts({page:2,pageSize:10,sort_by:'price_asc'}),{wrapper});
  await waitFor(()=>expect(result.current.total).toBe(30));
  expect(get.mock.calls[0][0]).toBe('/products?limit=10&offset=10&sort=price_asc');
  expect(result.current.page).toBe(2);
});
it('unwraps category and order pages', async () => {
  get.mockImplementation((url:string)=>Promise.resolve({items:[{id:url.startsWith('/categories')?7:11}],total:31,limit:10,offset:0}));
  const categories = renderHook(()=>useCategories(),{wrapper});
  const orders = renderHook(()=>useOrders(),{wrapper});
  await waitFor(()=>expect(categories.result.current.categories).toEqual([{id:7}]));
  expect(orders.result.current.orders).toEqual([{id:11}]);
});
it('exposes request failure rather than manufacturing successful rows', async () => {
  get.mockRejectedValue(new Error('Offline'));
  const {result} = renderHook(()=>useCategories(),{wrapper});
  await waitFor(()=>expect(result.current.isError).toBe(true));
  expect(result.current.error.message).toBe('Offline');
});
it('loads selector options beyond one server page', async () => {
  get.mockImplementation((url:string) => Promise.resolve(url.endsWith('offset=0')
    ? {items:Array.from({length:100},(_,i)=>({id:i+1})),total:101,limit:100,offset:0}
    : {items:[{id:101}],total:101,limit:100,offset:100}));
  const {result} = renderHook(()=>useCategoryOptions(),{wrapper});
  await waitFor(()=>expect(result.current.categories).toHaveLength(101));
  expect(get.mock.calls.map(call=>call[0])).toEqual(['/categories?limit=100&offset=0','/categories?limit=100&offset=100']);
});
it('reports a failed second selector page instead of returning partial options', async () => {
  get.mockResolvedValueOnce({items:[{id:1}],total:2,limit:100,offset:0}).mockRejectedValueOnce(new Error('Second page unavailable'));
  const {result} = renderHook(()=>useCategoryOptions(),{wrapper});
  await waitFor(()=>expect(result.current.error?.message).toBe('Second page unavailable'));
  expect(result.current.categories).toEqual([]);
});
