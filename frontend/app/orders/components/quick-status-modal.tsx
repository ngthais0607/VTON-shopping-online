"use client";

import React, { useState } from "react";
import { Order } from "@/lib/types";
import { apiPut } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, Truck, Check, XCircle, Loader2 } from "lucide-react";

interface QuickStatusModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated: () => void;
}

const statusOptions: { label: string; value: Order["status"]; icon: any; color: string }[] = [
  { label: "Pending", value: "pending", icon: Clock, color: "text-amber-600 bg-amber-50 border-amber-200" },
  { label: "Paid / Confirmed", value: "paid", icon: CheckCircle2, color: "text-blue-600 bg-blue-50 border-blue-200" },
  { label: "Cancelled", value: "cancelled", icon: XCircle, color: "text-rose-600 bg-rose-50 border-rose-200" },
  { label: "Expired", value: "expired", icon: XCircle, color: "text-slate-600 bg-slate-50 border-slate-200" },
];

export function QuickStatusModal({ order, isOpen, onClose, onStatusUpdated }: QuickStatusModalProps) {
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);

  if (!order) return null;

  const handleSelectStatus = async (newStatus: Order["status"]) => {
    if (newStatus === order.status) {
      onClose();
      return;
    }

    setLoadingStatus(newStatus);
    try {
      await apiPut(`/orders/${order.id}/status`, { status: newStatus });
      onStatusUpdated();
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to update order status.");
    } finally {
      setLoadingStatus(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white rounded-3xl p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">
            Update Status for Order #{order.id}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Select a new fulfillment status for product <span className="font-semibold text-slate-800">{order.product_name}</span>.
          </DialogDescription>
        </DialogHeader>

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
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-sm font-semibold transition-all cursor-pointer ${
                  isCurrent
                    ? `${opt.color} ring-2 ring-indigo-500/20`
                    : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50/80 text-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl bg-white shadow-xs`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span>{opt.label}</span>
                </div>

                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                ) : isCurrent ? (
                  <span className="text-xs bg-slate-900 text-white px-2.5 py-0.5 rounded-full font-bold">
                    Current
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose} className="rounded-xl text-xs font-semibold">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
