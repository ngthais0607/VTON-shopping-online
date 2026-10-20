import { afterEach, beforeEach, expect, it, vi } from 'vitest';

class Channel {
  static instances: Channel[] = [];
  sent: any[] = [];
  onmessage: ((event: {data: any}) => void) | null = null;
  constructor() { Channel.instances.push(this); }
  postMessage(message: unknown) { this.sent.push(message); }
  close() {}
  deliver(data: unknown) { this.onmessage?.({data}); }
}

function token(sid: string, revision: number, started = 100) {
  return `${btoa('{}')}.${btoa(JSON.stringify({sid, sv: revision, session_started_at: started}))}.signature`;
}

async function tab() {
  vi.resetModules();
  const session = await import('../lib/session');
  return {session, channel: Channel.instances.at(-1)!};
}

beforeEach(() => {
  localStorage.clear();
  Channel.instances = [];
  vi.stubGlobal('BroadcastChannel', Channel);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); });

it('rejects an account-switch announcement delayed until after logout', async () => {
  const a = await tab();
  a.session.setAccessToken(token('a'.repeat(32), 0));
  const b = await tab();
  b.session.setAccessToken(token('b'.repeat(32), 0, 200));
  const delayed = b.channel.sent.findLast(message => message.type === 'SESSION');
  a.session.clearAccessToken();
  a.channel.deliver(delayed);
  expect(a.session.getAccessToken()).toBeNull();
});

it('ignores unscoped old logout announcements after installing a new account', async () => {
  const a = await tab();
  const current = token('b'.repeat(32), 0);
  a.session.setAccessToken(current);
  a.channel.deliver({type: 'LOGOUT'});
  expect(a.session.getAccessToken()).toBe(current);
});

it('accepts a same-session renewal when the database truncates creation microseconds', async () => {
  const a = await tab();
  a.session.setAccessToken(token('a'.repeat(32), 0, 100000123));
  const b = await tab();
  const refreshed = token('a'.repeat(32), 1, 100000000);
  b.session.renewAccessToken(refreshed);
  a.channel.deliver(b.channel.sent.findLast(message => message.type === 'RENEW'));
  expect(a.session.getAccessToken()).toBe(refreshed);
});

it('keeps the latest account when two database creation times share a second', async () => {
  const b = await tab();
  b.session.setAccessToken(token('a'.repeat(32), 0));
  const delayed = b.channel.sent.findLast(message => message.type === 'SESSION');
  const a = await tab();
  const current = token('b'.repeat(32), 0);
  a.session.setAccessToken(current);
  a.channel.deliver(delayed);
  expect(a.session.getAccessToken()).toBe(current);
});

it('still accepts an intentional peer login after logout', async () => {
  const a = await tab();
  a.session.setAccessToken(token('a'.repeat(32), 0));
  a.session.clearAccessToken();
  const b = await tab();
  const current = token('b'.repeat(32), 0, 200);
  b.session.setAccessToken(current);
  a.channel.deliver(b.channel.sent.findLast(message => message.type === 'SESSION'));
  expect(a.session.getAccessToken()).toBe(current);
});

it('fences a pending response before a peer logout message is delivered', async () => {
  const a = await tab();
  a.session.setAccessToken(token('a'.repeat(32), 0));
  const generation = a.session.getSessionGeneration();
  const b = await tab();
  b.session.clearAccessToken();
  expect(a.session.getSessionGeneration()).not.toBe(generation);
  expect(a.session.getAccessToken()).toBeNull();
});

it('persists coordination metadata without persisting tokens or session identity', async () => {
  const a = await tab();
  const sid = 'a'.repeat(32);
  const access = token(sid, 0);
  a.session.setAccessToken(access);
  expect(a.session.getAccessToken()).toBe(access);
  const values = Array.from({length: localStorage.length}, (_, index) => localStorage.getItem(localStorage.key(index)!));
  expect(values).toHaveLength(1);
  expect(values[0]).not.toContain(access);
  expect(values[0]).not.toContain(sid);
  a.session.clearAccessToken();
  expect(localStorage.getItem(localStorage.key(0)!)).not.toBe(values[0]);
});

it('ignores a real earlier logout announcement after a later peer login', async () => {
  const a = await tab();
  a.session.setAccessToken(token('a'.repeat(32), 0));
  a.session.clearAccessToken();
  const logout = a.channel.sent.findLast(message => message.type === 'LOGOUT');
  const b = await tab();
  const current = token('b'.repeat(32), 0);
  b.session.setAccessToken(current);
  b.channel.deliver(logout);
  expect(b.session.getAccessToken()).toBe(current);
});

it('keeps local login and logout usable when coordination storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  const a = await tab();
  const current = token('a'.repeat(32), 0);
  a.session.setAccessToken(current);
  expect(a.session.getAccessToken()).toBe(current);
  const delayed = a.channel.sent.findLast(message => message.type === 'SESSION');
  a.session.clearAccessToken();
  a.channel.deliver(delayed);
  expect(a.session.getAccessToken()).toBeNull();
});
