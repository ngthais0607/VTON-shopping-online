import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import Dashboard from '../app/dashboard/page';
import { SWRConfig } from 'swr';
const {get}=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('@/lib/api',()=>({apiGet:get}));
vi.mock('@/components/header',()=>({Header:()=>null}));
vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
it('shows real summary rows without unsupported revenue trends or growth claims',async()=>{
  get.mockImplementation((path:string)=>Promise.resolve(path.endsWith('/metrics')
    ? {total_products:2,active_products:2,low_stock:1,pending_orders:1,revenue:25}
    : path.endsWith('/low-stock-products')
    ? [{id:7,name:'Actual product',stock_quantity:10,reserved_quantity:2,sold_quantity:4,available_stock:4,category:null}]
    : [{id:11,product_name:'Actual order',quantity:1,total:25,currency:'USD',status:'pending',payment_status:'pending',created_at:null}]));
  render(<SWRConfig value={{provider:()=>new Map()}}><Dashboard/></SWRConfig>);
  await waitFor(()=>expect(screen.getByText('Actual product')).toBeInTheDocument());
  expect(screen.getByText('Actual order')).toBeInTheDocument();
  expect(screen.queryByText('+18.4% vs last week')).not.toBeInTheDocument();
  expect(screen.queryByText('Weekly revenue performance trend')).not.toBeInTheDocument();
});
it('renders backend failure as a retryable message without crashing',async()=>{
  get.mockRejectedValue(new Error('Dashboard unavailable'));
  render(<SWRConfig value={{provider:()=>new Map()}}><Dashboard/></SWRConfig>);
  await waitFor(()=>expect(screen.getByText('Dashboard unavailable')).toBeInTheDocument());
  expect(screen.getByRole('button',{name:'Retry'})).toBeInTheDocument();
});
