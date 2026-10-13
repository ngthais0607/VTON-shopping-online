"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-config";
import { Product, Page } from "@/lib/types";

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
  gender?: string | null;
  brand?: string | null;
  size?: string | null;
  color?: string | null;
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
    query.append("sort", params.sort_by);
  }
  if (params?.gender && params.gender !== "all") {
    query.append("gender", params.gender);
  }
  if (params?.brand && params.brand !== "all") {
    query.append("brand", params.brand);
  }
  if (params?.size && params.size !== "all") {
    query.append("size", params.size);
  }
  if (params?.color && params.color !== "all") {
    query.append("color", params.color);
  }

  const queryString = query.toString();
  const url = queryString ? `/products?${queryString}` : "/products";

  const { data, error, isLoading, mutate } = useSWR<Page<Product>>(url, swrFetcher);

  return {
    products: data?.items ?? [],
    total: data?.total ?? 0,
    page: params?.page ?? 1,
    limit: data?.limit ?? 10,
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
