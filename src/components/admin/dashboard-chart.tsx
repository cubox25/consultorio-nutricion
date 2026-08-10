"use client";

import {
  Line,
  LineChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function DashboardPatientsChart({
  data,
}: {
  data: { label: string; total: number }[];
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3e4e6" vertical={false} />
          <XAxis
            dataKey="label"
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
            contentStyle={{
              borderRadius: 16,
              border: "1px solid #f3e4e6",
              background: "#fff",
              fontSize: 13,
              boxShadow: "0 8px 24px rgba(229,123,135,0.1)",
            }}
            formatter={(value) => [value ?? 0, "Pacientes"]}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#E57B87"
            strokeWidth={3}
            dot={{ r: 5, fill: "#E57B87", strokeWidth: 0 }}
            activeDot={{ r: 7, fill: "#E57B87" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Compat: export antiguo usado por otras vistas */
export { DashboardPatientsChart as DashboardClinicChart };
