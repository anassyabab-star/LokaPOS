"use client";

import {
  Area,
  AreaChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

type Props = {
  data: { date: string; total: number }[];
};

export default function SalesChart({ data }: Props) {
  const formattedData = data.map((point) => {
    const label = /^\d{4}-\d{2}-\d{2}$/.test(point.date)
      ? point.date.slice(5)
      : point.date;
    return { ...point, label };
  });

  return (
    <div className="h-52 md:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={formattedData}>
          <defs>
            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7F1D1D" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#7F1D1D" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid
            stroke="#1f2937"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="#666"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#666"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            domain={[
              0,
              (dataMax: number) => Math.ceil(dataMax * 1.2),
            ]}
            tickFormatter={(value: number) => `${Math.round(value)}`}
          />
          <Tooltip
            formatter={(value: unknown) => [`RM ${Number(value || 0).toFixed(2)}`, "Sales"]}
            labelFormatter={(label: unknown) => `Date: ${String(label ?? "")}`}
            contentStyle={{
              backgroundColor: "#111",
              border: "1px solid #333",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Area
            type="monotone"
            dataKey="total"
            stroke="none"
            fill="url(#salesGradient)"
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="#7F1D1D"
            strokeWidth={2.5}
            dot={{
              r: 3,
              stroke: "#7F1D1D",
              strokeWidth: 2,
              fill: "#000",
            }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
