import axios, { InternalAxiosRequestConfig } from 'axios';
import { clearAccessToken, getAccessToken, getSessionGeneration, setAccessToken } from './session';

export function normalizeApiBase(base: string): string {
    const clean = base.replace(/\/+$/, '');
    return clean.endsWith('/api/v1') ? clean : `${clean}/api/v1`;
}
const API_BASE_URL = normalizeApiBase(process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000');

export class ApiError extends Error {
    constructor(message: string, public status?: number, public code?: string, public details?: unknown) {
        super(message);
        this.name = 'ApiError';
    }
}

function toApiError(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (!axios.isAxiosError(error)) return new ApiError(error instanceof Error ? error.message : 'Request failed');
    const data = error.response?.data;
    const detail = data?.detail;
    const message = data?.message || (typeof detail === 'string' ? detail : Array.isArray(detail)
        ? detail.map((issue: { loc?: (string | number)[]; msg?: string }) => `${issue.loc?.slice(1).join('.') || 'Input'}: ${issue.msg || 'Invalid value'}`).join('; ')
        : error.response ? `API Error: ${error.response.status}` : 'Unable to reach the server. Please try again.');
    return new ApiError(message, error.response?.status, data?.code, data?.details ?? detail);
}

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

interface SessionRequest extends InternalAxiosRequestConfig { _retry?: boolean; _generation?: number }
let refreshPromise: Promise<string> | null = null;
const isAuthRequest = (url = '') => /\/users\/(login|register|refresh|logout)$/.test(url);
apiClient.interceptors.request.use((config: SessionRequest) => {
    const token = getAccessToken();
    config._generation ??= getSessionGeneration();
    if (token && !isAuthRequest(config.url)) config.headers.set('Authorization', `Bearer ${token}`);
    else config.headers.delete('Authorization');
    return config;
});
apiClient.interceptors.response.use(
    response => {
        const config = response.config as SessionRequest;
        if (!isAuthRequest(config.url) && config._generation !== getSessionGeneration()) throw new ApiError('Session changed. Please try again.', 401);
        return response.data;
    },
    async error => {
        const request = error.config as SessionRequest | undefined;
        if (error.response?.status !== 401 || !request || isAuthRequest(request.url)) throw toApiError(error);
        if (request._generation !== getSessionGeneration()) throw new ApiError('Session changed. Please log in again.', 401);
        if (request._retry || !getAccessToken()) { clearAccessToken(); throw toApiError(error); }
        request._retry = true;
        const version = getSessionGeneration();
        try {
            if (!refreshPromise) {
                refreshPromise = axios.post(`${API_BASE_URL}/users/refresh`, {}, { withCredentials: true }).then(response => {
                    if (version !== getSessionGeneration()) throw new ApiError('Session changed. Please log in again.', 401);
                    const token = response.data.access_token;
                    if (typeof token !== 'string' || !token) throw new ApiError('Invalid session response', 401);
                    setAccessToken(token);
                    return token;
                }).finally(() => { refreshPromise = null; });
            }
            const token = await refreshPromise;
            if (version !== getSessionGeneration()) throw new ApiError('Session changed. Please log in again.', 401);
            request.headers.set('Authorization', `Bearer ${token}`);
            return await apiClient(request);
        } catch (failure) {
            if (version === getSessionGeneration() && toApiError(failure).status === 401) clearAccessToken();
            throw toApiError(failure);
        }
    }
);
export async function logoutSession(): Promise<void> {
    clearAccessToken();
    delete apiClient.defaults.headers.common.Authorization;
    await apiPost<void>('/users/logout', {});
}

export async function apiGet<T>(path: string): Promise<T> {
    return apiClient.get<T, T>(path);
}

export async function apiDelete<T>(path: string): Promise<T> {
    return apiClient.delete<T, T>(path);
}

export async function apiDeleteWithBody<T, B = unknown>(path: string, body: B): Promise<T> {
    return apiClient.delete<T, T, B>(path, { data: body });
}

export async function apiPost<T, B = unknown>(path: string, body: B): Promise<T> {
    return apiClient.post<T, T, B>(path, body);
}

export async function apiPut<T, B = unknown>(path: string, body: B): Promise<T> {
    return apiClient.put<T, T, B>(path, body);
}

export async function apiPatch<T, B = unknown>(path: string, body: B): Promise<T> {
    return apiClient.patch<T, T, B>(path, body);
}

export async function apiUpload<T>(
    path: string,
    formData: FormData
): Promise<T> {
    return apiClient.post<T, T, FormData>(path, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        }
    });
}
