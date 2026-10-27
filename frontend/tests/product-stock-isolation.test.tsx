/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProductsPage from '../app/products/page';

const { post, patch, productState, categoryState } = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  productState: { error: null as Error | null, products: [] as any[], total: 0 },
  categoryState: { error: null as Error | null },
}));

vi.mock('@/lib/api', () => ({
  apiUpload: vi.fn(),
  apiPost: post,
  apiPatch: patch,
  apiPut: patch,
  apiDelete: vi.fn(),
}));

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: any) => <>{children}</>,
  DropdownMenuContent: ({ children }: any) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

vi.mock('@/hooks/use-products', () => ({
  useProducts: () => ({ isLoading: false, mutate: async () => {}, ...productState }),
}));

vi.mock('@/hooks/use-categories', () => ({
  useCategoryOptions: () => ({ categories: [], mutate: async () => {}, ...categoryState }),
}));

vi.mock('@/components/header', () => ({ Header: () => null }));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

describe('Product Stock Isolation in Admin UI', () => {
  const existingProduct = {
    id: 12,
    name: 'Silk Shirt',
    price: 350000,
    currency: 'VND',
    stock_quantity: 40,
    reserved_quantity: 5,
    sold_quantity: 10,
    is_active: true,
    category: null,
    images: [],
    variants: [
      {
        id: 101,
        product_id: 12,
        sku: 'SILK-WHT-S',
        size: 'S',
        color_name: 'White',
        color_hex: '#ffffff',
        price: 350000,
        stock_quantity: 20,
        reserved_quantity: 2,
        sold_quantity: 5,
        is_active: true,
      },
    ],
    created_at: null,
    updated_at: null,
  };

  beforeEach(() => {
    productState.error = null;
    productState.products = [existingProduct];
    productState.total = 1;
    categoryState.error = null;
    post.mockReset();
    patch.mockReset();
  });

  it('create product form has no stock_quantity input and omits inventory fields from payload', async () => {
    post.mockResolvedValue({ id: 13, name: 'New Dress', price: 500000 });
    render(<ProductsPage />);

    // Click Create Product trigger button
    const triggerButtons = screen.getAllByRole('button', { name: /Create Product/i });
    fireEvent.click(triggerButtons[0]);

    // Verify modal opened
    expect(screen.getByRole('heading', { name: 'Create New Product' })).toBeInTheDocument();

    // Verify no stock_quantity input
    expect(screen.queryByLabelText(/stock/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/tồn kho/i)).not.toBeInTheDocument();

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/Product Name/i), { target: { value: 'New Dress' } });
    fireEvent.change(screen.getByLabelText(/Price/i), { target: { value: '500000' } });

    // Submit form (inside dialog)
    const submitBtn = screen.getByRole('button', { name: 'Create Product' });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [endpoint, payload] = post.mock.calls[0];
    expect(endpoint).toBe('/products');
    expect(payload).not.toHaveProperty('stock_quantity');
    expect(payload).not.toHaveProperty('reserved_quantity');
    expect(payload).not.toHaveProperty('sold_quantity');
    expect(payload.name).toBe('New Dress');
    expect(payload.price).toBe(500000);
  });

  it('edit product form has no stock input and omits inventory fields from patch payload', async () => {
    patch.mockResolvedValue({ ...existingProduct, name: 'Updated Silk Shirt' });
    render(<ProductsPage />);

    // Open Edit modal via table action button
    fireEvent.click(screen.getByRole('button', { name: 'Edit Product' }));

    expect(screen.getByRole('heading', { name: 'Edit Product' })).toBeInTheDocument();

    // Verify no editable stock input in the form
    expect(screen.queryByLabelText(/stock/i)).not.toBeInTheDocument();

    // Change name
    fireEvent.change(screen.getByLabelText(/Product Name/i), {
      target: { value: 'Updated Silk Shirt' },
    });

    // Submit update
    fireEvent.click(screen.getByRole('button', { name: 'Update Product' }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    const [endpoint, payload] = patch.mock.calls[0];
    expect(endpoint).toBe(`/products/${existingProduct.id}`);
    expect(payload).not.toHaveProperty('stock_quantity');
    expect(payload).not.toHaveProperty('reserved_quantity');
    expect(payload).not.toHaveProperty('sold_quantity');
    expect(payload.name).toBe('Updated Silk Shirt');
  });
});
