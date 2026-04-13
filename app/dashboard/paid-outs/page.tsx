"use client";

import { useCallback, useEffect, useState } from "react";

type PaidOutRow = {
  id: string;
  shift_id: string;
  register_id: string;
  amount: number;
  staff_name: string | null;
  reason: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_url: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  shift: { id: string; opened_at: string; closed_at: string | null } | null;
  created_by_name: string;
  created_by_email: string | null;
};

type Summary = {
  total_records: number;
  total_amount: number;
  today_amount: number;
  registers: number;
};

const EMPTY_SUMMARY: Summary = { total_records: 0, total_amount: 0, today_amount: 0, registers: 0 };

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
    <div style={{ minWidth: 140, background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 12, padding: "12px 14px" }}>
      <p style={{ fontSize: 10, fontWeight: 500, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color: accent ?? "var(--d-text-1)", marginTop: 4, lineHeight: 1 }}>{value}</p>
    </div>
  );
}

export default function PaidOutsPage() {
  const [rows, setRows] = useState<PaidOutRow[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [registerId, setRegisterId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("register_id", registerId);
      if (q.trim()) params.set("q", q.trim());
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const res = await fetch(`/api/admin/paid-outs?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load paid outs");
      setRows((data.paid_outs || []) as PaidOutRow[]);
      setSummary((data.summary || EMPTY_SUMMARY) as Summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load paid outs");
      setRows([]); setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, q, registerId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--d-bg)", padding: "28px 28px 40px", color: "var(--d-text-1)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Paid Outs</h1>
        <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>
          Audit duit keluar cash drawer untuk belian segera + bukti invoice.
        </p>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <MiniStatCard label="Records" value={summary.total_records} />
        <MiniStatCard label="Total Paid Out" value={`RM ${summary.total_amount.toFixed(2)}`} accent="var(--d-error)" />
        <MiniStatCard label="Today Paid Out" value={`RM ${summary.today_amount.toFixed(2)}`} accent="var(--d-warning)" />
        <MiniStatCard label="Registers" value={summary.registers} />
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 10,
          background: "var(--d-surface)",
          border: "1px solid var(--d-border)",
          borderRadius: 14,
          padding: "14px 16px",
          marginBottom: 16,
        }}
      >
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search reason/vendor/invoice" style={{ ...inputStyle, gridColumn: "span 2" }} />
        <select value={registerId} onChange={e => setRegisterId(e.target.value)} style={inputStyle}>
          <option value="all">All register</option>
          <option value="main">Main</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inputStyle} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inputStyle} />
        <button
          type="button"
          onClick={() => void load()}
          style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--d-accent)", border: "none", cursor: "pointer" }}
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
          Loading paid outs...
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "40px 20px", textAlign: "center", fontSize: 14, color: "var(--d-text-2)" }}>
          No paid out records found.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!loading && rows.map(row => (
          <div key={row.id} style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              {/* Left */}
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)" }}>{row.reason}</p>
                <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 3 }}>
                  {new Date(row.created_at).toLocaleString()} · Register {row.register_id}
                </p>
                <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 2 }}>
                  Staff: {row.staff_name || row.created_by_name}
                  {row.created_by_email ? ` (${row.created_by_email})` : ""}
                </p>
                {row.vendor_name && <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>Vendor: {row.vendor_name}</p>}
                {row.invoice_number && <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>Invoice: {row.invoice_number}</p>}
                {row.invoice_url ? (
                  <a href={row.invoice_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--d-info)", marginTop: 4, display: "inline-block" }}>
                    Open invoice proof
                  </a>
                ) : (
                  <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 4 }}>No invoice link</p>
                )}
              </div>

              {/* Right */}
              <div style={{ textAlign: "right" }}>
                <p style={{ fontSize: 11, color: "var(--d-text-3)" }}>Amount</p>
                <p style={{ fontSize: 18, fontWeight: 700, color: "var(--d-error)" }}>- RM {Number(row.amount || 0).toFixed(2)}</p>
              </div>
            </div>

            {row.notes && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--d-border-soft)", background: "var(--d-surface-hover)", fontSize: 12, color: "var(--d-text-3)" }}>
                {row.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
