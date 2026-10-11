import type { Product } from "@/lib/types";

type InventorySnapshot = Pick<
  Product,
  "stock_quantity" | "reserved_quantity" | "sold_quantity"
>;

export function getAvailableStock(product: InventorySnapshot): number {
  return Math.max(
    0,
    product.stock_quantity - product.reserved_quantity - product.sold_quantity,
  );
}
