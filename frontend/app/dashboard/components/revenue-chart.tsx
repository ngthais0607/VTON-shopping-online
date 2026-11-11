"use client";

import { formatCurrency } from "@/lib/utils";
import {
Area,
AreaChart,
CartesianGrid,
ResponsiveContainer,
Tooltip,
XAxis,
YAxis,
} from "recharts";

interface RevenueChartProps {
  data: { name: string; revenue: number }[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  if (data.length === 0) return <div className="min-h-64 rounded border border-border bg-white p-6"><h3 className="text-base font-bold text-foreground">Revenue history</h3><div className="flex min-h-44 flex-col items-center justify-center gap-4 text-center"><span aria-hidden="true" className="h-px w-10 bg-[#B89B6A]" /><p className="max-w-xs text-sm leading-6 text-muted-foreground">No revenue history data is available.</p></div></div>;
  return (
    <div className="bg-white p-6 rounded border border-border shadow-none space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground">Revenue Analytics</h3>
          <p className="text-xs text-muted-foreground">Revenue for the supplied period</p>
        </div>

      </div>

      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#B89B6A" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#B89B6A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E3DB" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B6761" }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B6761" }} tickFormatter={(v) => formatCurrency(Number(v))} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1C1C1C", borderRadius: "4px", border: "none", color: "#fff", fontSize: "12px" }}
              formatter={(val: number) => [formatCurrency(Number(val)), "Revenue"]}
            />
            <Area type="monotone" dataKey="revenue" stroke="#B89B6A" strokeWidth={1.5} fillOpacity={1} fill="url(#colorRevenue)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
