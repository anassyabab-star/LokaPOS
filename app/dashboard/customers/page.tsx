"use client";

import { useCallback, useEffect, useState } from "react";
import {
  PageWrapper, PageHeader, Card, StatCard, GhostBtn, DInput, DSelect,
  Alert, Empty, Skeleton,
} from "../_ui";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  consent_whatsapp: boolean;
  consent_email: boolean;
  total_orders: number;
  total_spend: number;
  last_order_at: string | null;
  created_at: string;
  loyalty_points: number;
};

type Summary = { total: number; whatsapp: number; email: number; total_spend: number };

type LoyaltyHistoryItem = {
  id: string;
  entry_type: "earn" | "redeem" | "adjust";
  points_change: number;
  note: string | null;
  created_at: string;
  order_id: string | null;
  receipt_number: string | null;
};

const EMPTY_SUMMARY: Summary = { total: 0, whatsapp: 0, email: 0, total_spend: 0 };

function ConsentPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      style={{
        padding: "2px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        color: active ? "var(--d-success)" : "var(--d-text-3)",
        background: active ? "var(--d-success-soft)" : "var(--d-surface-hover)",
      }}
    >
      {label}: {active ? "Yes" : "No"}
    </span>
  );
}

export default function CustomersPage() {
  const [query, setQuery] = useState("");
  const [consent, setConsent] = useState("all");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);
  const [historyByCustomer, setHistoryByCustomer] = useState<Record<string, LoyaltyHistoryItem[]>>({});
  const [historyLoadingByCustomer, setHistoryLoadingByCustomer] = useState<Record<string, boolean>>({});
  const [historyErrorByCustomer, setHistoryErrorByCustomer] = useState<Record<string, string | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      params.set("consent", consent);
      const res = await fetch(`/api/admin/customers?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load customers");
      setCustomers(data.customers || []);
      setSummary(data.summary || EMPTY_SUMMARY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers");
      setCustomers([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [consent, query]);

  useEffect(() => { void load(); }, [load]);

  const loadLoyaltyHistory = useCallback(async (customerId: string) => {
    if (historyByCustomer[customerId]) return;
    setHistoryLoadingByCustomer(prev => ({ ...prev, [customerId]: true }));
    setHistoryErrorByCustomer(prev => ({ ...prev, [customerId]: null }));
    try {
      const res = await fetch(`/api/admin/customers/${customerId}/loyalty`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed");
      setHistoryByCustomer(prev => ({ ...prev, [customerId]: (data.history || []) as LoyaltyHistoryItem[] }));
    } catch (e) {
      setHistoryErrorByCustomer(prev => ({ ...prev, [customerId]: e instanceof Error ? e.message : "Failed" }));
    } finally {
      setHistoryLoadingByCustomer(prev => ({ ...prev, [customerId]: false }));
    }
  }, [historyByCustomer]);

  function toggleHistory(customerId: string) {
    setExpandedCustomerId(prev => prev === customerId ? null : customerId);
    if (!historyByCustomer[customerId]) void loadLoyaltyHistory(customerId);
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Customers"
        desc="Customer database + consent tracker untuk campaign WhatsApp/Email."
      />

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        <StatCard label="Total Customers" value={summary.total} />
        <StatCard label="WhatsApp Consent" value={summary.whatsapp} accent="var(--d-success)" />
        <StatCard label="Email Consent" value={summary.email} accent="var(--d-info)" />
        <StatCard label="Total Spend" value={`RM ${summary.total_spend.toFixed(2)}`} />
      </div>

      {/* Filter bar */}
      <Card style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 10 }}>
          <DInput
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name / phone / email"
          />
          <DSelect value={consent} onChange={e => setConsent(e.target.value)}>
            <option value="all">All consent</option>
            <option value="whatsapp">WhatsApp consent</option>
            <option value="email">Email consent</option>
            <option value="none">No consent</option>
          </DSelect>
          <GhostBtn onClick={() => void load()}>Refresh</GhostBtn>
        </div>
      </Card>

      {error && <div style={{ marginBottom: 14 }}><Alert type="error">{error}</Alert></div>}

      {/* Customer list */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} height={100} />)}
        </div>
      ) : customers.length === 0 ? (
        <Empty title="No customers found." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {customers.map(customer => (
            <Card key={customer.id} style={{ padding: 16 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {/* Left */}
                <div style={{ flex: 1, minWidth: 180 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)" }}>{customer.name}</p>
                  <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 2 }}>{customer.phone || "No phone"}</p>
                  <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>{customer.email || "No email"}</p>
                  <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                    <ConsentPill active={customer.consent_whatsapp} label="WhatsApp" />
                    <ConsentPill active={customer.consent_email} label="Email" />
                  </div>
                </div>

                {/* Right */}
                <div
                  style={{
                    borderRadius: 10,
                    border: "1px solid var(--d-border-soft)",
                    background: "var(--d-surface-hover)",
                    padding: "10px 14px",
                    fontSize: 12,
                    minWidth: 160,
                  }}
                >
                  {[
                    ["Orders", customer.total_orders],
                    ["Spend", `RM ${customer.total_spend.toFixed(2)}`],
                    ["Points", customer.loyalty_points],
                    ["Last Order", customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString() : "—"],
                  ].map(([label, val]) => (
                    <div
                      key={String(label)}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 16,
                        marginBottom: 4,
                      }}
                    >
                      <span style={{ color: "var(--d-text-3)" }}>{label}</span>
                      <span style={{ color: "var(--d-text-1)", fontWeight: 500 }}>{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Loyalty history toggle */}
              <div style={{ marginTop: 12, borderTop: "1px solid var(--d-border-soft)", paddingTop: 12 }}>
                <GhostBtn onClick={() => toggleHistory(customer.id)} style={{ width: "100%", justifyContent: "center" }}>
                  {expandedCustomerId === customer.id ? "Hide" : "View"} Loyalty History
                </GhostBtn>

                {expandedCustomerId === customer.id && (
                  <div
                    style={{
                      marginTop: 10,
                      borderRadius: 10,
                      border: "1px solid var(--d-border)",
                      background: "var(--d-surface-hover)",
                      padding: 10,
                      maxHeight: 240,
                      overflowY: "auto",
                    }}
                  >
                    {historyLoadingByCustomer[customer.id] && (
                      <p style={{ fontSize: 12, color: "var(--d-text-3)", padding: "4px 0" }}>Loading...</p>
                    )}
                    {historyErrorByCustomer[customer.id] && (
                      <p style={{ fontSize: 12, color: "var(--d-error)" }}>{historyErrorByCustomer[customer.id]}</p>
                    )}
                    {!historyLoadingByCustomer[customer.id] && !historyErrorByCustomer[customer.id] && (historyByCustomer[customer.id] || []).length === 0 && (
                      <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>No loyalty transactions yet.</p>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(historyByCustomer[customer.id] || []).map(item => (
                        <div
                          key={item.id}
                          style={{
                            borderRadius: 8,
                            border: "1px solid var(--d-border)",
                            background: "var(--d-surface)",
                            padding: "8px 10px",
                            fontSize: 12,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <span style={{ color: "var(--d-text-3)" }}>
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                            <span
                              style={{
                                fontWeight: 700,
                                color: item.points_change > 0 ? "var(--d-success)" : "var(--d-error)",
                              }}
                            >
                              {item.points_change > 0 ? "+" : ""}{item.points_change} pts
                            </span>
                          </div>
                          <p style={{ color: "var(--d-text-2)", marginTop: 3 }}>
                            {item.entry_type.toUpperCase()}
                            {item.receipt_number ? ` · #${item.receipt_number}` : ""}
                          </p>
                          {item.note && (
                            <p style={{ fontSize: 11, color: "var(--d-text-3)", marginTop: 2 }}>{item.note}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageWrapper>
  );
}
