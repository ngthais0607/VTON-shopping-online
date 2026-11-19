"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAvailableStock } from "@/lib/inventory";
import type { Product, ProductVariant } from "@/lib/types";
import { displayDate, formatCurrency } from "@/lib/utils";
import { Image as ImageIcon } from "lucide-react";
import Image from "next/image";

interface ProductDetailsDialogProps {
  product: Product;
  onClose: () => void;
  onAddVariants: (product: Product) => void;
  onAdjustStock: (variant: ProductVariant) => void;
}

const hasActiveVariants = (p: Product) =>
  p.variants ? p.variants.some((v) => v.is_active) : null;

export function ProductDetailsDialog({
  product,
  onClose,
  onAddVariants,
  onAdjustStock,
}: ProductDetailsDialogProps) {
  return (
        <Dialog
          open={!!product}
          onOpenChange={() => onClose()}
        >
          <DialogContent className="admin-dialog max-w-2xl max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{product.name}</DialogTitle>
              <DialogDescription>
                Product details and information
              </DialogDescription>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-6 py-4">
              <div>
                {product.images.length > 0 ? (
                  <div className="relative aspect-square rounded overflow-hidden bg-secondary">
                    <Image
                      src={
                        product.images[0].url
                      }
                      alt={product.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square rounded bg-secondary flex items-center justify-center">
                    <ImageIcon className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Price</p>
                  <p className="text-2xl font-bold text-foreground">
                    {formatCurrency(product.price, product.currency)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Category</p>
                  <p className="font-medium text-foreground">
                    {product.category?.name || "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div className="flex flex-col gap-1 items-start">
                    <Badge
                      className={`${
                        product.is_active
                          ? "bg-green-100 text-green-800"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {product.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {hasActiveVariants(product) === false && (
                      <Badge
                        variant="outline"
                        className="text-[11px] bg-amber-50 text-amber-700 border-amber-200"
                      >
                        Hidden from the store until variants are added
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="pt-4 border-t space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Stock Quantity</p>
                      <p className="text-lg font-semibold text-foreground">
                        {product.stock_quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Reserved</p>
                      <p className="text-lg font-semibold text-foreground">
                        {product.reserved_quantity}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Available</p>
                      <p className="text-lg font-semibold text-foreground">
                        {getAvailableStock(product)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Sold</p>
                      <p className="text-lg font-semibold text-foreground">
                        {product.sold_quantity}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t text-sm text-muted-foreground">
                  <p>
                    Created:{" "}
                    {displayDate(product.created_at, "PPP")}
                  </p>
                  <p>
                    Updated:{" "}
                    {displayDate(product.updated_at, "PPP")}
                  </p>
                </div>
              </div>
            </div>
            {product.description && (
              <div className="py-4 border-t">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-foreground mt-2">
                  {product.description}
                </p>
              </div>
            )}

            {/* Fashion Variants List */}
            {product.variants && product.variants.length > 0 && (
              <div className="py-4 border-t space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-foreground">
                    Variants ({product.variants.length})
                  </h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onAddVariants(product);
                    }}
                    className="text-xs"
                  >
                    Add Variants
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {product.variants.map((v) => (
                    <div
                      key={v.id}
                      className="flex items-center justify-between p-2.5 rounded-md border border-border/80 bg-background text-xs"
                    >
                      <div>
                        <span className="font-mono font-bold text-foreground">{v.sku}</span>
                        <span className="text-muted-foreground ml-2">
                          Size {v.size} · {v.color_name}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-semibold text-foreground">
                          Stock: {v.stock_quantity} (Available: {v.available_stock})
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-7 px-2"
                          onClick={() => onAdjustStock(v)}
                        >
                          Adjust Stock
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
  );
}
