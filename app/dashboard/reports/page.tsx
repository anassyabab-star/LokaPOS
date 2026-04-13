"use client";

import { useCallback, useEffect, useState } from "react";

/* ─── Types ──────────────────────────────────────────────── */
type ShiftListItem = {
  id: string;
  register_id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  opened_by_name: string;
  over_short: number | null;
};

type ShiftReport = {
  shift: {
    id: string;
    register_id: string;
    opened_at: string;
    closed_at: string | null;
    status: "open" | "closed";
    opening_cash: number;
    opening_note: string | null;
    counted_cash: number | null;
    expected_cash: number | null;
    over_short: number | null;
    closing_note: string | null;
    opened_by_name: string;
    opened_by_email: string | null;
  };
  summary: {
    total_sales: number;
    order_count: number;
    avg_spend: number;
    paid_out_total: number;
    net_sales: number;
  };
  hourly: Array<{ hour: number; label: string; sales: number; orders: number }>;
  payment_mix: Record<string, number>;
  top_products: Array<{ name: string; qty: number; revenue: number }>;
};

/* ─── Helpers ────────────────────────────────────────────── */
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
}

function fmtRM(n: number) {
  return `RM ${n.toFixed(2)}`;
}

/* ─── Sub-components ─────────────────────────────────────── */
function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 12, padding: "14px 16px" }}>
      <p style={{ fontSize: 10, fontWeight: 600, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: accent ?? "var(--d-text-1)", marginTop: 6, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "var(--d-text-3)", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

function HourlyChart({ data }: { data: ShiftReport["hourly"] }) {
  const maxSales = Math.max(...data.map(d => d.sales), 1);
  return (
    <div>
      <p style={{ fontSize: 10, fontWeight: 600, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 12 }}>
        Hourly Sales Breakdown
      </p>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120, overflowX: "auto", paddingBottom: 4 }}>
        {data.map(d => {
          const pct = (d.sales / maxSales) * 100;
          const isZero = d.sales === 0;
          return (
            <div
              key={d.hour}
              title={`${d.label}: ${fmtRM(d.sales)} (${d.orders} orders)`}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 32, flex: 1 }}
            >
              <p style={{ fontSize: 9, color: "var(--d-text-3)", marginBottom: 3, whiteSpace: "nowrap" }}>
                {d.sales > 0 ? fmtRM(d.sales).replace("RM ", "") : ""}
              </p>
              <div
                style={{
                  width: "100%",
                  borderRadius: "4px 4px 0 0",
                  background: isZero ? "var(--d-border-soft)" : "var(--d-accent)",
                  height: isZero ? 4 : `${Math.max(pct, 6)}%`,
                  transition: "height 0.4s ease",
                  opacity: isZero ? 0.4 : 1,
                }}
              />
              <p style={{ fontSize: 9, color: "var(--d-text-3)", marginTop: 4, whiteSpace: "nowrap" }}>
                {d.label.replace(":00", "")}
              </p>
            </div>
          );
        })}
      </div>
      {data.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>No hourly data.</p>
      )}
    </div>
  );
}

function PaymentMixBars({ mix }: { mix: Record<string, number> }) {
  const total = Object.values(mix).reduce((s, v) => s + v, 0);
  const sorted = Object.entries(mix).sort((a, b) => b[1] - a[1]);

  if (total <= 0) return <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>No payments recorded.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {sorted.map(([method, amount]) => {
        const pct = (amount / total) * 100;
        return (
          <div key={method}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: "var(--d-text-1)", textTransform: "capitalize" }}>{method}</span>
              <span style={{ color: "var(--d-text-2)" }}>
                {fmtRM(amount)} <span style={{ color: "var(--d-text-3)" }}>({pct.toFixed(0)}%)</span>
              </span>
            </div>
            <div style={{ height: 5, borderRadius: 4, background: "var(--d-surface-hover)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 4, background: "var(--d-accent)", width: `${pct}%`, transition: "width 0.5s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────── */
export default function ReportsPage() {
  const [shifts, setShifts] = useState<ShiftListItem[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [shiftsError, setShiftsError] = useState<string | null>(null);

  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  // Load shift list
  const loadShifts = useCallback(async () => {
    setShiftsLoading(true);
    setShiftsError(null);
    try {
      const res = await fetch("/api/admin/pos-shifts?status=all", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load shifts");
      setShifts((data.shifts || []) as ShiftListItem[]);
    } catch (e) {
      setShiftsError(e instanceof Error ? e.message : "Failed to load shifts");
    } finally {
      setShiftsLoading(false);
    }
  }, []);

  useEffect(() => { void loadShifts(); }, [loadShifts]);

  // Auto-select most recent shift
  useEffect(() => {
    if (shifts.length > 0 && !selectedShiftId) {
      setSelectedShiftId(shifts[0].id);
    }
  }, [shifts, selectedShiftId]);

  // Load report when shift selected
  useEffect(() => {
    if (!selectedShiftId) return;

    const fetchReport = async () => {
      setReportLoading(true);
      setReportError(null);
      setReport(null);
      try {
        const res = await fetch(`/api/admin/reports/shift-sales?shift_id=${selectedShiftId}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load report");
        setReport(data as ShiftReport);
      } catch (e) {
        setReportError(e instanceof Error ? e.message : "Failed to load report");
      } finally {
        setReportLoading(false);
      }
    };

    void fetchReport();
  }, [selectedShiftId]);

  const selectedShift = shifts.find(s => s.id === selectedShiftId);

  return (
    <div style={{ minHeight: "100vh", background: "var(--d-bg)", padding: "28px 28px 40px", color: "var(--d-text-1)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Sales Report</h1>
        <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>
          Laporan jualan lengkap by shift — sales, payment mix, hourly breakdown, dan top products.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, alignItems: "flex-start" }}>
        {/* ── Left: Shift selector ─────────────────────── */}
        <div
          style={{
            background: "var(--d-surface)",
            border: "1px solid var(--d-border)",
            borderRadius: 14,
            overflow: "hidden",
            position: "sticky",
            top: 20,
          }}
        >
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--d-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--d-text-2)" }}>Shifts</p>
            <button
              type="button"
              onClick={() => void loadShifts()}
              style={{ fontSize: 11, color: "var(--d-text-3)", background: "none", border: "none", cursor: "pointer" }}
            >
              Refresh
            </button>
          </div>

          <div style={{ maxHeight: "calc(100vh - 160px)", overflowY: "auto" }}>
            {shiftsLoading && (
              <p style={{ padding: "14px 14px", fontSize: 12, color: "var(--d-text-3)" }}>Loading shifts...</p>
            )}
            {shiftsError && (
              <p style={{ padding: "14px 14px", fontSize: 12, color: "var(--d-error)" }}>{shiftsError}</p>
            )}
            {!shiftsLoading && shifts.length === 0 && (
              <p style={{ padding: "14px 14px", fontSize: 12, color: "var(--d-text-3)" }}>No shifts found.</p>
            )}
            {shifts.map(shift => {
              const isSelected = shift.id === selectedShiftId;
              const isShort = (shift.over_short ?? 0) < 0;
              return (
                <button
                  key={shift.id}
                  type="button"
                  onClick={() => setSelectedShiftId(shift.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 14px",
                    background: isSelected ? "var(--d-accent-soft)" : "transparent",
                    borderLeft: isSelected ? "3px solid var(--d-accent)" : "3px solid transparent",
                    border: "none",
                    borderBottom: "1px solid var(--d-border-soft)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: isSelected ? "var(--d-accent)" : "var(--d-text-1)" }}>
                      {new Date(shift.opened_at).toLocaleString("en-MY", {
                        timeZone: "Asia/Kuala_Lumpur",
                        day: "2-digit", month: "short",
                        hour: "2-digit", minute: "2-digit", hour12: true,
                      })}
                    </span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
                      textTransform: "uppercase",
                      color: shift.status === "open" ? "var(--d-warning)" : "var(--d-text-3)",
                      background: shift.status === "open" ? "var(--d-warning-soft)" : "var(--d-surface-hover)",
                    }}>
                      {shift.status}
                    </span>
                  </div>
                  <p style={{ fontSize: 10, color: "var(--d-text-3)", marginTop: 2 }}>
                    {shift.opened_by_name} · {shift.register_id}
                  </p>
                  {isShort && (
                    <p style={{ fontSize: 10, color: "var(--d-error)", marginTop: 1 }}>Cash short</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Right: Report content ─────────────────────── */}
        <div>
          {!selectedShiftId && !shiftsLoading && (
            <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "40px 20px", textAlign: "center" }}>
              <p style={{ fontSize: 14, color: "var(--d-text-2)" }}>Select a shift from the left to view its report.</p>
            </div>
          )}

          {reportLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[80, 200, 140].map((h, i) => (
                <div key={i} style={{ height: h, borderRadius: 12, background: "var(--d-surface)", border: "1px solid var(--d-border)", opacity: 0.6, animation: "pulse 1.5s ease-in-out infinite" }} />
              ))}
            </div>
          )}

          {reportError && (
            <div style={{ padding: "12px 14px", borderRadius: 10, fontSize: 13, color: "var(--d-error)", background: "var(--d-error-soft)", border: "1px solid var(--d-error)" }}>
              {reportError}
            </div>
          )}

          {report && !reportLoading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Shift header card */}
              <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)" }}>
                        {report.shift.opened_by_name}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, textTransform: "uppercase",
                        color: report.shift.status === "open" ? "var(--d-warning)" : "var(--d-success)",
                        background: report.shift.status === "open" ? "var(--d-warning-soft)" : "var(--d-success-soft)",
                        border: `1px solid ${report.shift.status === "open" ? "var(--d-warning)" : "var(--d-success)"}`,
                      }}>
                        {report.shift.status}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>
                      Register: {report.shift.register_id}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 2 }}>
                      Open: {fmtDate(report.shift.opened_at)}
                      {report.shift.closed_at && ` → Closed: ${fmtDate(report.shift.closed_at)}`}
                    </p>
                  </div>

                  {/* Cash reconciliation mini-panel */}
                  <div style={{ background: "var(--d-surface-hover)", border: "1px solid var(--d-border-soft)", borderRadius: 10, padding: "10px 14px", fontSize: 12, minWidth: 180 }}>
                    {[
                      ["Opening Cash", `RM ${report.shift.opening_cash.toFixed(2)}`],
                      ["Expected", report.shift.expected_cash != null ? `RM ${report.shift.expected_cash.toFixed(2)}` : "—"],
                      ["Counted", report.shift.counted_cash != null ? `RM ${report.shift.counted_cash.toFixed(2)}` : "—"],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
                        <span style={{ color: "var(--d-text-3)" }}>{label}</span>
                        <span style={{ color: "var(--d-text-1)" }}>{val}</span>
                      </div>
                    ))}
                    {report.shift.over_short != null && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, paddingTop: 4, borderTop: "1px solid var(--d-border-soft)", fontWeight: 700 }}>
                        <span style={{ color: "var(--d-text-2)" }}>Over/Short</span>
                        <span style={{ color: report.shift.over_short < 0 ? "var(--d-error)" : "var(--d-success)" }}>
                          RM {report.shift.over_short.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {report.shift.opening_note && (
                  <p style={{ marginTop: 10, fontSize: 12, color: "var(--d-text-3)", padding: "6px 10px", borderRadius: 8, background: "var(--d-surface-hover)", border: "1px solid var(--d-border-soft)" }}>
                    Opening note: {report.shift.opening_note}
                  </p>
                )}
                {report.shift.closing_note && (
                  <p style={{ marginTop: 6, fontSize: 12, color: "var(--d-text-3)", padding: "6px 10px", borderRadius: 8, background: "var(--d-surface-hover)", border: "1px solid var(--d-border-soft)" }}>
                    Closing note: {report.shift.closing_note}
                  </p>
                )}
              </div>

              {/* KPI stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
                <StatCard label="Total Sales" value={fmtRM(report.summary.total_sales)} />
                <StatCard label="Orders" value={report.summary.order_count} />
                <StatCard label="Avg Spend" value={fmtRM(report.summary.avg_spend)} />
                <StatCard
                  label="Paid Out"
                  value={fmtRM(report.summary.paid_out_total)}
                  accent={report.summary.paid_out_total > 0 ? "var(--d-error)" : undefined}
                />
                <StatCard
                  label="Net Sales"
                  value={fmtRM(report.summary.net_sales)}
                  sub="Sales − Paid Out"
                  accent="var(--d-success)"
                />
              </div>

              {/* Hourly chart + Payment mix side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
                  <HourlyChart data={report.hourly} />
                </div>

                <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
                  <p style={{ fontSize: 10, fontWeight: 600, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                    Payment Mix
                  </p>
                  <PaymentMixBars mix={report.payment_mix} />
                </div>
              </div>

              {/* Top products */}
              <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
                <p style={{ fontSize: 10, fontWeight: 600, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>
                  Top Products
                </p>
                {report.top_products.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>No product sales in this shift.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.top_products.map((p, i) => {
                      const maxQty = report.top_products[0].qty;
                      return (
                        <div key={p.name}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                            <span style={{ color: "var(--d-text-1)" }}>
                              {i + 1}. {p.name}
                            </span>
                            <span style={{ color: "var(--d-text-2)", whiteSpace: "nowrap" }}>
                              {p.qty} sold ·{" "}
                              <span style={{ color: "var(--d-accent)", fontWeight: 600 }}>
                                {fmtRM(p.revenue)}
                              </span>
                            </span>
                          </div>
                          <div style={{ height: 4, borderRadius: 4, background: "var(--d-surface-hover)", overflow: "hidden" }}>
                            <div style={{ height: "100%", borderRadius: 4, background: "var(--d-accent)", width: `${(p.qty / maxQty) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
