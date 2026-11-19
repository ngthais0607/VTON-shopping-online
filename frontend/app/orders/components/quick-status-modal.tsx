"use client";

import { Button } from "@/components/ui/button";
import {
Dialog,
DialogContent,
DialogDescription,
DialogHeader,
DialogTitle,
} from "@/components/ui/dialog";
import { apiPut } from "@/lib/api";
import { Order, OrderPaymentMethod, OrderStatus } from "@/lib/types";
import { Banknote, Check, CheckCircle2, Loader2, Truck, XCircle } from "lucide-react";
import { useState } from "react";
import { useSWRConfig } from 'swr';

interface QuickStatusModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated: () => void;
}

/** Mirrors backend/app/features/orders/domain.py `_ALLOWED_TRANSITIONS`; the server stays authoritative. */
const ALLOWED_TRANSITIONS: Record<OrderPaymentMethod, Partial<Record<OrderStatus, OrderStatus[]>>> = {
  vietqr: {
    pending: ["paid", "cancelled", "expired"],
    paid: ["shipped", "cancelled"],
    shipped: ["delivered", "cancelled"],
    delivered: ["cancelled"],
  },
  cod: {
    pending: ["confirmed", "cancelled"],
    confirmed: ["paid", "shipped", "cancelled"],
    shipped: ["paid", "delivered", "cancelled"],
    paid: ["shipped", "delivered", "cancelled"],
    delivered: ["paid", "cancelled"],
  },
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  paid: "Paid",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  expired: "Expired",
};

const ACTIONS: Partial<Record<OrderStatus, { label: string; hint: string; icon: typeof Check }>> = {
  confirmed: { label: "Confirm order", hint: "Accept this COD order", icon: CheckCircle2 },
  paid: { label: "Mark as paid", hint: "Payment has been received", icon: Banknote },
  shipped: { label: "Mark as shipped", hint: "Handed over to the carrier", icon: Truck },
  delivered: { label: "Mark as delivered", hint: "Customer received the order", icon: Check },
  expired: { label: "Mark as expired", hint: "Payment window has passed", icon: XCircle },
};

export function getNextStatuses(order: Pick<Order, "payment_method" | "status">): OrderStatus[] {
  return ALLOWED_TRANSITIONS[order.payment_method]?.[order.status] ?? [];
}

export function QuickStatusModal({ order, isOpen, onClose, onStatusUpdated }: QuickStatusModalProps) {
  const {mutate} = useSWRConfig();
  const [error, setError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!order) return null;

  const next = getNextStatuses(order);
  const forward = next.filter((status) => status !== "cancelled");
  const canCancel = next.includes("cancelled");

  const close = () => {
    setError(null);
    setConfirmCancel(false);
    onClose();
  };

  const handleSelectStatus = async (newStatus: OrderStatus) => {
    setLoadingStatus(newStatus);
    setError(null);
    try {
      await apiPut(`/orders/${order.id}/status`, { status: newStatus });
      await mutate(key => typeof key === "string" && key.startsWith("/dashboard"));
      onStatusUpdated();
      close();
    } catch (err: any) {
      setError(err.message || "Failed to update order status.");
    } finally {
      setLoadingStatus(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="admin-dialog max-w-md bg-white rounded p-6 shadow-none">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">
            Update Order #{order.id}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Current status: <span className="font-semibold text-foreground">{STATUS_LABELS[order.status]}</span>
            {" · "}
            {order.payment_method === "cod" ? "Cash on delivery" : "VietQR"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}

        {next.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            This order is {STATUS_LABELS[order.status].toLowerCase()} and can no longer be changed.
          </p>
        ) : confirmCancel ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-foreground">
              Cancel order #{order.id}? Reserved stock is released and this cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" disabled={loadingStatus !== null} onClick={() => setConfirmCancel(false)}>
                Keep order
              </Button>
              <Button
                disabled={loadingStatus !== null}
                onClick={() => handleSelectStatus("cancelled")}
                className="bg-red-600 hover:bg-red-700"
              >
                {loadingStatus === "cancelled" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Yes, cancel order
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 py-4">
            {forward.map((status) => {
              const action = ACTIONS[status];
              const Icon = action?.icon ?? Check;
              return (
                <button
                  key={status}
                  type="button"
                  disabled={loadingStatus !== null}
                  onClick={() => handleSelectStatus(status)}
                  className="flex w-full items-center justify-between rounded border border-border p-3.5 text-left text-sm transition-all hover:border-primary/40 hover:bg-background/80 disabled:opacity-60"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-4 w-4" />
                    <span>
                      <span className="block font-semibold text-foreground">{action?.label ?? STATUS_LABELS[status]}</span>
                      {action && <span className="block text-xs text-muted-foreground">{action.hint}</span>}
                    </span>
                  </span>
                  {loadingStatus === status && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                </button>
              );
            })}
          </div>
        )}

        {!confirmCancel && (
          <div className="flex items-center justify-between">
            {canCancel ? (
              <Button
                variant="ghost"
                disabled={loadingStatus !== null}
                onClick={() => setConfirmCancel(true)}
                className="text-xs font-semibold text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Cancel order
              </Button>
            ) : <span />}
            <Button variant="outline" onClick={close} className="rounded-md text-xs font-semibold">
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
