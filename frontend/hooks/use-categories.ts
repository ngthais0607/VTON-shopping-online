"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-config";
import { Category } from "@/lib/types";

export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<Category[]>("/categories/", swrFetcher);

  return {
    categories: data ?? [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
