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

const EMPTY_SUMMARY: Summary = {
  total: 0,
  open: 0,
  closed: 0,
  short_count: 0,
  short_total: 0,
  paid_out_total: 0,
};

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

      const res = await fetch(`/api/admin/pos-shifts?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load shifts");

      setShifts(data.shifts || []);
      setSummary(data.summary || EMPTY_SUMMARY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shifts");
      setShifts([]);
      setSummary(EMPTY_SUMMARY);
    } finally {
      setLoading(false);
    }
  }, [query, shortOnly, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayRows = useMemo(() => shifts, [shifts]);

  return (
    <div className="min-h-screen bg-black p-4 text-gray-200 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Shift History</h1>
        <p className="mt-1 text-sm text-gray-400">
          Audit opening/closing shift dan semak staff yang ada cash short.
        </p>
      </div>

      <div className="-mx-1 mb-4 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-6 md:overflow-visible md:px-0">
        <Stat label="Total" value={summary.total} />
        <Stat label="Open" value={summary.open} color="text-amber-300" />
        <Stat label="Closed" value={summary.closed} color="text-green-400" />
        <Stat label="Short Cases" value={summary.short_count} color="text-red-400" />
        <Stat
          label="Short Total"
          value={`RM ${summary.short_total.toFixed(2)}`}
          color="text-red-400"
        />
        <Stat
          label="Paid Out Total"
          value={`RM ${summary.paid_out_total.toFixed(2)}`}
          color="text-amber-300"
        />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-gray-800 bg-[#111] p-3 md:grid-cols-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search staff / register"
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        />

        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>

        <label className="flex items-center gap-2 rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-200">
          <input
            type="checkbox"
            checked={shortOnly}
            onChange={e => setShortOnly(e.target.checked)}
          />
          Short only
        </label>

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
          Loading shifts...
        </div>
      ) : null}

      {!loading && displayRows.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-[#111] px-3 py-5 text-sm text-gray-400">
          No shifts found.
        </div>
      ) : null}

      <div className="space-y-3">
        {!loading &&
          displayRows.map(row => {
            const expected = Number(row.expected_cash || row.opening_cash || 0);
            const counted = row.counted_cash == null ? null : Number(row.counted_cash);
            const overShort = row.over_short == null ? null : Number(row.over_short);
            const paidOutTotal = Number(row.paid_out_total || 0);
            const short = (overShort || 0) < 0;

            return (
              <div key={row.id} className="rounded-xl border border-gray-800 bg-[#111] p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#1d1d1d] px-2 py-1 text-xs uppercase tracking-wide text-gray-300">
                        Register: {row.register_id}
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-xs capitalize ${
                          row.status === "open"
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-green-500/15 text-green-300"
                        }`}
                      >
                        {row.status}
                      </span>
                      {short ? (
                        <span className="rounded-full bg-red-500/15 px-2 py-1 text-xs text-red-300">
                          Cash Short
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 text-sm text-gray-100">
                      Opened by: <span className="font-medium">{row.opened_by_name}</span>
                    </p>
                    <p className="text-xs text-gray-400">
                      {row.opened_by_email || "—"} • {new Date(row.opened_at).toLocaleString()}
                    </p>

                    {row.closed_by_name ? (
                      <>
                        <p className="mt-1 text-sm text-gray-100">
                          Closed by: <span className="font-medium">{row.closed_by_name}</span>
                        </p>
                        <p className="text-xs text-gray-400">
                          {row.closed_by_email || "—"} •{" "}
                          {row.closed_at ? new Date(row.closed_at).toLocaleString() : "—"}
                        </p>
                      </>
                    ) : null}
                  </div>

                  <div className="w-full max-w-[260px] rounded-lg border border-gray-800 bg-black/30 p-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Opening</span>
                      <span>RM {Number(row.opening_cash || 0).toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span className="text-gray-400">Expected</span>
                      <span>RM {expected.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span className="text-gray-400">Paid Out</span>
                      <span>RM {paidOutTotal.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span className="text-gray-400">Counted</span>
                      <span>{counted == null ? "-" : `RM ${counted.toFixed(2)}`}</span>
                    </div>
                    <div className="mt-1 flex justify-between font-semibold">
                      <span className="text-gray-300">Over/Short</span>
                      <span className={short ? "text-red-400" : "text-green-400"}>
                        {overShort == null ? "-" : `RM ${overShort.toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                </div>

                {row.opening_note ? (
                  <p className="mt-3 rounded-md border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-400">
                    Opening note: {row.opening_note}
                  </p>
                ) : null}
                {row.closing_note ? (
                  <p className="mt-2 rounded-md border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-400">
                    Closing note: {row.closing_note}
                  </p>
                ) : null}
              </div>
            );
          })}
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
