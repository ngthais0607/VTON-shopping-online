import { apiGet } from "./api";
import { SWRConfiguration } from "swr";

export const swrFetcher = <T>(url: string): Promise<T> => apiGet<T>(url);

export const defaultSWRConfig: SWRConfiguration = {
  fetcher: swrFetcher,
  revalidateOnFocus: true,
  dedupingInterval: 5000,
};
