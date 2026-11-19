"use client";

import React, { useState, useEffect } from "react";
import { Package, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProductVariant } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

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
      setError("Please enter a reason for the stock adjustment.");
      return;
    }
    const reservedPlusSold = (variant.reserved_quantity ?? 0) + (variant.sold_quantity ?? 0);
    if (stockQuantity < reservedPlusSold) {
      setError(
        `New stock cannot be less than the reserved and sold quantity (${reservedPlusSold}).`
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
    <Dialog open={isOpen} onOpenChange={open => { if (!open && !isLoading) onClose(); }}>
      <DialogContent showCloseButton={!isLoading} className="max-h-[90dvh] max-w-md overflow-y-auto bg-card">
        <DialogHeader className="border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Package aria-hidden="true" className="w-5 h-5 text-primary" />
            <DialogTitle className="font-semibold text-base text-foreground">
              Adjust Variant Stock
            </DialogTitle>
          </div>
          <DialogDescription>Update total stock and record the reason for the adjustment.</DialogDescription>
        </DialogHeader>

        {/* Variant summary info */}
        <div className="bg-background rounded p-4 border border-border text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">SKU:</span>
            <span className="font-mono font-bold text-foreground">{variant.sku}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Size / Color:</span>
            <span className="font-semibold text-foreground">
              Size {variant.size} · {variant.color_name}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-border/60">
            <span className="text-muted-foreground">Current stock:</span>
            <span className="font-bold text-foreground">{variant.stock_quantity}</span>
          </div>
          <div className="flex justify-between text-muted-foreground text-[11px]">
            <span>Reserved: {variant.reserved_quantity} · Sold: {variant.sold_quantity}</span>
            <span className="text-emerald-600 font-bold">Available: {variant.available_stock}</span>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-600 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="stock-quantity" className="text-xs font-bold text-foreground block mb-1.5">
              New stock
            </label>
            <Input
              id="stock-quantity"
              aria-label="New stock"
              type="number"
              min={0}
              value={stockQuantity}
              onChange={(e) => setStockQuantity(Math.max(0, parseInt(e.target.value) || 0))}
              className="text-sm h-10 rounded-md"
              required
            />
          </div>

          <div>
            <label htmlFor="adjust-reason" className="text-xs font-bold text-foreground block mb-1.5">
              Adjustment reason (required for audit)
            </label>
            <Input
              id="adjust-reason"
              aria-label="Adjustment reason"
              placeholder="e.g. Stock count, restock, damaged items..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-sm h-10 rounded-md"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isLoading}
              className="rounded-md text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-primary hover:bg-primary/90 text-white rounded-md text-xs font-bold px-5"
            >
              {isLoading ? "Saving..." : "Confirm Adjustment"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
