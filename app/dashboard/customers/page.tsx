"use client";

import { useCallback, useEffect, useState } from "react";

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

type Summary = {
  total: number;
  whatsapp: number;
  email: number;
  total_spend: number;
};

type LoyaltyHistoryItem = {
  id: string;
  entry_type: "earn" | "redeem" | "adjust";
  points_change: number;
  note: string | null;
  created_at: string;
  order_id: string | null;
  receipt_number: string | null;
};

const EMPTY_SUMMARY: Summary = {
  total: 0,
  whatsapp: 0,
  email: 0,
  total_spend: 0,
};

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

  useEffect(() => {
    void load();
  }, [load]);

  const loadLoyaltyHistory = useCallback(async (customerId: string) => {
    if (historyByCustomer[customerId]) return;

    setHistoryLoadingByCustomer(prev => ({ ...prev, [customerId]: true }));
    setHistoryErrorByCustomer(prev => ({ ...prev, [customerId]: null }));

    try {
      const res = await fetch(`/api/admin/customers/${customerId}/loyalty`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load loyalty history");

      setHistoryByCustomer(prev => ({
        ...prev,
        [customerId]: (data.history || []) as LoyaltyHistoryItem[],
      }));
    } catch (e) {
      setHistoryErrorByCustomer(prev => ({
        ...prev,
        [customerId]: e instanceof Error ? e.message : "Failed to load loyalty history",
      }));
    } finally {
      setHistoryLoadingByCustomer(prev => ({ ...prev, [customerId]: false }));
    }
  }, [historyByCustomer]);

  function toggleHistory(customerId: string) {
    setExpandedCustomerId(prev => (prev === customerId ? null : customerId));
    if (!historyByCustomer[customerId]) {
      void loadLoyaltyHistory(customerId);
    }
  }

  return (
    <div className="min-h-screen bg-black p-4 text-gray-200 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Customers</h1>
        <p className="mt-1 text-sm text-gray-400">
          Customer database + consent tracker untuk campaign WhatsApp/Email.
        </p>
      </div>

      <div className="-mx-1 mb-4 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        <Stat label="Total Customers" value={summary.total} />
        <Stat label="WhatsApp Consent" value={summary.whatsapp} color="text-green-400" />
        <Stat label="Email Consent" value={summary.email} color="text-blue-300" />
        <Stat label="Total Spend" value={`RM ${summary.total_spend.toFixed(2)}`} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-gray-800 bg-[#111] p-3 md:grid-cols-3">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name / phone / email"
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        />
        <select
          value={consent}
          onChange={e => setConsent(e.target.value)}
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        >
          <option value="all">All consent</option>
          <option value="whatsapp">WhatsApp consent</option>
          <option value="email">Email consent</option>
          <option value="none">No consent</option>
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md bg-[#7F1D1D] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-md border border-red-900 bg-red-950/20 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-xl border border-gray-800 bg-[#111] px-3 py-5 text-sm text-gray-400">
          Loading customers...
        </div>
      ) : null}

      {!loading && customers.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-[#111] px-3 py-5 text-sm text-gray-400">
          No customers found.
        </div>
      ) : null}

      <div className="space-y-3">
        {!loading &&
          customers.map(customer => (
            <div key={customer.id} className="rounded-xl border border-gray-800 bg-[#111] p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{customer.name}</p>
                  <p className="text-xs text-gray-400">{customer.phone || "No phone"}</p>
                  <p className="text-xs text-gray-400">{customer.email || "No email"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ConsentBadge active={customer.consent_whatsapp} label="WhatsApp" />
                    <ConsentBadge active={customer.consent_email} label="Email" />
                  </div>
                </div>

                <div className="rounded-lg border border-gray-800 bg-black/30 p-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-400">Orders</span>
                    <span>{customer.total_orders}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-4">
                    <span className="text-gray-400">Spend</span>
                    <span>RM {customer.total_spend.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-4">
                    <span className="text-gray-400">Points</span>
                    <span>{customer.loyalty_points}</span>
                  </div>
                  <div className="mt-1 flex justify-between gap-4">
                    <span className="text-gray-400">Last Order</span>
                    <span className="text-xs">
                      {customer.last_order_at
                        ? new Date(customer.last_order_at).toLocaleDateString()
                        : "-"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-gray-800 pt-3">
                <button
                  type="button"
                  onClick={() => toggleHistory(customer.id)}
                  className="w-full rounded-lg border border-gray-700 bg-black/40 px-3 py-2 text-left text-xs text-gray-300 hover:border-gray-500"
                >
                  {expandedCustomerId === customer.id ? "Hide" : "View"} Loyalty History
                </button>

                {expandedCustomerId === customer.id ? (
                  <div className="mt-2 rounded-lg border border-gray-800 bg-black/40 p-2">
                    {historyLoadingByCustomer[customer.id] ? (
                      <p className="text-xs text-gray-400">Loading loyalty history...</p>
                    ) : null}

                    {historyErrorByCustomer[customer.id] ? (
                      <p className="text-xs text-red-300">{historyErrorByCustomer[customer.id]}</p>
                    ) : null}

                    {!historyLoadingByCustomer[customer.id] &&
                    !historyErrorByCustomer[customer.id] &&
                    (historyByCustomer[customer.id] || []).length === 0 ? (
                      <p className="text-xs text-gray-500">No loyalty transactions yet.</p>
                    ) : null}

                    <div className="space-y-2">
                      {(historyByCustomer[customer.id] || []).map(item => (
                        <div
                          key={item.id}
                          className="rounded-md border border-gray-800 bg-[#111] p-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-gray-400">
                              {new Date(item.created_at).toLocaleString()}
                            </span>
                            <span
                              className={`font-semibold ${
                                item.points_change > 0 ? "text-green-300" : "text-red-300"
                              }`}
                            >
                              {item.points_change > 0 ? "+" : ""}
                              {item.points_change} pts
                            </span>
                          </div>
                          <div className="mt-1 text-gray-300">
                            {item.entry_type.toUpperCase()}
                            {item.receipt_number ? ` • #${item.receipt_number}` : ""}
                          </div>
                          {item.note ? <div className="mt-1 text-gray-500">{item.note}</div> : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color = "text-white",
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="min-w-[155px] rounded-xl border border-gray-800 bg-[#111] p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function ConsentBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs ${
        active ? "bg-green-500/15 text-green-300" : "bg-gray-800 text-gray-400"
      }`}
    >
      {label}: {active ? "Yes" : "No"}
    </span>
  );
}
