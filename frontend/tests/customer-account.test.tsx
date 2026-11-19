import { fireEvent,render,screen } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import CustomerAccountPage from '../app/store/account/page';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ apiGet: get, apiPatch: vi.fn() }));
vi.mock('../app/store/components/Header', () => ({ Header: () => null }));
vi.mock('../app/store/components/Footer', () => ({ Footer: () => null }));

beforeEach(() => {
  localStorage.clear();
  get.mockImplementation(async (url: string) => url === '/users/me'
    ? { id: 1, username: 'buyer', first_name: 'An', email: 'an@example.com', role: 'customer' }
    : { items: [{ id: 41, public_code: 'public-order-code', product_name: 'Áo sơ mi', total: 250000, total_amount: 250000, currency: 'VND', quantity: 1, status: 'confirmed' }] });
});

it('shows VND prices and tracks the public order code from account history', async () => {
  render(<CustomerAccountPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Order History/ }));
  expect((await screen.findByText(/250\.000/)).textContent).toContain('₫');
  expect(screen.getByRole('link', { name: /Track Order/ })).toHaveAttribute('href', '/store/orders/public-order-code');
});
