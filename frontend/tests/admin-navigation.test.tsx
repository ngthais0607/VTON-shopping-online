import { fireEvent,render,screen,waitFor,within } from '@testing-library/react';
import { expect,it,vi } from 'vitest';
import { Sidebar } from '../components/sidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/products', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/hooks/use-session', () => ({ useSession: () => ({ logout: vi.fn() }) }));

it('opens mobile navigation and closes it after choosing a destination', async () => {
  render(<Sidebar />);
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const navigation = await screen.findByRole('dialog', { name: 'Admin navigation' });
  expect(navigation).toBeInTheDocument();
  const ordersLink = within(navigation).getByRole('link', { name: 'Orders' });
  expect(ordersLink).toHaveAttribute('href', '/orders');
  // jsdom cannot navigate; the router owns navigation in the browser.
  ordersLink.addEventListener('click', event => event.preventDefault(), { once: true });
  fireEvent.click(ordersLink);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Admin navigation' })).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Open navigation' })).toHaveFocus();
});
