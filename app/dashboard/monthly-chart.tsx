"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export type MonthPoint = {
  month: string;
  label: string;
  sales: number;
  orders: number;
  expenses: number;
  profit_loss: number;
  /** The current month is still filling up — drawn lighter so it is not read
   *  as a drop against six complete months. */
  partial?: boolean;
};

const rm = (v: number) => `RM ${Number(v || 0).toFixed(2)}`;

export default function MonthlyChart({ data }: { data: MonthPoint[] }) {
  return (
    <div className="h-52 md:h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="var(--d-border, #e5e7eb)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" stroke="var(--d-text-3, #9ca3af)" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis
            stroke="var(--d-text-3, #9ca3af)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            cursor={{ fill: "rgba(127,29,29,0.06)" }}
            contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid var(--d-border, #e5e7eb)" }}
            formatter={((value: unknown) => [rm(Number(value || 0)), "Sales"]) as never}
            labelFormatter={((label: unknown, payload: unknown) => {
              const first = Array.isArray(payload) ? (payload[0] as { payload?: MonthPoint } | undefined) : undefined;
              const p = first?.payload;
              if (!p) return String(label ?? "");
              return `${p.month}${p.partial ? " (so far)" : ""} · ${p.orders} orders`;
            }) as never}
          />
          {/* One <Bar> with a plain fill. Per-bar <Cell> children render empty
              in recharts 3, so the month still in progress is marked by the
              "so far" label under the chart instead of a lighter bar. */}
          <Bar
            dataKey="sales"
            fill="#7F1D1D"
            radius={[6, 6, 0, 0]}
            maxBarSize={44}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
