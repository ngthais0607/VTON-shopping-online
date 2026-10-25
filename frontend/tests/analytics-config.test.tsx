import React from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import RootLayout from '@/app/layout';

vi.mock('@vercel/analytics/next', () => ({ Analytics: () => null }));
vi.mock('@/components/layout-client-wrapper', () => ({ LayoutClientWrapper: () => null }));
vi.mock('@/components/sidebar', () => ({ Sidebar: () => null }));

afterEach(() => vi.unstubAllEnvs());

test.each([
  ['production', undefined, false],
  ['production', 'false', false],
  ['production', 'TRUE', false],
  ['production', 'true', true],
  ['development', 'true', false],
])('analytics in %s with flag %s is %s', (mode, flag, enabled) => {
  vi.stubEnv('NODE_ENV', mode);
  vi.stubEnv('NEXT_PUBLIC_ANALYTICS_ENABLED', flag);
  const layout = RootLayout({ children: <div>Shop</div> });
  const body = layout.props.children;
  expect(Boolean(body.props.children[1])).toBe(enabled);
});
