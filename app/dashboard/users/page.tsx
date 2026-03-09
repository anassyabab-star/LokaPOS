"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type SignupRequest = {
  id: string;
  email: string;
  full_name: string;
  requested_role: "admin" | "cashier" | "customer";
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  review_note: string | null;
};

type RequestCounts = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
};

type ActiveUser = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "cashier" | "customer" | "unknown";
  created_at: string | null;
  last_sign_in_at: string | null;
};

type ActiveCounts = {
  total: number;
  admin: number;
  cashier: number;
  customer: number;
  unknown: number;
};

const EMPTY_REQUEST_COUNTS: RequestCounts = {
  total: 0,
  pending: 0,
  approved: 0,
  rejected: 0,
};

const EMPTY_ACTIVE_COUNTS: ActiveCounts = {
  total: 0,
  admin: 0,
  cashier: 0,
  customer: 0,
  unknown: 0,
};

export default function UsersPage() {
  const [status, setStatus] = useState("all");
  const [role, setRole] = useState("all");
  const [query, setQuery] = useState("");
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [requestCounts, setRequestCounts] = useState<RequestCounts>(EMPTY_REQUEST_COUNTS);
  const [activeCounts, setActiveCounts] = useState<ActiveCounts>(EMPTY_ACTIVE_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const usersParams = new URLSearchParams();
      usersParams.set("role", role);
      if (query.trim()) usersParams.set("q", query.trim());

      const [requestsRes, usersRes] = await Promise.all([
        fetch(`/api/admin/signup-requests?status=${status}`, { cache: "no-store" }),
        fetch(`/api/admin/users?${usersParams.toString()}`, { cache: "no-store" }),
      ]);

      const requestsRaw = await requestsRes.text();
      let requestsData: {
        error?: string;
        requests?: SignupRequest[];
        counts?: RequestCounts;
      } = {};
      try {
        requestsData = requestsRaw ? (JSON.parse(requestsRaw) as typeof requestsData) : {};
      } catch {
        throw new Error("Invalid signup request response");
      }

      if (!requestsRes.ok) {
        throw new Error(requestsData?.error || "Failed to load users");
      }

      const usersRaw = await usersRes.text();
      let usersData: {
        error?: string;
        users?: ActiveUser[];
        counts?: ActiveCounts;
      } = {};
      try {
        usersData = usersRaw ? (JSON.parse(usersRaw) as typeof usersData) : {};
      } catch {
        throw new Error("Invalid active users response");
      }

      if (!usersRes.ok) {
        throw new Error(usersData?.error || "Failed to load active users");
      }

      setRequests(requestsData.requests || []);
      setRequestCounts(requestsData.counts || EMPTY_REQUEST_COUNTS);
      setActiveUsers(usersData.users || []);
      setActiveCounts(usersData.counts || EMPTY_ACTIVE_COUNTS);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load users";
      setError(msg);
      setActiveUsers([]);
      setRequests([]);
      setRequestCounts(EMPTY_REQUEST_COUNTS);
      setActiveCounts(EMPTY_ACTIVE_COUNTS);
    } finally {
      setLoading(false);
    }
  }, [status, role, query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function reviewRequest(id: string, action: "approve" | "reject") {
    setProcessingId(id);
    setError(null);

    try {
      const res = await fetch(`/api/admin/signup-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const raw = await res.text();
      const data = raw ? (JSON.parse(raw) as { error?: string }) : {};

      if (!res.ok) {
        throw new Error(data?.error || "Action failed");
      }

      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setProcessingId(null);
    }
  }

  const filteredRequests = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return requests;
    return requests.filter(
      request =>
        request.full_name.toLowerCase().includes(q) ||
        request.email.toLowerCase().includes(q) ||
        request.requested_role.toLowerCase().includes(q)
    );
  }, [query, requests]);

  return (
    <div className="min-h-screen bg-black text-gray-200 p-4 md:p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Users</h1>
        <p className="mt-1 text-sm text-gray-400">
          Semak akaun aktif + signup request, approve/reject akaun, dan track growth pengguna.
        </p>
      </div>

      <div className="mb-2 text-sm font-semibold text-gray-300">Active Accounts</div>
      <div className="-mx-1 mb-4 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        <StatCard label="Total" value={activeCounts.total} tone="default" />
        <StatCard label="Admin" value={activeCounts.admin} tone="approved" />
        <StatCard label="Cashier" value={activeCounts.cashier} tone="pending" />
        <StatCard label="Customer" value={activeCounts.customer} tone="default" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 rounded-xl border border-gray-800 bg-[#111] p-3 md:grid-cols-4">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search name/email/role"
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value)}
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        >
          <option value="all">All roles</option>
          <option value="admin">Admin</option>
          <option value="cashier">Cashier</option>
          <option value="customer">Customer</option>
          <option value="unknown">Unknown</option>
        </select>
        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="rounded-md border border-gray-700 bg-black px-3 py-2 text-sm text-gray-100 outline-none focus:border-[#7F1D1D]"
        >
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
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
          Loading users...
        </div>
      ) : null}

      {!loading && activeUsers.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-[#111] px-3 py-5 text-sm text-gray-400">
          No active users found.
        </div>
      ) : null}

      <div className="space-y-3">
        {!loading &&
          activeUsers.map(user => (
            <div key={user.id} className="rounded-xl border border-gray-800 bg-[#111] p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{user.full_name || "No name"}</p>
                  <p className="text-xs text-gray-400">{user.email || "-"}</p>
                  <div className="mt-2">
                    <RoleBadge role={user.role} />
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  <p>Created: {user.created_at ? new Date(user.created_at).toLocaleString() : "-"}</p>
                  <p>
                    Last sign in:{" "}
                    {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "-"}
                  </p>
                </div>
              </div>
            </div>
          ))}
      </div>

      <div className="my-5 border-t border-gray-800" />
      <div className="mb-2 text-sm font-semibold text-gray-300">Signup Requests</div>
      <div className="-mx-1 mb-4 flex snap-x gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        <StatCard label="Total" value={requestCounts.total} tone="default" />
        <StatCard label="Pending" value={requestCounts.pending} tone="pending" />
        <StatCard label="Approved" value={requestCounts.approved} tone="approved" />
        <StatCard label="Rejected" value={requestCounts.rejected} tone="rejected" />
      </div>

      {!loading && filteredRequests.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-[#111] px-3 py-5 text-sm text-gray-400">
          No user requests found.
        </div>
      ) : null}

      <div className="space-y-3">
        {!loading &&
          filteredRequests.map(request => (
            <div key={request.id} className="rounded-xl border border-gray-800 bg-[#111] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">{request.full_name}</p>
                  <p className="text-xs text-gray-400">{request.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <RoleBadge role={request.requested_role} />
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                    Requested: {new Date(request.requested_at).toLocaleString()}
                  </p>
                  {request.reviewed_at ? (
                    <p className="text-xs text-gray-500">
                      Reviewed: {new Date(request.reviewed_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>

                {request.status === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => reviewRequest(request.id, "approve")}
                      disabled={processingId === request.id}
                      className="rounded-md bg-green-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => reviewRequest(request.id, "reject")}
                      disabled={processingId === request.id}
                      className="rounded-md bg-[#7F1D1D] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
              </div>

              {request.review_note ? (
                <p className="mt-3 rounded-md border border-gray-800 bg-black/30 px-3 py-2 text-xs text-gray-400">
                  Note: {request.review_note}
                </p>
              ) : null}
            </div>
          ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "default" | "pending" | "approved" | "rejected";
}) {
  const toneClass =
    tone === "pending"
      ? "text-amber-300"
      : tone === "approved"
        ? "text-green-400"
        : tone === "rejected"
          ? "text-red-400"
          : "text-white";

  return (
    <div className="min-w-[155px] rounded-xl border border-gray-800 bg-[#111] p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: SignupRequest["status"] }) {
  const className =
    status === "pending"
      ? "bg-amber-500/15 text-amber-300"
      : status === "approved"
        ? "bg-green-500/15 text-green-300"
        : "bg-red-500/15 text-red-300";
  return <span className={`rounded-full px-2 py-1 text-xs capitalize ${className}`}>{status}</span>;
}

function RoleBadge({ role }: { role: "admin" | "cashier" | "customer" | "unknown" }) {
  return (
    <span className="rounded-full bg-[#1d1d1d] px-2 py-1 text-xs uppercase tracking-wide text-gray-300">
      {role}
    </span>
  );
}
