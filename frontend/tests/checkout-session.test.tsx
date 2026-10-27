/* eslint-disable @next/next/no-img-element */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CheckoutPage from '../app/store/checkout/page';
import { setAccessToken, clearAccessToken } from '../lib/session';
const { get } = vi.hoisted(() => ({get:vi.fn()}));
vi.mock('@/lib/api', () => ({apiGet:get, apiPost:vi.fn(), logoutSession:vi.fn()}));
vi.mock('next/navigation', () => ({useRouter:() => ({push:vi.fn()})}));
vi.mock('../app/store/components/Header', () => ({Header:() => null}));
vi.mock('../app/store/components/Footer', () => ({Footer:() => null}));
vi.mock('../app/store/context/CartContext', () => ({useCart:() => ({cartItems:[{productId:1,variantId:1,quantity:1,product:{name:'Shirt',price:100,currency:'VND',images:[]}}],totalAmount:100,clearCart:vi.fn(),isLoaded:true})}));
vi.mock('next/image', () => ({default:({src,alt}:{src:string;alt:string}) => <img src={src} alt={alt}/> }));

beforeEach(() => {
  localStorage.clear();
  act(() => clearAccessToken());
  get.mockReset();
  get.mockResolvedValue({id:1,username:'buyer',email:'buyer@example.com',first_name:'Session Buyer',last_name:null,role:'customer',created_at:null,updated_at:null});
});
afterEach(() => { act(() => clearAccessToken()); });
function checkout() {
  return render(<SWRConfig value={{provider:() => new Map(),dedupingInterval:0}}><CheckoutPage/></SWRConfig>);
}

it('prefills the name from an in-memory authenticated session', async () => {
  act(() => setAccessToken('in-memory-token'));
  checkout();
  await waitFor(() => expect(screen.getByPlaceholderText('John Doe')).toHaveValue('Session Buyer'));
  expect(get).toHaveBeenCalledWith('/users/me');
});

it('does not request the user when no session exists', async () => {
  checkout();
  await act(async () => {});
  expect(screen.getByPlaceholderText('John Doe')).toHaveValue('');
  expect(get).not.toHaveBeenCalledWith('/users/me');
});

it('reacts to login after checkout has mounted', async () => {
  checkout();
  act(() => { setAccessToken('new-session-token'); });
  await waitFor(() => expect(screen.getByPlaceholderText('John Doe')).toHaveValue('Session Buyer'));
});
