import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

it('serializes browser session mutations using the shared lock', async () => {
  let tail = Promise.resolve();
  vi.stubGlobal('navigator', { locks: { request: (_name: string, work: () => Promise<unknown>) => {
    const next = tail.then(work); tail = next.then(() => undefined); return next;
  } } });
  const { withSessionLock } = await import('../lib/session-lock');
  const events: string[] = [];
  await Promise.all([
    withSessionLock(async () => { events.push('start'); await Promise.resolve(); events.push('end'); }),
    withSessionLock(async () => { events.push('logout'); }),
  ]);
  expect(events).toEqual(['start', 'end', 'logout']);
});

it('supports browsers without Web Locks', async () => {
  vi.stubGlobal('navigator', {});
  const { withSessionLock } = await import('../lib/session-lock');
  await expect(withSessionLock(async () => 42)).resolves.toBe(42);
});
