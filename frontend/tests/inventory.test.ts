import { describe, expect, it } from "vitest";

import { getAvailableStock } from "@/lib/inventory";

describe("getAvailableStock", () => {
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
