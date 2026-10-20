import { afterEach, expect, it, vi } from 'vitest';

function token(sid: string, revision: number, started = 100) {
  return `${btoa('{}')}.${btoa(JSON.stringify({ sub: '1', sid, sv: revision, session_started_at: started }))}.signature`;
}
afterEach(async () => {
  const session = await import('../lib/session');
  session.getAuthChannel()?.close();
  vi.resetModules();
});

it('accepts newer peer renewal but ignores replay after logout', async () => {
  const session = await import('../lib/session');
  const sid = 'a'.repeat(32);
  session.setAccessToken(token(sid, 0));
  const peer = new BroadcastChannel('truelook_auth_sync');
  const epoch = localStorage.getItem('truelook_auth_epoch');
  peer.postMessage({ type: 'RENEW', token: token(sid, 1), epoch });
  await vi.waitFor(() => expect(session.getAccessToken()).toBe(token(sid, 1)));
  session.clearAccessToken();
  peer.postMessage({ type: 'RENEW', token: token(sid, 2), epoch });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(session.getAccessToken()).toBeNull();
  peer.close();
});

it('does not let a delayed logout erase a newer account session', async () => {
  const session = await import('../lib/session');
  session.setAccessToken(token('b'.repeat(32), 0, 200));
  const peer = new BroadcastChannel('truelook_auth_sync');
  peer.postMessage({ type: 'LOGOUT', sid: 'a'.repeat(32), started: 100 });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(session.getAccessToken()).toBe(token('b'.repeat(32), 0, 200));
  peer.close();
});
