"use client";

import React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Order } from "@/lib/types";

interface ExportCSVButtonProps {
  orders: Order[];
}

export function ExportCSVButton({ orders }: ExportCSVButtonProps) {
  const handleExport = () => {
    if (!orders || orders.length === 0) {
      alert("No order data available to export.");
      return;
    }

    // Prepare CSV headers & rows
    const headers = ["Order ID", "Product", "Quantity", "Total Amount", "Status", "Payment Status", "Created At"];
    const rows = orders.map((o) => [
      `"#${o.id}"`,
      `"${(o.product_name || "").replace(/"/g, '""')}"`,
      o.quantity,
      o.total_amount,
      `"${o.status}"`,
      `"${o.payment_status}"`,
      `"${o.created_at || ""}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("download", `orders-report-${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Button
      onClick={handleExport}
      variant="outline"
      className="flex items-center gap-2 bg-white text-slate-700 hover:bg-slate-50 border-slate-200 shadow-xs text-xs font-semibold"
    >
      <Download className="w-3.5 h-3.5 text-indigo-600" />
      Export CSV
    </Button>
  );
}
