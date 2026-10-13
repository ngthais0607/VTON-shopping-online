import type { Product, ProductVariant } from "@/lib/types";

type InventorySnapshot = Pick<
  Product,
  "stock_quantity" | "reserved_quantity" | "sold_quantity"
>;

export function getAvailableStock(item: InventorySnapshot | ProductVariant): number {
  const stock = item.stock_quantity ?? 0;
  const reserved = item.reserved_quantity ?? 0;
  const sold = item.sold_quantity ?? 0;
  return Math.max(0, stock - reserved - sold);
}

export function isVariantInStock(variant: ProductVariant): boolean {
  if (!variant.is_active) return false;
  return getAvailableStock(variant) > 0;
}

export function getProductStockStatus(
  product: Product,
): "in_stock" | "low_stock" | "out_of_stock" {
  if (product.variants && product.variants.length > 0) {
    const totalAvailable = product.variants
      .filter((v) => v.is_active)
      .reduce((sum, v) => sum + getAvailableStock(v), 0);
    if (totalAvailable <= 0) return "out_of_stock";
    if (totalAvailable <= 5) return "low_stock";
    return "in_stock";
  }

  const available = getAvailableStock(product);
  if (available <= 0) return "out_of_stock";
  if (available <= 5) return "low_stock";
  return "in_stock";
}
