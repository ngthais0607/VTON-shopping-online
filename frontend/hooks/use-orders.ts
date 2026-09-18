"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-config";
import { Order } from "@/lib/types";

export function useOrders() {
  const { data, error, isLoading, mutate } = useSWR<Order[]>("/orders/", swrFetcher);

  return {
    orders: data ?? [],
    isLoading,
    isError: !!error,
    error,
    mutate,
  };
}
