"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-config";
import { Product } from "@/lib/types";

type PaginatedProducts = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};

export interface UseProductsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  category_id?: string | number | null;
  min_price?: number | null;
  max_price?: number | null;
  is_active?: boolean | null;
  stock_status?: string | null;
  sort_by?: string | null;
}

export function useProducts(params?: UseProductsParams) {
  const query = new URLSearchParams();
  if (params?.pageSize) query.append("limit", params.pageSize.toString());
  if (params?.page && params?.pageSize) {
    query.append("offset", ((params.page - 1) * params.pageSize).toString());
  }
  if (params?.search) query.append("search", params.search);
  if (params?.category_id && params.category_id !== "all" && params.category_id !== "All") {
    query.append("category_id", params.category_id.toString());
  }
  if (params?.min_price !== undefined && params?.min_price !== null) {
    query.append("min_price", params.min_price.toString());
  }
  if (params?.max_price !== undefined && params?.max_price !== null) {
    query.append("max_price", params.max_price.toString());
  }
  if (params?.is_active !== undefined && params?.is_active !== null) {
    query.append("is_active", params.is_active.toString());
  }
  if (params?.stock_status && params.stock_status !== "all") {
    query.append("stock_status", params.stock_status);
  }
  if (params?.sort_by && params.sort_by !== "latest") {
    query.append("sort_by", params.sort_by);
  }

  const queryString = query.toString();
  const url = queryString ? `/products/?${queryString}` : "/products/";

  const { data, error, isLoading, mutate } = useSWR<PaginatedProducts>(url, swrFetcher);

  return {
    products: data?.items ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    limit: data?.limit ?? 10,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
