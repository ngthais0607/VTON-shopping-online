"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Check, Filter, RotateCcw, X } from "lucide-react";

import { swrFetcher } from "@/lib/swr-config";
import type { ProductFacetsResponse } from "@/lib/types";

interface FashionFiltersProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

export function FashionFilters({
  isOpen = true,
  onClose,
  className = "",
}: FashionFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Fetch facets from backend
  const { data: facets } = useSWR<ProductFacetsResponse>(
    "/products/facets",
    swrFetcher,
  );

  // Read active filters from URL query parameters
  const activeCategory = searchParams.get("category_id") || "";
  const activeGender = searchParams.get("gender") || "";
  const activeBrand = searchParams.get("brand") || "";
  const activeSize = searchParams.get("size") || "";
  const activeColor = searchParams.get("color") || "";
  const activeStock = searchParams.get("stock_status") || "";

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const current = new URLSearchParams(searchParams.toString());
      if (!value || value === "all" || value === "") {
        current.delete(key);
      } else {
        current.set(key, value);
      }
      current.delete("offset"); // reset pagination
      router.replace(`?${current.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const resetAll = useCallback(() => {
    const current = new URLSearchParams(searchParams.toString());
    current.delete("category_id");
    current.delete("gender");
    current.delete("brand");
    current.delete("size");
    current.delete("color");
    current.delete("stock_status");
    current.delete("min_price");
    current.delete("max_price");
    current.delete("offset");
    router.replace(`?${current.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const hasActiveFilters = Boolean(
    activeCategory ||
      activeGender ||
      activeBrand ||
      activeSize ||
      activeColor ||
      activeStock,
  );

  if (!isOpen) return null;

  return (
    <div
      className={`bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs ${className}`}
      data-testid="fashion-filters-container"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-sky-600" />
          <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
            Bộ lọc thời trang
          </h3>
        </div>
        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-500 hover:text-rose-600 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Đặt lại
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 lg:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6 text-xs">
        {/* Gender Filter */}
        {facets?.genders && facets.genders.length > 0 && (
          <div>
            <label className="font-bold text-slate-800 uppercase tracking-wider block mb-2.5">
              Giới tính
            </label>
            <div className="flex flex-wrap gap-2">
              {facets.genders.map((g) => {
                const isSelected = activeGender === g;
                const label =
                  g === "male"
                    ? "Nam"
                    : g === "female"
                    ? "Nữ"
                    : g === "kids"
                    ? "Trẻ em"
                    : "Unisex";
                return (
                  <button
                    key={g}
                    type="button"
                    aria-label={`Giới tính ${label}`}
                    onClick={() => updateParam("gender", isSelected ? null : g)}
                    className={`px-3 py-1.5 rounded-xl font-bold border transition-all ${
                      isSelected
                        ? "bg-sky-500 border-sky-500 text-white shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sizes Filter */}
        {facets?.sizes && facets.sizes.length > 0 && (
          <div>
            <label className="font-bold text-slate-800 uppercase tracking-wider block mb-2.5">
              Kích cỡ
            </label>
            <div className="flex flex-wrap gap-2">
              {facets.sizes.map((s) => {
                const isSelected = activeSize === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-label={`Size ${s}`}
                    onClick={() => updateParam("size", isSelected ? null : s)}
                    className={`min-w-9 h-8 px-2.5 rounded-lg font-bold border flex items-center justify-center transition-all ${
                      isSelected
                        ? "bg-sky-500 border-sky-500 text-white shadow-xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Colors Filter */}
        {facets?.colors && facets.colors.length > 0 && (
          <div>
            <label className="font-bold text-slate-800 uppercase tracking-wider block mb-2.5">
              Màu sắc
            </label>
            <div className="flex flex-wrap gap-2">
              {facets.colors.map((c) => {
                const isSelected = activeColor === c.name;
                return (
                  <button
                    key={c.name}
                    type="button"
                    aria-label={`Màu ${c.name}`}
                    onClick={() => updateParam("color", isSelected ? null : c.name)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-semibold border transition-all ${
                      isSelected
                        ? "bg-sky-50 border-sky-500 text-sky-900 shadow-2xs"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full border border-black/10 shrink-0 shadow-2xs"
                      style={{ backgroundColor: c.hex || "#94a3b8" }}
                    />
                    <span>{c.name}</span>
                    {isSelected && <Check className="w-3 h-3 text-sky-600" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Brand Filter */}
        {facets?.brands && facets.brands.length > 0 && (
          <div>
            <label className="font-bold text-slate-800 uppercase tracking-wider block mb-2.5">
              Thương hiệu
            </label>
            <div className="flex flex-wrap gap-2">
              {facets.brands.map((b) => {
                const isSelected = activeBrand === b;
                return (
                  <button
                    key={b}
                    type="button"
                    aria-label={`Thương hiệu ${b}`}
                    onClick={() => updateParam("brand", isSelected ? null : b)}
                    className={`px-3 py-1.5 rounded-xl font-semibold border transition-all ${
                      isSelected
                        ? "bg-slate-900 border-slate-900 text-white"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    {b}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Stock Status Filter */}
        <div className="pt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
            <input
              type="checkbox"
              checked={activeStock === "in_stock"}
              onChange={(e) =>
                updateParam("stock_status", e.target.checked ? "in_stock" : null)
              }
              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>Chỉ xem sản phẩm còn hàng</span>
          </label>
        </div>
      </div>
    </div>
  );
}
