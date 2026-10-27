import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

let requests: InternalAxiosRequestConfig[];
let response: { status: number; data: unknown };
const originalAdapter = axios.defaults.adapter;
beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:8000');
  requests = [];
  response = { status: 200, data: { ok: true } };
  axios.defaults.adapter = async config => {
    requests.push(config);
    const result = { ...response, statusText: '', headers: {}, config } as AxiosResponse;
    if (response.status >= 400) throw new AxiosError('request failed', undefined, config, undefined, result);
    return result;
  };
});
afterEach(() => { axios.defaults.adapter = originalAdapter; vi.unstubAllEnvs(); });
describe('HTTP contracts', () => {
  it('uses the versioned API for origin-only configuration', async () => {
    const api = await import('../lib/api');
    await api.apiGet('/products');
    expect(requests[0].baseURL).toBe('http://localhost:8000/api/v1');
  });
  it('does not duplicate an already versioned base', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_BASE_URL', 'http://localhost:8000/api/v1/');
    const api = await import('../lib/api');
    await api.apiGet('/products');
    expect(requests[0].baseURL).toBe('http://localhost:8000/api/v1');
  });
  it('retains conflict status and application error metadata', async () => {
    response = { status: 409, data: { code: 'stock_conflict', message: 'Insufficient stock', details: null } };
    const api = await import('../lib/api');
    await expect(api.apiPost('/orders/checkout-cart', {})).rejects.toMatchObject({ status: 409, code: 'stock_conflict', message: 'Insufficient stock' });
  });
  it('renders FastAPI validation details as a readable message', async () => {
    response = { status: 422, data: { detail: [{ loc: ['body', 'password'], msg: 'String should have at least 8 characters', type: 'string_too_short' }] } };
    const api = await import('../lib/api');
    await expect(api.apiPost('/users/register', {})).rejects.toMatchObject({ status: 422, message: expect.stringContaining('password: String should have at least 8 characters') });
  });
  it('accepts empty deletions and keeps order-status PUT', async () => {
    const api = await import('../lib/api');
    response = { status: 204, data: undefined };
    await expect(api.apiDelete('/products/7')).resolves.toBeUndefined();
    await api.apiPut('/orders/7/status', { status: 'paid' });
    expect(requests.map(r => r.method)).toEqual(['delete', 'put']);
  });
});
