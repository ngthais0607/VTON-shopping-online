import { OrderStatus } from "@/lib/types";


export type OrderStatusTone = "amber" | "blue" | "green" | "red" | "slate";

const presentations: Record<OrderStatus, { label: string; tone: OrderStatusTone }> = {
  pending: { label: "Awaiting Payment", tone: "amber" },
  confirmed: { label: "COD Confirmed", tone: "blue" },
  paid: { label: "Paid", tone: "green" },
  shipped: { label: "Shipped", tone: "blue" },
  delivered: { label: "Delivered", tone: "green" },
  cancelled: { label: "Cancelled", tone: "red" },
  expired: { label: "Expired", tone: "slate" },
};

export function getOrderStatusPresentation(status: OrderStatus) {
  return presentations[status];
}
