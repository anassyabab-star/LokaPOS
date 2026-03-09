"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

const SalesChart = dynamic(() => import("./chart"), {
  ssr: false,
});

type Order = {
  id: string;
  total: number;
  payment_method: string;
  date_key?: string;
  created_at?: string;
};

type TopProduct = {
  product_name: string;
  total_qty: number;
};

type LowStockItem = {
  id: string;
  name: string;
  stock: number;
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      const res = await fetch(`/api/dashboard?range=${range}`);
      const data = await res.json();

      setOrders(data.orders || []);
      setTopProducts(data.topProducts || []);
      setYesterdaySales(data.yesterdaySales || 0);
      setBestHour(data.bestHour || null);
      setBestHourSales(data.bestHourSales || 0);
      setPaymentMix(data.paymentMix || {});
      setLowStock(data.lowStock || []);

      setLoading(false);
    };

    loadData();
  }, [range]);

  const totalSales = orders.reduce(
    (sum, o) => sum + Number(o.total),
    0
  );

  const totalCustomers = orders.length;

  const avgSpend =
    totalCustomers > 0 ? totalSales / totalCustomers : 0;

  const percentChange =
    yesterdaySales > 0
      ? ((totalSales - yesterdaySales) / yesterdaySales) * 100
      : 0;

  const trendMap: Record<string, number> = {};
  orders.forEach(order => {
    const date = order.date_key || "Today";
    trendMap[date] =
      (trendMap[date] || 0) + Number(order.total);
  });

  const trendData = Object.entries(trendMap).map(
    ([date, total]) => ({
      date,
      total,
    })
  );
  const peakTrendPoint =
    trendData.length > 0
      ? trendData.reduce((max, point) =>
          point.total > max.total ? point : max
        )
      : null;

  const totalPaymentSales = Object.values(paymentMix).reduce(
    (sum, value) => sum + Number(value),
    0
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  const maxQty =
    topProducts.length > 0
      ? Math.max(...topProducts.map(p => p.total_qty))
      : 1;

  return (
    <div className="min-h-screen bg-black text-gray-200 p-4 space-y-6 md:p-6">

      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-xs text-gray-500">Live operational snapshot</p>
        </div>

        <select
          value={range}
          onChange={e => setRange(e.target.value)}
          className="bg-[#111111] border border-gray-700 text-sm px-3 py-2 rounded-md w-full sm:w-auto"
        >
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="7days">Last 7 Days</option>
          <option value="month">This Month</option>
        </select>
      </div>

      {/* KPI */}
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1 text-sm md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        <div className="min-w-[170px] snap-start bg-[#111111] border border-gray-800 rounded-lg p-3 md:min-w-0">
          <p className="text-xs text-gray-500">Sales</p>
          <p className="text-base font-semibold mt-1">
            RM {totalSales.toFixed(2)}
          </p>
          <p
            className={`text-xs mt-1 ${
              percentChange >= 0
                ? "text-green-400"
                : "text-[#7F1D1D]"
            }`}
          >
            {percentChange >= 0 ? "▲" : "▼"}{" "}
            {percentChange.toFixed(1)}% vs yesterday
          </p>
        </div>

        <div className="min-w-[170px] snap-start bg-[#111111] border border-gray-800 rounded-lg p-3 md:min-w-0">
          <p className="text-xs text-gray-500">Customers</p>
          <p className="text-base font-semibold mt-1">
            {totalCustomers}
          </p>
        </div>

        <div className="min-w-[170px] snap-start bg-[#111111] border border-gray-800 rounded-lg p-3 md:min-w-0">
          <p className="text-xs text-gray-500">Avg Spend</p>
          <p className="text-base font-semibold mt-1">
            RM {avgSpend.toFixed(2)}
          </p>
        </div>

        <div className="min-w-[170px] snap-start bg-[#111111] border border-gray-800 rounded-lg p-3 md:min-w-0">
          <p className="text-xs text-gray-500">Best Hour</p>
          <p className="text-base font-semibold mt-1">
            {bestHour ? `${bestHour}:00` : "—"}
          </p>
          <p className="text-xs text-gray-400">
            RM {bestHourSales.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="bg-[#111111] border border-gray-800 rounded-lg p-4 space-y-3">
          <p className="text-xs text-gray-500 uppercase">
            Payment Mix
          </p>

          {totalPaymentSales <= 0 ? (
            <p className="text-xs text-gray-500">No payment data</p>
          ) : (
            Object.entries(paymentMix)
              .sort((a, b) => b[1] - a[1])
              .map(([method, amount]) => {
                const pct = (Number(amount) / totalPaymentSales) * 100;
                return (
                  <div key={method} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="capitalize">{method}</span>
                      <span>RM {Number(amount).toFixed(2)} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full bg-gray-800 h-1.5 rounded">
                      <div
                        className="h-1.5 bg-[#7F1D1D] rounded"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })
          )}
        </div>

        <div className="bg-[#111111] border border-gray-800 rounded-lg p-4 space-y-3">
          <p className="text-xs text-gray-500 uppercase">
            Low Stock Alerts
          </p>

          {lowStock.length === 0 ? (
            <p className="text-xs text-green-400">All active products stock looks healthy</p>
          ) : (
            lowStock.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 text-sm border border-gray-800 rounded-md px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate pr-3">{item.name}</p>
                  <p className="text-red-400 font-semibold">Stock: {item.stock}</p>
                </div>
                <Link
                  href={`/dashboard/products?highlight=${item.id}`}
                  className="shrink-0 rounded-md bg-[#7F1D1D] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#942424]"
                >
                  Restock
                </Link>
              </div>
            ))
          )}
        </div>
      </div>

      {/* TREND GRAPH */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-4">
        <div className="mb-3 flex items-start justify-between">
          <p className="text-xs text-gray-500 uppercase">Sales Trend</p>
          <div className="text-right text-xs text-gray-400">
            <p>Peak</p>
            <p className="text-gray-300">
              {peakTrendPoint
                ? `${peakTrendPoint.date} • RM ${peakTrendPoint.total.toFixed(2)}`
                : "—"}
            </p>
          </div>
        </div>
        <SalesChart data={trendData} />
      </div>

      {/* TOP PRODUCTS */}
      <div className="bg-[#111111] border border-gray-800 rounded-lg p-4 space-y-3 text-sm">
        <p className="text-xs text-gray-500 uppercase">
          Top Products
        </p>

        {topProducts.length === 0 && (
          <p className="text-gray-500 text-xs">
            No sales
          </p>
        )}

        {topProducts.map((p, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <span>
                {i + 1}. {p.product_name}
              </span>
              <span className="text-[#7F1D1D] font-semibold">
                {p.total_qty}
              </span>
            </div>

            <div className="w-full bg-gray-800 h-1 rounded">
              <div
                className="h-1 bg-[#7F1D1D] rounded"
                style={{
                  width: `${(p.total_qty / maxQty) * 100}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
