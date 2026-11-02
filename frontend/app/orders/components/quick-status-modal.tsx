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
import { Order } from "@/lib/types";
import { Check,CheckCircle2,Clock,Loader2,Truck,XCircle } from "lucide-react";
import { useState } from "react";
import { useSWRConfig } from 'swr';

interface QuickStatusModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated: () => void;
}

const statusOptions: { label: string; value: Order["status"]; icon: any; color: string }[] = [
  { label: "Pending", value: "pending", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { label: "COD Confirmed", value: "confirmed", icon: CheckCircle2, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { label: "Paid", value: "paid", icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { label: "Shipped", value: "shipped", icon: Truck, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { label: "Delivered", value: "delivered", icon: Check, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
  { label: "Cancelled", value: "cancelled", icon: XCircle, color: "text-rose-600 bg-rose-50 border-rose-200" },
  { label: "Expired", value: "expired", icon: XCircle, color: "text-muted-foreground bg-background border-border" },
];

export function QuickStatusModal({ order, isOpen, onClose, onStatusUpdated }: QuickStatusModalProps) {
  const {mutate} = useSWRConfig();
  const [error, setError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);

  if (!order) return null;

  const handleSelectStatus = async (newStatus: Order["status"]) => {
    if (newStatus === order.status) {
      onClose();
      return;
    }

    setLoadingStatus(newStatus);
    setError(null);
    try {
      await apiPut(`/orders/${order.id}/status`, { status: newStatus });
      await mutate(key => typeof key === "string" && key.startsWith("/dashboard"));
      onStatusUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update order status.");
    } finally {
      setLoadingStatus(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="admin-dialog max-w-md bg-white rounded p-6 shadow-none">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-foreground">
            Update Status for Order #{order.id}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Select a new fulfillment status for product <span className="font-semibold text-foreground">{order.product_name}</span>.
          </DialogDescription>
        </DialogHeader>

        {error && <p role="alert">{error}</p>}
        <div className="space-y-2.5 py-4">
          {statusOptions.map((opt) => {
            const Icon = opt.icon;
            const isCurrent = order.status === opt.value;
            const isLoading = loadingStatus === opt.value;

            return (
              <button
                key={opt.value}
                disabled={loadingStatus !== null}
                onClick={() => handleSelectStatus(opt.value)}
                className={`w-full flex items-center justify-between p-3.5 rounded border text-sm font-semibold transition-all cursor-pointer ${
                  isCurrent
                    ? `${opt.color} ring-2 ring-ring/20`
                    : "border-border hover:border-primary/40 hover:bg-background/80 text-foreground"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-md bg-white shadow-none`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span>{opt.label}</span>
                </div>

                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : isCurrent ? (
                  <span className="text-xs bg-primary text-white px-2.5 py-0.5 rounded-full font-bold">
                    Current
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose} className="rounded-md text-xs font-semibold">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
