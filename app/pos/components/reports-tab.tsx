"use client";

import { usePos, type ReportRange } from "../pos-context";

export default function ReportsTab() {
  const s = usePos();

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50/80 pb-20">
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Sales Report</h1>
          <div className="flex gap-1">
            <button onClick={() => {
              const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
              const from = s.reportRange === "yesterday" ? (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" }); })()
                : s.reportRange === "7days" ? (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" }); })()
                : s.reportRange === "month" ? (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" }); })()
                : today;
              window.open(`/api/admin/export?type=sales&from=${from}&to=${today}`, "_blank");
            }} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-600 active:bg-gray-200">Sales CSV</button>
            <button onClick={() => {
              const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
              const from30 = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" }); })();
              window.open(`/api/admin/export?type=daily&from=${from30}&to=${today}`, "_blank");
            }} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-600 active:bg-gray-200">Daily CSV</button>
            <button onClick={() => {
              const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" });
              const from30 = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Kuala_Lumpur" }); })();
              window.open(`/api/admin/export?type=expenses&from=${from30}&to=${today}`, "_blank");
            }} className="rounded-lg bg-gray-100 px-3 py-1.5 text-[11px] font-medium text-gray-600 active:bg-gray-200">Expenses CSV</button>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          {([["today", "1D"], ["yesterday", "Yesterday"], ["7days", "1W"], ["month", "1M"]] as [ReportRange, string][]).map(([val, label]) => (
            <button key={val} onClick={() => s.setReportRange(val)} className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${s.reportRange === val ? "bg-[#7F1D1D] text-white" : "bg-gray-100 text-gray-600"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {s.reportLoading ? (
        <div className="flex items-center justify-center py-20"><div className="text-sm text-gray-400">Memuatkan...</div></div>
      ) : s.reportData ? (() => {
        const gross = s.reportData.orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
        const orderCount = s.reportData.orders.length;
        const avg = orderCount > 0 ? gross / orderCount : 0;
        const pl = s.reportData.monthlyPL;
        const paymentEntries = Object.entries(s.reportData.paymentMix);
        const paymentTotal = paymentEntries.reduce((sum, [, v]) => sum + v, 0);
        return (
          <div className="px-4 py-4 space-y-3">
            {/* Sales Summary */}
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: "Gross Sales", value: `RM${gross.toFixed(2)}` },
                { label: "Net Sales", value: `RM${gross.toFixed(2)}` },
                { label: "Total Orders", value: `${orderCount}` },
                { label: "Average Sale", value: `RM${avg.toFixed(2)}` },
              ].map(card => (
                <div key={card.label} className="rounded-xl bg-white border border-gray-200/80 p-3.5">
                  <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">{card.label}</div>
                  <div className="mt-1 text-xl font-bold text-gray-900">{card.value}</div>
                </div>
              ))}
            </div>

            {/* Yesterday comparison */}
            <div className="flex items-center gap-2 rounded-xl bg-white border border-gray-200/80 px-4 py-3">
              <span className="text-xs text-gray-400">vs Semalam</span>
              <span className="text-sm font-bold text-gray-700">RM{s.reportData.yesterdaySales.toFixed(2)}</span>
              {gross > 0 && s.reportData.yesterdaySales > 0 && (() => {
                const diff = ((gross - s.reportData.yesterdaySales) / s.reportData.yesterdaySales) * 100;
                return <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${diff >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{diff >= 0 ? "+" : ""}{diff.toFixed(0)}%</span>;
              })()}
            </div>

            {/* Payment Breakdown */}
            {paymentEntries.length > 0 && (
              <div className="rounded-xl bg-white border border-gray-200/80 p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-3">Payment Breakdown</div>
                <div className="space-y-2.5">
                  {paymentEntries.map(([method, amount]) => {
                    const pct = paymentTotal > 0 ? (amount / paymentTotal) * 100 : 0;
                    const colors: Record<string, string> = { qr: "bg-blue-500", cash: "bg-green-500", card: "bg-purple-500" };
                    return (
                      <div key={method}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-700 capitalize">{method}</span>
                          <span className="text-sm font-bold tabular-nums text-gray-900">RM{amount.toFixed(2)}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                          <div className={`h-full rounded-full ${colors[method.toLowerCase()] || "bg-gray-400"} transition-all duration-500`} style={{ width: `${Math.max(pct, 2)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top Products */}
            {s.reportData.topProducts.length > 0 && (
              <div className="rounded-xl bg-white border border-gray-200/80 p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400 mb-3">Top Products</div>
                <div className="space-y-0">
                  {s.reportData.topProducts.map((p, i) => {
                    const maxQty = s.reportData!.topProducts[0]?.total_qty || 1;
                    const pct = (p.total_qty / maxQty) * 100;
                    return (
                      <div key={p.product_name} className={`flex items-center gap-3 px-1 py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${i === 0 ? "bg-[#7F1D1D] text-white" : i === 1 ? "bg-[#7F1D1D]/20 text-[#7F1D1D]" : i === 2 ? "bg-[#7F1D1D]/10 text-[#7F1D1D]" : "bg-gray-100 text-gray-500"}`}>{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-gray-800 truncate">{p.product_name}</div>
                          <div className="mt-0.5 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                            <div className="h-full rounded-full bg-[#7F1D1D]/30 transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                        <span className="text-xs font-bold tabular-nums text-gray-500 shrink-0">{p.total_qty} sold</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Peak Hour */}
            {s.reportData.bestHour && (
              <div className="flex items-center gap-3 rounded-xl bg-white border border-gray-200/80 px-4 py-3.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-lg">⚡</span>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Peak Hour</div>
                  <div className="text-sm font-bold text-gray-900">{s.reportData.bestHour}:00 <span className="font-normal text-gray-500">—</span> RM{s.reportData.bestHourSales.toFixed(2)}</div>
                </div>
              </div>
            )}

            {/* Monthly P&L */}
            <div className="rounded-xl bg-white border border-gray-200/80 overflow-hidden">
              <div className="px-4 pt-4 pb-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-gray-400">Monthly P&L ({pl.month})</div>
              </div>
              <div>
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/50"><span className="text-sm text-gray-600">Sales</span><span className="text-sm font-semibold tabular-nums text-gray-900">RM{pl.sales.toFixed(2)}</span></div>
                <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-gray-600">Expenses</span><span className="text-sm font-semibold tabular-nums text-red-600">-RM{pl.expenses.toFixed(2)}</span></div>
                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50/50"><span className="text-sm text-gray-600">Paid Out</span><span className="text-sm font-semibold tabular-nums text-red-600">-RM{pl.paid_out.toFixed(2)}</span></div>
                <div className={`flex items-center justify-between px-4 py-3 border-t-2 ${pl.profit_loss >= 0 ? "border-green-200 bg-green-50/50" : "border-red-200 bg-red-50/50"}`}>
                  <span className="text-sm font-bold text-gray-900">Profit/Loss</span>
                  <span className={`text-base font-bold tabular-nums ${pl.profit_loss >= 0 ? "text-green-700" : "text-red-700"}`}>RM{pl.profit_loss.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Low Stock */}
            {s.reportData.lowStock.length > 0 && (
              <div className="rounded-xl bg-white border border-amber-200 overflow-hidden">
                <div className="flex items-center gap-2 bg-amber-50 px-4 py-2.5 border-b border-amber-200">
                  <span className="text-sm">⚠️</span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">Low Stock Alert</span>
                </div>
                <div>
                  {s.reportData.lowStock.map((p, i) => (
                    <div key={p.id} className={`flex items-center justify-between px-4 py-2.5 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}>
                      <span className="text-sm text-gray-700">{p.name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.stock === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{p.stock} left</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })() : (
        <div className="flex items-center justify-center py-20"><div className="text-sm text-gray-400">Tiada data</div></div>
      )}
    </div>
  );
}
