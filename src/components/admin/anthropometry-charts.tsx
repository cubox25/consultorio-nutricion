"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export type AnthropometryChartPoint = {
  date: string;
  peso: number | null;
  imc: number | null;
  grasa: number | null;
  musculo: number | null;
};

export function AnthropometryCharts({
  data,
}: {
  data: AnthropometryChartPoint[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8F1EB" />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "#68737A" }} />
        <YAxis tick={{ fontSize: 12, fill: "#68737A" }} />
        <Tooltip
          contentStyle={{
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.7)",
            background: "rgba(255,255,255,0.9)",
            fontSize: 13,
          }}
        />
        <Legend />
        <Line
          type="monotone"
          dataKey="peso"
          name="Peso (kg)"
          stroke="#879E46"
          strokeWidth={2}
          dot
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="imc"
          name="IMC"
          stroke="#BBD5A6"
          strokeWidth={2}
          dot
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="grasa"
          name="% Grasa"
          stroke="#E57B87"
          strokeWidth={2}
          dot
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="musculo"
          name="Masa muscular"
          stroke="#FEBD3D"
          strokeWidth={2}
          dot
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
