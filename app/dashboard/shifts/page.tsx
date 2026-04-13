"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ShiftStatus = "open" | "closed";

type ShiftRow = {
  id: string;
  register_id: string;
  opened_by: string;
  opened_at: string;
  opening_cash: number;
  opening_note: string | null;
  status: ShiftStatus;
  closed_by: string | null;
  closed_at: string | null;
  counted_cash: number | null;
  expected_cash: number | null;
  over_short: number | null;
  paid_out_total?: number;
  closing_note: string | null;
  opened_by_name: string;
  opened_by_email: string | null;
  closed_by_name: string | null;
  closed_by_email: string | null;
};

type Summary = {
  total: number;
  open: number;
  closed: number;
  short_count: number;
  short_total: number;
  paid_out_total: number;
};

const EMPTY_SUMMARY: Summary = { total: 0, open: 0, closed: 0, short_count: 0, short_total: 0, paid_out_total: 0 };

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  fontSize: 13,
  color: "var(--d-text-1)",
  background: "var(--d-input-bg)",
  border: "1px solid var(--d-border)",
  outline: "none",
  boxSizing: "border-box",
};

function MiniStatCard({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div
      style={{
        minWidth: 140,
        background: "var(--d-surface)",
        border: "1px solid var(--d-border)",
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 500, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color: accent ?? "var(--d-text-1)", marginTop: 4, lineHeight: 1 }}>{value}</p>
    </div>
  );
}

export default function ShiftsPage() {
  const [status, setStatus] = useState("all");
  const [shortOnly, setShortOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", status);
      if (shortOnly) params.set("short_only", "1");
      if (query.trim()) params.set("q", query.trim());
      const res = await fetch(`/api/admin/pos-shifts?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load shifts");
      setShifts(data.shifts || []);
      setSummary(data.summary || EMPTY_SUMMARY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shifts");
      setShifts([]); setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [query, shortOnly, status]);

  useEffect(() => { void load(); }, [load]);

  const displayRows = useMemo(() => shifts, [shifts]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--d-bg)", padding: "28px 28px 40px", color: "var(--d-text-1)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Shift History</h1>
        <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>
          Audit opening/closing shift dan semak staff yang ada cash short.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <MiniStatCard label="Total" value={summary.total} />
        <MiniStatCard label="Open" value={summary.open} accent="var(--d-warning)" />
        <MiniStatCard label="Closed" value={summary.closed} accent="var(--d-success)" />
        <MiniStatCard label="Short Cases" value={summary.short_count} accent="var(--d-error)" />
        <MiniStatCard label="Short Total" value={`RM ${summary.short_total.toFixed(2)}`} accent="var(--d-error)" />
        <MiniStatCard label="Paid Out Total" value={`RM ${summary.paid_out_total.toFixed(2)}`} accent="var(--d-warning)" />
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
          background: "var(--d-surface)",
          border: "1px solid var(--d-border)",
          borderRadius: 14,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search staff / register"
          style={inputStyle}
        />
        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 12px",
            borderRadius: 8,
            fontSize: 13,
            color: "var(--d-text-2)",
            background: "var(--d-input-bg)",
            border: "1px solid var(--d-border)",
            cursor: "pointer",
          }}
        >
          <input type="checkbox" checked={shortOnly} onChange={e => setShortOnly(e.target.checked)} />
          Short only
        </label>
        <button
          type="button"
          onClick={() => void load()}
          style={{
            padding: "9px 18px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "#fff",
            background: "var(--d-accent)",
            border: "none",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 10, fontSize: 13, color: "var(--d-error)", background: "var(--d-error-soft)", border: "1px solid var(--d-error)" }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "20px 18px", fontSize: 13, color: "var(--d-text-3)" }}>
          Loading shifts...
        </div>
      )}

      {!loading && displayRows.length === 0 && (
        <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "40px 20px", textAlign: "center", fontSize: 14, color: "var(--d-text-2)" }}>
          No shifts found.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!loading && displayRows.map(row => {
          const expected = Number(row.expected_cash || row.opening_cash || 0);
          const counted = row.counted_cash == null ? null : Number(row.counted_cash);
          const overShort = row.over_short == null ? null : Number(row.over_short);
          const paidOutTotal = Number(row.paid_out_total || 0);
          const isShort = (overShort || 0) < 0;

          return (
            <div
              key={row.id}
              style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
                {/* Left */}
                <div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: "var(--d-surface-hover)", color: "var(--d-text-3)", border: "1px solid var(--d-border)" }}>
                      Register: {row.register_id}
                    </span>
                    <span style={{
                      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: "capitalize",
                      color: row.status === "open" ? "var(--d-warning)" : "var(--d-success)",
                      background: row.status === "open" ? "var(--d-warning-soft)" : "var(--d-success-soft)",
                      border: `1px solid ${row.status === "open" ? "var(--d-warning)" : "var(--d-success)"}`,
                    }}>
                      {row.status}
                    </span>
                    {isShort && (
                      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color: "var(--d-error)", background: "var(--d-error-soft)", border: "1px solid var(--d-error)" }}>
                        Cash Short
                      </span>
                    )}
                  </div>

                  <p style={{ fontSize: 13, color: "var(--d-text-1)" }}>
                    Opened by: <strong>{row.opened_by_name}</strong>
                  </p>
                  <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>
                    {row.opened_by_email || "—"} · {new Date(row.opened_at).toLocaleString()}
                  </p>

                  {row.closed_by_name && (
                    <>
                      <p style={{ fontSize: 13, color: "var(--d-text-1)", marginTop: 6 }}>
                        Closed by: <strong>{row.closed_by_name}</strong>
                      </p>
                      <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>
                        {row.closed_by_email || "—"} · {row.closed_at ? new Date(row.closed_at).toLocaleString() : "—"}
                      </p>
                    </>
                  )}
                </div>

                {/* Right: cash summary */}
                <div
                  style={{
                    minWidth: 200,
                    background: "var(--d-surface-hover)",
                    border: "1px solid var(--d-border-soft)",
                    borderRadius: 10,
                    padding: "12px 14px",
                    fontSize: 13,
                  }}
                >
                  {[
                    ["Opening", `RM ${Number(row.opening_cash || 0).toFixed(2)}`],
                    ["Expected", `RM ${expected.toFixed(2)}`],
                    ["Paid Out", `RM ${paidOutTotal.toFixed(2)}`],
                    ["Counted", counted == null ? "—" : `RM ${counted.toFixed(2)}`],
                  ].map(([label, val]) => (
                    <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
                      <span style={{ color: "var(--d-text-3)" }}>{label}</span>
                      <span style={{ color: "var(--d-text-1)" }}>{val}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 4, paddingTop: 4, borderTop: "1px solid var(--d-border-soft)", fontWeight: 700 }}>
                    <span style={{ color: "var(--d-text-2)" }}>Over/Short</span>
                    <span style={{ color: isShort ? "var(--d-error)" : "var(--d-success)" }}>
                      {overShort == null ? "—" : `RM ${overShort.toFixed(2)}`}
                    </span>
                  </div>
                </div>
              </div>

              {row.opening_note && (
                <p style={{ marginTop: 12, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--d-border-soft)", background: "var(--d-surface-hover)", fontSize: 12, color: "var(--d-text-3)" }}>
                  Opening note: {row.opening_note}
                </p>
              )}
              {row.closing_note && (
                <p style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--d-border-soft)", background: "var(--d-surface-hover)", fontSize: 12, color: "var(--d-text-3)" }}>
                  Closing note: {row.closing_note}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
