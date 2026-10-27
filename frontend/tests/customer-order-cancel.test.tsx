import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import CustomerOrdersPage from '../app/store/orders/page';

const { post, get } = vi.hoisted(() => ({ post: vi.fn(async () => ({})), get: vi.fn() }));
vi.mock('@/lib/api', () => ({ apiGet: get, apiPost: post, ApiError: class extends Error {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../app/store/components/Header', () => ({ Header: () => null }));
vi.mock('../app/store/components/Footer', () => ({ Footer: () => null }));

it('lets a customer cancel a confirmed COD order before shipment', async () => {
  const order = { id: 41, public_code: 'demo-cod', status: 'confirmed', payment_method: 'cod', total: 250000, currency: 'VND', product_name: 'Demo shirt', quantity: 1 };
  get.mockImplementation(async (url: string) => url === '/users/me' ? { id: 1 } : { items: [order] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<CustomerOrdersPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel Order' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/41/cancel', {}));
});
