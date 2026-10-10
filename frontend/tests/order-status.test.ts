import { describe, expect, it } from "vitest";

import { getOrderStatusPresentation } from "@/lib/order-status";
import { OrderStatus } from "@/lib/types";


describe("getOrderStatusPresentation", () => {
  it("presents confirmed as a successful COD order", () => {
    expect(getOrderStatusPresentation("confirmed")).toEqual({
      label: "COD Confirmed",
      tone: "blue",
    });
  });

  it("returns metadata for every order status", () => {
    const statuses: OrderStatus[] = [
      "pending",
      "confirmed",
      "paid",
      "cancelled",
      "expired",
    ];

    for (const status of statuses) {
      const presentation = getOrderStatusPresentation(status);
      expect(presentation.label).toBeTruthy();
      expect(presentation.tone).toBeTruthy();
    }
  });
});
