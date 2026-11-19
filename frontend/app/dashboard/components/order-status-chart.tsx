"use client";

import {
Bar,
BarChart,
CartesianGrid,
Cell,
LabelList,
ResponsiveContainer,
Tooltip,
XAxis,
YAxis,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  pending: "#D9A441",
  confirmed: "#6C8EBF",
  paid: "#4F9D7A",
  shipped: "#5B7FA6",
  delivered: "#3E7C5A",
  cancelled: "#C8645A",
  expired: "#A8A39A",
};
const label = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

interface OrderStatusChartProps {
  data: { status: string; count: number; color?: string }[];
}

export function OrderStatusChart({ data }: OrderStatusChartProps) {
  if (data.length === 0) return <div className="min-h-64 rounded border border-border bg-white p-6"><h3 className="text-base font-bold text-foreground">Recent Orders Status Breakdown</h3><div className="flex min-h-44 flex-col items-center justify-center gap-4 text-center"><span aria-hidden="true" className="h-px w-10 bg-[#B89B6A]" /><p className="text-sm leading-6 text-muted-foreground">No recent orders.</p></div></div>;
  const rows = data.map((d) => ({ ...d, name: label(d.status), fill: d.color || STATUS_COLORS[d.status] || "#B89B6A" }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  return (
    <div className="bg-white p-6 rounded border border-border shadow-none space-y-4">
      <div>
        <h3 className="text-base font-bold text-foreground">Recent Orders Status Breakdown</h3>
        <p className="text-xs text-muted-foreground">{total} recent {total === 1 ? "order" : "orders"}, grouped by status</p>
      </div>

      <div className="w-full h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E3DB" />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B6761" }} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B6761" }} />
            <Tooltip
              cursor={{ fill: "rgba(184,155,106,0.10)" }}
              contentStyle={{ backgroundColor: "#1C1C1C", borderRadius: "4px", border: "none", fontSize: "12px" }}
              labelStyle={{ color: "#fff", fontWeight: 600 }}
              itemStyle={{ color: "#fff" }}
              formatter={(val: number) => [val, "Orders"]}
            />
            <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {rows.map((row) => (
                <Cell key={row.status} fill={row.fill} />
              ))}
              <LabelList dataKey="count" position="top" style={{ fontSize: 12, fontWeight: 600, fill: "#1C1C1C" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {rows.map((row) => (
          <li key={row.status} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: row.fill }} />
            {row.name} <span className="font-semibold text-foreground">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
