import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value?: unknown) => void; reject: (reason?: unknown) => void }> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

apiClient.interceptors.response.use(
    (response) => response.data,
    async (error) => {
        const originalRequest = error.config;

        if (
            error.response?.status === 401 &&
            originalRequest &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/users/login') &&
            !originalRequest.url?.includes('/users/refresh')
        ) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        originalRequest.headers['Authorization'] = `Bearer ${token}`;
                        return apiClient(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const refreshRes = await axios.post(
                    `${API_BASE_URL}/users/refresh`,
                    {},
                    { withCredentials: true }
                );
                const newAccessToken = refreshRes.data.access_token;
                if (typeof window !== 'undefined') {
                    localStorage.setItem('token', newAccessToken);
                }
                apiClient.defaults.headers.common['Authorization'] = `Bearer ${newAccessToken}`;
                originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
                processQueue(null, newAccessToken);
                return apiClient(originalRequest);
            } catch (refreshErr) {
                processQueue(refreshErr as Error, null);
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('token');
                    const path = window.location.pathname;
                    const isPublic = path === "/" || path === "/login" || path === "/register" || path.startsWith("/store");
                    if (!isPublic) {
                        window.location.href = '/login';
                    }
                }
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }

        if (error.response?.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('token');
            const path = window.location.pathname;
            const isPublic = path === "/" || path === "/login" || path === "/register" || path.startsWith("/store");
            if (!isPublic) {
                window.location.href = '/login';
            }
        }

        const message = error.response?.data?.detail || error.response?.data?.message ||
            `API Error: ${error.response?.status || 'Unknown'}`;
        return Promise.reject(new Error(message));
    }
);

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
