import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { QuickStatusModal, getNextStatuses } from '../app/orders/components/quick-status-modal';
import type { Order } from '../lib/types';

const { put } = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock('@/lib/api', () => ({ apiPut: put }));
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: vi.fn() }) }));

const order = (patch: Partial<Order>) => ({
  id: 5, user_id: 1, total: 1, total_amount: 1, currency: 'VND', status: 'confirmed',
  payment_method: 'cod', payment_status: 'unpaid', customer_name: 'A', customer_phone: '1',
  shipping_address: 'x', notes: null, expires_at: null, paid_at: null, created_at: null, ...patch,
}) as Order;

beforeEach(() => { put.mockClear(); });

it('lists only the transitions the backend allows', () => {
  expect(getNextStatuses(order({ status: 'confirmed' }))).toEqual(['paid', 'shipped', 'cancelled']);
  expect(getNextStatuses(order({ payment_method: 'vietqr', status: 'pending' }))).toEqual(['paid', 'cancelled', 'expired']);
  expect(getNextStatuses(order({ status: 'cancelled' }))).toEqual([]);
  expect(getNextStatuses(order({ status: 'expired', payment_method: 'vietqr' }))).toEqual([]);
});

it('offers forward steps and hides invalid ones', () => {
  render(<QuickStatusModal order={order({ status: 'confirmed' })} isOpen onClose={() => {}} onStatusUpdated={() => {}} />);
  expect(screen.getByRole('button', { name: /Mark as shipped/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Mark as delivered/ })).not.toBeInTheDocument();
});

it('updates the status and closes', async () => {
  put.mockResolvedValue({});
  const updated = vi.fn();
  const closed = vi.fn();
  render(<QuickStatusModal order={order({ status: 'confirmed' })} isOpen onClose={closed} onStatusUpdated={updated} />);
  fireEvent.click(screen.getByRole('button', { name: /Mark as shipped/ }));
  await waitFor(() => expect(updated).toHaveBeenCalled());
  expect(put).toHaveBeenCalledWith('/orders/5/status', { status: 'shipped' });
  expect(closed).toHaveBeenCalled();
});

it('requires confirmation before cancelling', async () => {
  put.mockResolvedValue({});
  render(<QuickStatusModal order={order({ status: 'confirmed' })} isOpen onClose={() => {}} onStatusUpdated={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
  expect(put).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel order' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/orders/5/status', { status: 'cancelled' }));
});

it('shows a final state message for cancelled orders', () => {
  render(<QuickStatusModal order={order({ status: 'cancelled' })} isOpen onClose={() => {}} onStatusUpdated={() => {}} />);
  expect(screen.getByText(/can no longer be changed/)).toBeInTheDocument();
});

it('shows the server error in an alert', async () => {
  put.mockRejectedValue(new Error('Not enough stock'));
  render(<QuickStatusModal order={order({ status: 'confirmed' })} isOpen onClose={() => {}} onStatusUpdated={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /Mark as paid/ }));
  await waitFor(() => expect(put).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryAllByRole('alert')).toHaveLength(1));
  expect(screen.getByRole('alert')).toHaveTextContent('Not enough stock');
});
