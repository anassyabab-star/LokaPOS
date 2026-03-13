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
  shift: {
    id: string;
    opened_at: string;
    closed_at: string | null;
  } | null;
  created_by_name: string;
  created_by_email: string | null;
};

type Summary = {
  total_records: number;
  total_amount: number;
  today_amount: number;
  registers: number;
};

const EMPTY_SUMMARY: Summary = {
  total_records: 0,
  total_amount: 0,
  today_amount: 0,
  registers: 0,
};

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

      const res = await fetch(`/api/admin/paid-outs?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load paid outs");

      setRows((data.paid_outs || []) as PaidOutRow[]);
      setSummary((data.summary || EMPTY_SUMMARY) as Summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load paid outs");
      setRows([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, q, registerId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen bg-black p-4 text-gray-200 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Paid Outs</h1>
        <p className="mt-1 text-sm text-gray-400">
          Audit duit keluar cash drawer untuk belian segera + bukti invoice.
        </p>
      </div>

      <div className="-mx-1 mb-4 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        <Stat label="Records" value={summary.total_records} />
        <Stat label="Total Paid Out" value={`RM ${summary.total_amount.toFixed(2)}`} color="text-red-300" />
        <Stat label="Today Paid Out" value={`RM ${summary.today_amount.toFixed(2)}`} color="text-amber-300" />
        <Stat label="Registers" value={summary.registers} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-gray-800 bg-[#111] p-3 md:grid-cols-5">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search reason/vendor/invoice/staff"
          className="md:col-span-2 rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        />
        <select
          value={registerId}
          onChange={e => setRegisterId(e.target.value)}
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        >
          <option value="all">All register</option>
          <option value="main">Main</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={e => setDateFrom(e.target.value)}
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        />
        <input
          type="date"
          value={dateTo}
          onChange={e => setDateTo(e.target.value)}
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        />
      </div>

      <div className="mb-4 flex justify-end">
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
          Loading paid outs...
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-[#111] px-3 py-5 text-sm text-gray-400">
          No paid out records found.
        </div>
      ) : null}

      <div className="space-y-3">
        {!loading &&
          rows.map(row => (
            <div key={row.id} className="rounded-xl border border-gray-800 bg-[#111] p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{row.reason}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(row.created_at).toLocaleString()} • Register {row.register_id}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    Staff: {row.staff_name || row.created_by_name}
                    {row.created_by_email ? ` (${row.created_by_email})` : ""}
                  </p>
                  {row.vendor_name ? (
                    <p className="text-xs text-gray-500">Vendor: {row.vendor_name}</p>
                  ) : null}
                  {row.invoice_number ? (
                    <p className="text-xs text-gray-500">Invoice: {row.invoice_number}</p>
                  ) : null}
                  {row.invoice_url ? (
                    <p className="mt-1 text-xs">
                      <a
                        href={row.invoice_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-300 hover:underline"
                      >
                        Open invoice proof
                      </a>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-gray-600">No invoice link</p>
                  )}
                </div>

                <div className="text-right">
                  <p className="text-xs text-gray-500">Amount</p>
                  <p className="text-lg font-semibold text-red-300">- RM {Number(row.amount || 0).toFixed(2)}</p>
                </div>
              </div>

              {row.notes ? (
                <div className="mt-2 rounded-md border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-400">
                  {row.notes}
                </div>
              ) : null}
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
