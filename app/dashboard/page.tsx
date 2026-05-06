"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  PageWrapper, PageHeader, Card, StatCard, SectionLabel,
  ErrorScreen, GhostBtn, DSelect,
} from "./_ui";

const SalesChart = dynamic(() => import("./chart"), { ssr: false });

type Order = {
  id: string;
  total: number;
  payment_method: string;
  date_key?: string;
  created_at?: string;
};

type TopProduct = { product_name: string; total_qty: number };
type LowStockItem = { id: string; name: string; stock: number };

type MonthlyPL = {
  month: string;
  sales: number;
  expenses: number;
  paid_out: number;
  outflow: number;
  profit_loss: number;
};

export default function DashboardPage() {
  const [range, setRange] = useState("today");
  const [orders, setOrders] = useState<Order[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [paymentMix, setPaymentMix] = useState<Record<string, number>>({});
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [yesterdaySales, setYesterdaySales] = useState(0);
  const [bestHour, setBestHour] = useState<string | null>(null);
  const [bestHourSales, setBestHourSales] = useState(0);
  const [monthlyPL, setMonthlyPL] = useState<MonthlyPL>({
    month: "", sales: 0, expenses: 0, paid_out: 0, outflow: 0, profit_loss: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/dashboard?range=${range}`);
        if (!res.ok) throw new Error(`Server error (${res.status})`);
        const data = await res.json();
        setOrders(data.orders || []);
        setTopProducts(data.topProducts || []);
        setYesterdaySales(data.yesterdaySales || 0);
        setBestHour(data.bestHour || null);
        setBestHourSales(data.bestHourSales || 0);
        setPaymentMix(data.paymentMix || {});
        setLowStock(data.lowStock || []);
        setMonthlyPL((data.monthlyPL as MonthlyPL) || { month: "", sales: 0, expenses: 0, paid_out: 0, outflow: 0, profit_loss: 0 });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal muatkan data dashboard");
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [range, retryKey]);

  const totalSales = orders.reduce((sum, o) => sum + Number(o.total), 0);
  const totalOrders = orders.length;
  const avgSpend = totalOrders > 0 ? totalSales / totalOrders : 0;
  const percentChange = yesterdaySales > 0 ? ((totalSales - yesterdaySales) / yesterdaySales) * 100 : 0;

  const trendMap: Record<string, number> = {};
  orders.forEach(o => {
    const date = o.date_key || "Today";
    trendMap[date] = (trendMap[date] || 0) + Number(o.total);
  });
  const trendData = Object.entries(trendMap).map(([date, total]) => ({ date, total }));
  const peakTrendPoint = trendData.length > 0
    ? trendData.reduce((max, pt) => pt.total > max.total ? pt : max)
    : null;

  const totalPaymentSales = Object.values(paymentMix).reduce((sum, v) => sum + Number(v), 0);
  const maxQty = topProducts.length > 0 ? Math.max(...topProducts.map(p => p.total_qty)) : 1;

  if (loading) {
    return (
      <PageWrapper>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 700 }}>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                height: 80,
                borderRadius: 12,
                background: "var(--d-surface)",
                border: "1px solid var(--d-border)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper>
        <ErrorScreen message={error} onRetry={() => setRetryKey(k => k + 1)} />
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Header */}
      <PageHeader
        title="Overview"
        desc="Live operational snapshot"
        action={
          <DSelect
            value={range}
            onChange={e => setRange(e.target.value)}
            style={{ width: "auto", minWidth: 150 }}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="7days">Last 7 Days</option>
            <option value="month">This Month</option>
          </DSelect>
        }
      />

      {/* KPI row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <StatCard
          label="Sales"
          value={`RM ${totalSales.toFixed(2)}`}
          sub={
            <span style={{ color: percentChange >= 0 ? "var(--d-success)" : "var(--d-error)" }}>
              {percentChange >= 0 ? "▲" : "▼"} {Math.abs(percentChange).toFixed(1)}% vs yesterday
            </span>
          }
        />
        <StatCard label="Orders" value={totalOrders} />
        <StatCard label="Avg Spend" value={`RM ${avgSpend.toFixed(2)}`} />
        <StatCard
          label="Best Hour"
          value={bestHour ? `${bestHour}:00` : "—"}
          sub={bestHour ? `RM ${bestHourSales.toFixed(2)}` : undefined}
        />
        <StatCard
          label={`Monthly P/L${monthlyPL.month ? ` (${monthlyPL.month})` : ""}`}
          value={`RM ${monthlyPL.profit_loss.toFixed(2)}`}
          accent={monthlyPL.profit_loss >= 0 ? "var(--d-success)" : "var(--d-error)"}
          sub={`Sales ${monthlyPL.sales.toFixed(2)} · Out ${monthlyPL.outflow.toFixed(2)}`}
        />
      </div>

      {/* Mid row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {/* Payment Mix */}
        <Card style={{ padding: 18 }}>
          <SectionLabel>Payment Mix</SectionLabel>
          {totalPaymentSales <= 0 ? (
            <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>No payment data</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(paymentMix)
                .sort((a, b) => b[1] - a[1])
                .map(([method, amount]) => {
                  const pct = (Number(amount) / totalPaymentSales) * 100;
                  return (
                    <div key={method}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: "var(--d-text-1)", textTransform: "capitalize" }}>{method}</span>
                        <span style={{ color: "var(--d-text-2)" }}>
                          RM {Number(amount).toFixed(2)} <span style={{ color: "var(--d-text-3)" }}>({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <div style={{ height: 5, borderRadius: 4, background: "var(--d-surface-hover)", overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            borderRadius: 4,
                            background: "var(--d-accent)",
                            width: `${pct}%`,
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>

        {/* Low Stock */}
        <Card style={{ padding: 18 }}>
          <SectionLabel>Low Stock Alerts</SectionLabel>
          {lowStock.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--d-success)" }}>All active products healthy</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {lowStock.map(item => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "var(--d-surface-hover)",
                    border: "1px solid var(--d-border-soft)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, color: "var(--d-text-1)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.name}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--d-error)", fontWeight: 600 }}>
                      Stock: {item.stock}
                    </p>
                  </div>
                  <Link
                    href={`/dashboard/products?highlight=${item.id}`}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 7,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#fff",
                      background: "var(--d-accent)",
                      textDecoration: "none",
                      flexShrink: 0,
                    }}
                  >
                    Restock
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Sales Trend */}
      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <SectionLabel>Sales Trend</SectionLabel>
          {peakTrendPoint && (
            <p style={{ fontSize: 11, color: "var(--d-text-3)" }}>
              Peak: {peakTrendPoint.date} · RM {peakTrendPoint.total.toFixed(2)}
            </p>
          )}
        </div>
        <SalesChart data={trendData} />
      </Card>

      {/* Top Products */}
      <Card style={{ padding: 18 }}>
        <SectionLabel>Top Products</SectionLabel>
        {topProducts.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>No sales in this period</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topProducts.map((p, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: "var(--d-text-1)" }}>
                    {i + 1}. {p.product_name}
                  </span>
                  <span style={{ color: "var(--d-accent)", fontWeight: 600 }}>{p.total_qty}</span>
                </div>
                <div style={{ height: 4, borderRadius: 4, background: "var(--d-surface-hover)", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      borderRadius: 4,
                      background: "var(--d-accent)",
                      width: `${(p.total_qty / maxQty) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </PageWrapper>
  );
}
