"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function DashboardClinicChart({
  data,
}: {
  data: { name: string; total: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8e4" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fill: "#68737A" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 12, fill: "#68737A" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(168, 195, 176, 0.14)" }}
            contentStyle={{
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.7)",
              background: "rgba(255,255,255,0.85)",
              fontSize: 13,
              boxShadow: "0 8px 24px rgba(37,49,59,0.06)",
            }}
            formatter={(value) => [value ?? 0, "Turnos"]}
          />
          <Bar
            dataKey="total"
            fill="#A8C3B0"
            radius={[12, 12, 0, 0]}
            maxBarSize={44}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
