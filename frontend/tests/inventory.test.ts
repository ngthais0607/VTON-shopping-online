import { describe, expect, it } from "vitest";

import {
  getAvailableStock,
  getProductStockStatus,
  isVariantInStock,
} from "@/lib/inventory";
import type { Product, ProductVariant } from "@/lib/types";

describe("getAvailableStock", () => {
  it("uses the public catalog available_stock without private inventory counters", () => {
    expect(getAvailableStock({ available_stock: 75 } as Product)).toBe(75);
  });
  it("subtracts reserved and sold quantities from total stock", () => {
    expect(
      getAvailableStock({
        stock_quantity: 10,
        reserved_quantity: 2,
        sold_quantity: 3,
      }),
    ).toBe(5);
  });

  it("handles products with no sold quantity", () => {
    expect(
      getAvailableStock({
        stock_quantity: 10,
        reserved_quantity: 2,
        sold_quantity: 0,
      }),
    ).toBe(8);
  });

  it("clamps inconsistent legacy inventory to zero", () => {
    expect(
      getAvailableStock({
        stock_quantity: 5,
        reserved_quantity: 2,
        sold_quantity: 8,
      }),
    ).toBe(0);
  });
});

describe("isVariantInStock", () => {
  const baseVariant: ProductVariant = {
    id: 1,
    product_id: 1,
    sku: "SKU-1",
    size: "M",
    color_name: "Red",
    color_hex: null,
    price: null,
    stock_quantity: 10,
    reserved_quantity: 2,
    sold_quantity: 3,
    available_stock: 5,
    is_active: true,
  };

  it("returns true when active and available stock > 0", () => {
    expect(isVariantInStock(baseVariant)).toBe(true);
  });

  it("returns false when variant is inactive", () => {
    expect(isVariantInStock({ ...baseVariant, is_active: false })).toBe(false);
  });

  it("returns false when available stock is 0", () => {
    expect(
      isVariantInStock({
        ...baseVariant,
        stock_quantity: 5,
        reserved_quantity: 5,
      }),
    ).toBe(false);
  });
});

describe("getProductStockStatus", () => {
  it("determines stock status from active variants", () => {
    const product = {
      stock_quantity: 0,
      reserved_quantity: 0,
      sold_quantity: 0,
      variants: [
        {
          id: 1,
          is_active: true,
          stock_quantity: 10,
          reserved_quantity: 2,
          sold_quantity: 1,
        },
      ] as ProductVariant[],
    } as Product;

    expect(getProductStockStatus(product)).toBe("in_stock");
  });

  it("returns out_of_stock when all active variants have 0 stock", () => {
    const product = {
      variants: [
        {
          id: 1,
          is_active: true,
          stock_quantity: 5,
          reserved_quantity: 5,
          sold_quantity: 0,
        },
      ] as ProductVariant[],
    } as Product;

    expect(getProductStockStatus(product)).toBe("out_of_stock");
  });
});
