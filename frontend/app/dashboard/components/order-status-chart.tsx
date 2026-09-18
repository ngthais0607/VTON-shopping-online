"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

interface OrderStatusChartProps {
  data?: { status: string; count: number; color?: string }[];
}

const defaultData = [
  { status: "Pending", count: 12, color: "#f59e0b" },
  { status: "Processing", count: 19, color: "#3b82f6" },
  { status: "Shipped", count: 24, color: "#8b5cf6" },
  { status: "Delivered", count: 45, color: "#10b981" },
  { status: "Cancelled", count: 4, color: "#f43f5e" },
];

export function OrderStatusChart({ data = defaultData }: OrderStatusChartProps) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-900">Orders Status Breakdown</h3>
          <p className="text-xs text-slate-500">Distribution across active order fulfillment stages</p>
        </div>
      </div>

      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#0f172a", borderRadius: "12px", border: "none", color: "#fff", fontSize: "12px" }}
              formatter={(val: number) => [val, "Orders"]}
            />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || "#4f46e5"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
