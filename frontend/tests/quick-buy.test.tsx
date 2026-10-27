import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { FeaturedProducts } from '@/app/store/components/FeaturedProducts';
import { CartProvider } from '@/app/store/context/CartContext';
import type { Product, User } from '@/lib/types';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams() }));
vi.mock('@/lib/api', () => ({ apiGet: vi.fn().mockResolvedValue({}) }));
vi.mock('swr', () => ({ default: () => ({ data: undefined }) }));
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  unobserve() {}
  disconnect() {}
});

// Public catalog DTOs deliberately omit admin inventory fields and variants.
const catalogProduct: Omit<Product, 'stock_quantity' | 'reserved_quantity' | 'sold_quantity'> = {
  id: 101, slug: 'ao-oxford', name: 'Oxford', price: 250000,
  currency: 'VND', available_stock: 5, is_active: true, images: [],
  description: null, created_at: null, updated_at: null, category: null,
};

it.each([null, { id: 123, role: 'customer' } as User])('opens variant selection from a catalog summary (user %j)', (user) => {
  push.mockClear();
  const noop = vi.fn();
  render(<CartProvider><FeaturedProducts
    products={[catalogProduct as Product]}
    currentUser={user} loading={false} onOrderSuccess={noop}
    currentPage={1} pageSize={12} totalProducts={1} setCurrentPage={noop}
    selectedCategory="All" setSelectedCategory={noop} searchQuery="" setSearchQuery={noop}
    minPrice={null} setMinPrice={noop} maxPrice={null} setMaxPrice={noop}
    stockStatus={null} setStockStatus={noop} sortBy={null} setSortBy={noop} categories={[]}
  /></CartProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Quick Buy' }));
  expect(push).toHaveBeenCalledExactlyOnceWith('/store/products/ao-oxford');
  expect(screen.queryByRole('button', { name: /^Purchase/ })).not.toBeInTheDocument();
});
