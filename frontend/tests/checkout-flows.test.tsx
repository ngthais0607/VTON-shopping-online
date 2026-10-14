/* Test image double avoids the Next.js image optimizer in jsdom. */
/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import CheckoutPage from '../app/store/checkout/page';
import { CartProvider } from '../app/store/context/CartContext';
const {post,get,push} = vi.hoisted(()=>({post:vi.fn(),get:vi.fn(),push:vi.fn()}));
vi.mock('@/lib/api',()=>({apiPost:post,apiGet:get}));
vi.mock('next/navigation',()=>({useRouter:()=>({push,replace:push})}));
vi.mock('../app/store/components/Header',()=>({Header:()=>null}));
vi.mock('../app/store/components/Footer',()=>({Footer:()=>null}));
vi.mock('next/image',()=>({default:({src,alt}:{src:string;alt:string})=><img src={src} alt={alt}/>}));
const variant = { id: 101, sku: 'TEST-1', size: 'ONE_SIZE', color_name: 'Default', price: 25, stock_quantity: 10, is_active: true };
const product = { id: 1, name: 'Test product', price: 25, description: null, created_at: null, updated_at: null, stock_quantity: 10, reserved_quantity: 0, sold_quantity: 0, currency: 'USD', is_active: true, category: null, images: [], variants: [variant] };
const order = { id: 11, user_id: 1, product_id: 1, product_name: 'Test product', unit_price: 25, quantity: 1, total: 25, total_amount: 25, currency: 'USD', status: 'confirmed', payment_method: 'cod', payment_status: 'pending', customer_name: 'Customer', customer_phone: '0987654321', shipping_address: '123 Test Street', notes: null, expires_at: null, paid_at: null, created_at: null };
beforeEach(() => {
  post.mockReset();
  push.mockReset();
  get.mockImplementation((url: string) => {
    if (url === '/users/me') {
      return Promise.resolve({ id: 1, username: 'customer', email: 'customer@example.com', first_name: 'Customer', last_name: null, role: 'customer', created_at: null, updated_at: null });
    }
    if (typeof url === 'string' && url.startsWith('/products/variants/lookup')) {
      return Promise.resolve([{
        id: 101,
        product_id: 1,
        product_name: 'Test product',
        sku: 'TEST-1',
        size: 'ONE_SIZE',
        color_name: 'Default',
        price: 25,
        stock_quantity: 10,
        reserved_quantity: 0,
        sold_quantity: 0,
        available_stock: 10,
        is_active: true,
        image_url: null,
      }]);
    }
    return Promise.resolve(null);
  });
  localStorage.clear();
  localStorage.setItem('token', 'test');
  localStorage.setItem('truelook_cart_v2', JSON.stringify([{ productId: 1, variantId: 101, quantity: 1 }]));
});
async function checkoutForm() {
  const { container } = render(<CartProvider><CheckoutPage /></CartProvider>);
  await waitFor(() => expect(screen.getByPlaceholderText('John Doe')).toHaveValue('Customer'));
  fireEvent.change(screen.getByPlaceholderText('+84 987 654 321'), { target: { value: '0987654321' } });
  fireEvent.change(screen.getByPlaceholderText('123 Commerce St, District 1, Ho Chi Minh City'), { target: { value: '123 Test Street' } });
  return container.querySelector('form')!;
}
it('submits once when two submit events occur before the response', async () => {
  let resolve!: (value: unknown) => void;
  post.mockReturnValue(new Promise(r => { resolve = r; }));
  const form = await checkoutForm();
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(post).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ message: 'ok', orders: [order, { ...order, id: 12 }], total_amount: 50, payment_method: 'cod', vietqr: null }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/store/orders/success?order_ids=11,12'));
  expect(JSON.parse(localStorage.getItem('truelook_cart_v2')!)).toEqual([]);
});
it('keeps the cart and entered fields after checkout failure', async () => {
  post.mockRejectedValue(new Error('Insufficient stock'));
  const form = await checkoutForm();
  fireEvent.submit(form);
  await waitFor(() => expect(screen.getByText('Insufficient stock')).toBeInTheDocument());
  expect(JSON.parse(localStorage.getItem('truelook_cart_v2')!)).toHaveLength(1);
  expect(screen.getByPlaceholderText('John Doe')).toHaveValue('Customer');
});
