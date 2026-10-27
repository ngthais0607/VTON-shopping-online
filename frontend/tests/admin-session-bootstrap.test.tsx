import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { LayoutClientWrapper } from '../components/layout-client-wrapper';
const { replace, refresh } = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/categories', useRouter: () => ({ replace }) }));
vi.mock('@/components/sidebar', () => ({ Sidebar: () => null }));
vi.mock('@/hooks/use-session', () => ({ useSession: () => ({ user: null, isLoading: false, error: null }) }));
vi.mock('@/lib/session', () => ({ getAccessToken: () => null, getSessionNotice: () => null, subscribeSession: () => () => {} }));
vi.mock('@/lib/api', () => ({ silentRefresh: refresh, ApiError: class extends Error {} }));

it('waits for the refresh cookie check before redirecting a freshly opened admin page', async () => {
  let finish!: () => void;
  refresh.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
  render(<LayoutClientWrapper><div>Private content</div></LayoutClientWrapper>);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(replace).not.toHaveBeenCalled();
  await act(async () => finish());
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/login?next=%2Fcategories'));
});
