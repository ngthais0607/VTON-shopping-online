import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const originalAdapter = axios.defaults.adapter;
beforeEach(() => { vi.resetModules(); localStorage.clear(); localStorage.setItem('token', 'old'); });
afterEach(() => { axios.defaults.adapter = originalAdapter; });
function result(config: InternalAxiosRequestConfig, data: unknown, status = 200) {
  const res = {config, data, status, statusText: '', headers: {}} as AxiosResponse;
  if (status >= 400) throw new AxiosError('failed', undefined, config, undefined, res);
  return res;
}
it('refreshes concurrent requests once and retries each only once', async () => {
  let refreshes = 0;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  axios.defaults.adapter = async config => {
    if (config.url?.endsWith('/users/refresh')) { refreshes++; await pending; return result(config, {access_token:'new'}); }
    return result(config, {ok:true}, config.headers.Authorization === 'Bearer new' ? 200 : 401);
  };
  const api = await import('../lib/api');
  const calls = [api.apiGet('/users/me'), api.apiGet('/orders/user/1'), api.apiGet('/users/me')];
  await vi.waitFor(() => expect(refreshes).toBe(1));
  release();
  await expect(Promise.all(calls)).resolves.toEqual([{ok:true},{ok:true},{ok:true}]);
  expect(refreshes).toBe(1);
});
it('does not restore a token when refresh completes after logout', async () => {
  let release!: () => void;
  let refreshStarted = false;
  const pending = new Promise<void>(resolve => { release = resolve; });
  axios.defaults.adapter = async config => {
    if (config.url?.endsWith('/users/refresh')) { refreshStarted = true; await pending; return result(config, {access_token:'new'}); }
    if (config.url === '/users/logout') return result(config, undefined, 204);
    return result(config, {}, 401);
  };
  const api = await import('../lib/api');
  const request = api.apiGet('/users/me').catch(error => error);
  await vi.waitFor(() => expect(refreshStarted).toBe(true));
  // Exercise the user's logout action, not internal reset helpers.
  const logout = (api as typeof api & {logoutSession?:()=>Promise<void>}).logoutSession;
  expect(typeof logout).toBe('function');
  await logout!();
  release();
  await request;
  expect(localStorage.getItem('token')).toBeNull();
});
it('keeps local credentials cleared when server logout fails and reports failure', async () => {
  axios.defaults.adapter = async config => result(config, {message:'Unavailable'}, 503);
  const api = await import('../lib/api');
  const logout = (api as typeof api & {logoutSession?:()=>Promise<void>}).logoutSession;
  expect(typeof logout).toBe('function');
  await expect(logout!()).rejects.toMatchObject({status:503});
  expect(localStorage.getItem('token')).toBeNull();
});
it('rejects all waiters when refresh fails without recursing', async () => {
  let refreshes = 0;
  axios.defaults.adapter = async config => {
    if (config.url?.endsWith('/users/refresh')) refreshes++;
    return result(config, {message:'Expired'}, 401);
  };
  const api = await import('../lib/api');
  const settled = await Promise.allSettled([api.apiGet('/users/me'), api.apiGet('/orders/user/1')]);
  expect(settled.every(r => r.status === 'rejected')).toBe(true);
  expect(refreshes).toBe(1);
  expect(localStorage.getItem('token')).toBeNull();
});
it('keeps credentials on a temporary refresh outage',async()=>{
  axios.defaults.adapter = async config => result(config,{message:'Temporarily unavailable'},config.url?.endsWith('/users/refresh') ? 503 : 401);
  const api = await import('../lib/api');
  await expect(api.apiGet('/users/me')).rejects.toMatchObject({status:503});
  expect(localStorage.getItem('token')).toBe('old');
});
it.each([false, true])('isolates a new login from pending refresh (logout=%s)', async logout => {
  let release!: () => void;
  let refreshes = 0;
  const pending = new Promise<void>(resolve => { release = resolve; });
  axios.defaults.adapter = async config => {
    if (config.url?.endsWith('/users/refresh')) {
      refreshes++;
      if (refreshes === 1) { await pending; return result(config, {access_token:'old-renewed'}); }
      return result(config, {access_token:'new-renewed'});
    }
    if (config.url === '/users/logout') return result(config, undefined, 204);
    return result(config, {ok:true}, config.headers.Authorization === 'Bearer new-renewed' ? 200 : 401);
  };
  const api = await import('../lib/api');
  const session = await import('../lib/session');
  const oldRequest = api.apiGet('/users/me').catch(error => error);
  await vi.waitFor(() => expect(refreshes).toBe(1));
  if (logout) await api.logoutSession();
  session.setAccessToken('new-login');
  const newRequest = api.apiGet('/users/me').catch(error => error);
  await new Promise(resolve => setTimeout(resolve, 10));
  release();
  await oldRequest;
  expect(await newRequest).toEqual({ok:true});
  expect(localStorage.getItem('token')).toBe('new-renewed');
  expect(refreshes).toBe(2);
});
