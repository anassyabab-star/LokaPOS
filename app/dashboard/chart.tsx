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
              <stop offset="5%" stopColor="var(--maroon)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--maroon)" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid
            stroke="var(--hairline)"
            strokeDasharray="3 3"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            stroke="var(--muted-2)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="var(--muted-2)"
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
              backgroundColor: "var(--card)",
              border: "1px solid var(--hairline)",
              borderRadius: "10px",
              fontSize: "12px",
              color: "var(--ink)",
              boxShadow: "var(--shadow)",
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
            stroke="var(--maroon)"
            strokeWidth={2.5}
            dot={{
              r: 3,
              stroke: "var(--maroon)",
              strokeWidth: 2,
              fill: "var(--card)",
            }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
