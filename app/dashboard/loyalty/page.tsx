"use client";

import { useCallback, useEffect, useState } from "react";
import { PageWrapper, PageHeader, Card, StatCard, GhostBtn, DSelect, Alert, Empty, Skeleton } from "../_ui";

type TopMember = { id: string; name: string; phone: string | null; points: number };
type CheckinPoint = { date: string; count: number };

type LoyaltySummary = {
  range_days: number;
  liability: { points: number; value_rm: number; members: number };
  points_issued: number;
  points_redeemed: number;
  top_members: TopMember[];
  checkin_trend: CheckinPoint[];
  voucher_counts: { issued: number; redeemed: number; expired: number };
};

function StatusPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span
      style={{
        padding: "3px 12px",
        borderRadius: 20,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: "var(--d-surface-hover)",
        border: "1px solid var(--d-border-soft)",
      }}
    >
      {label}: {count}
    </span>
  );
}

export default function LoyaltyDashboardPage() {
  const [range, setRange] = useState("30");
  const [data, setData] = useState<LoyaltySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/loyalty?range=${range}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load loyalty data");
      setData(json as LoyaltySummary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load loyalty data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const maxCheckin = Math.max(1, ...(data?.checkin_trend || []).map(p => p.count));

  return (
    <PageWrapper>
      <PageHeader title="Loyalty" desc="Liabiliti points, aktiviti tebus/kumpul, ahli teratas, dan voucher." />

      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center" }}>
          <DSelect value={range} onChange={e => setRange(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </DSelect>
          <GhostBtn onClick={() => void load()}>Refresh</GhostBtn>
        </div>
      </Card>

      {error && <div style={{ marginBottom: 14 }}><Alert type="error">{error}</Alert></div>}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Skeleton height={90} />
          <Skeleton height={220} />
          <Skeleton height={220} />
        </div>
      ) : !data ? (
        <Empty title="No loyalty data." />
      ) : (
        <>
          {/* Headline stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 20 }}>
            <StatCard label="Liability (points)" value={data.liability.points.toLocaleString()} />
            <StatCard label="Liability (RM)" value={`RM ${data.liability.value_rm.toFixed(2)}`} accent="var(--d-error)" />
            <StatCard label="Points Issued" value={data.points_issued.toLocaleString()} accent="var(--d-success)" />
            <StatCard label="Points Redeemed" value={data.points_redeemed.toLocaleString()} accent="var(--d-info)" />
          </div>

          {/* Vouchers */}
          <Card style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)", marginBottom: 4 }}>Vouchers</p>
            <p style={{ fontSize: 12, color: "var(--d-text-3)", marginBottom: 12 }}>Status voucher merentas semua ahli.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <StatusPill label="Issued" count={data.voucher_counts.issued} color="var(--d-info)" />
              <StatusPill label="Redeemed" count={data.voucher_counts.redeemed} color="var(--d-success)" />
              <StatusPill label="Expired" count={data.voucher_counts.expired} color="var(--d-text-3)" />
            </div>
          </Card>

          {/* Check-in trend */}
          <Card style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)", marginBottom: 4 }}>Check-in Trend</p>
            <p style={{ fontSize: 12, color: "var(--d-text-3)", marginBottom: 14 }}>Bilangan check-in harian (14 hari).</p>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 120 }}>
              {data.checkin_trend.map(point => (
                <div key={point.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 10, color: "var(--d-text-3)" }}>{point.count || ""}</div>
                  <div
                    title={`${point.date}: ${point.count}`}
                    style={{
                      width: "100%",
                      height: `${(point.count / maxCheckin) * 90}px`,
                      minHeight: point.count > 0 ? 4 : 0,
                      borderRadius: 4,
                      background: "#7F1D1D",
                    }}
                  />
                  <div style={{ fontSize: 9, color: "var(--d-text-3)" }}>{point.date.slice(5)}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Top members */}
          <Card style={{ padding: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)", marginBottom: 4 }}>Top Members</p>
            <p style={{ fontSize: 12, color: "var(--d-text-3)", marginBottom: 12 }}>Ahli dengan baki points tertinggi.</p>
            {data.top_members.length === 0 ? (
              <Empty title="No members with points yet." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {data.top_members.map((m, i) => (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--d-border-soft)",
                      background: "var(--d-surface-hover)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--d-text-3)", width: 20 }}>#{i + 1}</span>
                      <div>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--d-text-1)" }}>{m.name}</p>
                        <p style={{ fontSize: 11, color: "var(--d-text-3)" }}>{m.phone || "—"}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#7F1D1D" }}>{m.points.toLocaleString()} pts</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </PageWrapper>
  );
}
