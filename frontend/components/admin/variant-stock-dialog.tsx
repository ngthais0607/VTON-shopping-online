"use client";

import React, { useState, useEffect } from "react";
import { X, Package, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductVariant } from "@/lib/types";

interface VariantStockDialogProps {
  variant: ProductVariant | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { stock_quantity: number; reason: string }) => void | Promise<void>;
  isLoading?: boolean;
}

export function VariantStockDialog({
  variant,
  isOpen,
  onClose,
  onSubmit,
  isLoading = false,
}: VariantStockDialogProps) {
  const [stockQuantity, setStockQuantity] = useState<number>(variant?.stock_quantity ?? 0);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (variant) {
      setStockQuantity(variant.stock_quantity ?? 0);
      setReason("");
      setError(null);
    }
  }, [variant, isOpen]);

  if (!isOpen || !variant) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Vui lòng nhập lý do điều chỉnh tồn kho.");
      return;
    }
    const reservedPlusSold = (variant.reserved_quantity ?? 0) + (variant.sold_quantity ?? 0);
    if (stockQuantity < reservedPlusSold) {
      setError(
        `Tồn kho mới không được nhỏ hơn số lượng đã giữ và đã bán (${reservedPlusSold}).`
      );
      return;
    }

    setError(null);
    onSubmit({
      stock_quantity: stockQuantity,
      reason: reason.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Dialog */}
      <div className="relative z-10 bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 overflow-hidden space-y-5 border border-slate-100">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-sky-600" />
            <h3 className="font-bold text-base text-slate-900">
              Điều chỉnh tồn kho biến thể
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Variant summary info */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">Mã SKU:</span>
            <span className="font-mono font-bold text-slate-900">{variant.sku}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Kích cỡ / Màu sắc:</span>
            <span className="font-semibold text-slate-800">
              Size {variant.size} · {variant.color_name}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-slate-200/60">
            <span className="text-slate-500">Tồn kho hiện tại:</span>
            <span className="font-bold text-slate-900">{variant.stock_quantity}</span>
          </div>
          <div className="flex justify-between text-slate-500 text-[11px]">
            <span>Đang giữ: {variant.reserved_quantity} · Đã bán: {variant.sold_quantity}</span>
            <span className="text-emerald-600 font-bold">Khả dụng: {variant.available_stock}</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="stock-quantity" className="text-xs font-bold text-slate-700 block mb-1.5">
              Tồn kho mới
            </label>
            <Input
              id="stock-quantity"
              aria-label="Tồn kho mới"
              type="number"
              min={0}
              value={stockQuantity}
              onChange={(e) => setStockQuantity(Math.max(0, parseInt(e.target.value) || 0))}
              className="text-sm h-10 rounded-xl"
              required
            />
          </div>

          <div>
            <label htmlFor="adjust-reason" className="text-xs font-bold text-slate-700 block mb-1.5">
              Lý do điều chỉnh (bắt buộc kiểm toán)
            </label>
            <Input
              id="adjust-reason"
              aria-label="Lý do điều chỉnh"
              placeholder="VD: Kiểm kê định kỳ, nhập kho bổ sung, hàng lỗi..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-sm h-10 rounded-xl"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-xl text-xs font-semibold"
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold px-5"
            >
              {isLoading ? "Đang lưu..." : "Xác nhận điều chỉnh"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
