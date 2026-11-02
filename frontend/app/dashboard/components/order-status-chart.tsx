"use client";

import {
Bar,
BarChart,
CartesianGrid,
Cell,
ResponsiveContainer,
Tooltip,
XAxis,
YAxis,
} from "recharts";

interface OrderStatusChartProps {
  data: { status: string; count: number; color?: string }[];
}

export function OrderStatusChart({ data }: OrderStatusChartProps) {
  if (data.length === 0) return <div className="min-h-64 rounded border border-border bg-white p-6"><h3 className="text-sm font-medium">Recent Orders Status Breakdown</h3><div className="flex min-h-44 flex-col items-center justify-center gap-4 text-center"><span aria-hidden="true" className="h-px w-10 bg-[#B89B6A]" /><p className="text-sm leading-6 text-muted-foreground">No recent orders.</p></div></div>;
  return (
    <div className="bg-white p-6 rounded border border-border shadow-none space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground">Recent Orders Status Breakdown</h3>
          <p className="text-xs text-muted-foreground">Distribution within the recent orders shown below</p>
        </div>
      </div>

      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E3DB" />
            <XAxis dataKey="status" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B6761" }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B6761" }} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1C1C1C", borderRadius: "4px", border: "none", color: "#fff", fontSize: "12px" }}
              formatter={(val: number) => [val, "Orders"]}
            />
            <Bar dataKey="count" radius={[8, 8, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color || "#B89B6A"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
