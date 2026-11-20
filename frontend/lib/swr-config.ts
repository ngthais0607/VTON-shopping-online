import { apiGet } from "./api";

export const swrFetcher = <T>(url: string): Promise<T> => apiGet<T>(url);
