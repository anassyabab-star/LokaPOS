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

type RequestCounts = { total: number; pending: number; approved: number; rejected: number };

type ActiveUser = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "cashier" | "customer" | "unknown";
  created_at: string | null;
  last_sign_in_at: string | null;
};

type ActiveCounts = { total: number; admin: number; cashier: number; customer: number; unknown: number };

const EMPTY_REQUEST_COUNTS: RequestCounts = { total: 0, pending: 0, approved: 0, rejected: 0 };
const EMPTY_ACTIVE_COUNTS: ActiveCounts = { total: 0, admin: 0, cashier: 0, customer: 0, unknown: 0 };

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

function MiniStatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{ minWidth: 130, background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 12, padding: "12px 14px" }}>
      <p style={{ fontSize: 10, fontWeight: 500, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</p>
      <p style={{ fontSize: 20, fontWeight: 700, color: accent ?? "var(--d-text-1)", marginTop: 4, lineHeight: 1 }}>{value}</p>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", background: "var(--d-surface-hover)", color: "var(--d-text-3)", border: "1px solid var(--d-border)" }}>
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: SignupRequest["status"] }) {
  const styles: React.CSSProperties =
    status === "pending"
      ? { color: "var(--d-warning)", background: "var(--d-warning-soft)", border: "1px solid var(--d-warning)" }
      : status === "approved"
        ? { color: "var(--d-success)", background: "var(--d-success-soft)", border: "1px solid var(--d-success)" }
        : { color: "var(--d-error)", background: "var(--d-error-soft)", border: "1px solid var(--d-error)" };
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, textTransform: "capitalize", ...styles }}>
      {status}
    </span>
  );
}

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
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const usersParams = new URLSearchParams();
      usersParams.set("role", role);
      if (query.trim()) usersParams.set("q", query.trim());

      const [requestsRes, usersRes] = await Promise.all([
        fetch(`/api/admin/signup-requests?status=${status}`, { cache: "no-store" }),
        fetch(`/api/admin/users?${usersParams.toString()}`, { cache: "no-store" }),
      ]);

      const requestsRaw = await requestsRes.text();
      let requestsData: { error?: string; requests?: SignupRequest[]; counts?: RequestCounts } = {};
      try { requestsData = requestsRaw ? (JSON.parse(requestsRaw) as typeof requestsData) : {}; }
      catch { throw new Error("Invalid signup request response"); }
      if (!requestsRes.ok) throw new Error(requestsData?.error || "Failed to load users");

      const usersRaw = await usersRes.text();
      let usersData: { error?: string; users?: ActiveUser[]; counts?: ActiveCounts } = {};
      try { usersData = usersRaw ? (JSON.parse(usersRaw) as typeof usersData) : {}; }
      catch { throw new Error("Invalid active users response"); }
      if (!usersRes.ok) throw new Error(usersData?.error || "Failed to load active users");

      setRequests(requestsData.requests || []);
      setRequestCounts(requestsData.counts || EMPTY_REQUEST_COUNTS);
      setActiveUsers(usersData.users || []);
      setActiveCounts(usersData.counts || EMPTY_ACTIVE_COUNTS);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
      setActiveUsers([]); setRequests([]);
      setRequestCounts(EMPTY_REQUEST_COUNTS); setActiveCounts(EMPTY_ACTIVE_COUNTS);
    } finally {
      setLoading(false);
    }
  }, [status, role, query]);

  useEffect(() => { void load(); }, [load]);

  async function reviewRequest(id: string, action: "approve" | "reject") {
    setProcessingId(id); setError(null);
    try {
      const res = await fetch(`/api/admin/signup-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const raw = await res.text();
      const data = raw ? (JSON.parse(raw) as { error?: string }) : {};
      if (!res.ok) throw new Error(data?.error || "Action failed");
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
    return requests.filter(r =>
      r.full_name.toLowerCase().includes(q) ||
      r.email.toLowerCase().includes(q) ||
      r.requested_role.toLowerCase().includes(q)
    );
  }, [query, requests]);

  return (
    <div style={{ minHeight: "100vh", background: "var(--d-bg)", padding: "28px 28px 40px", color: "var(--d-text-1)" }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Users</h1>
        <p style={{ fontSize: 13, color: "var(--d-text-3)", marginTop: 4 }}>
          Semak akaun aktif + signup request, approve/reject akaun, dan track growth pengguna.
        </p>
      </div>

      {/* Active accounts stats */}
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Active Accounts</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <MiniStatCard label="Total" value={activeCounts.total} />
        <MiniStatCard label="Admin" value={activeCounts.admin} accent="var(--d-success)" />
        <MiniStatCard label="Cashier" value={activeCounts.cashier} accent="var(--d-warning)" />
        <MiniStatCard label="Customer" value={activeCounts.customer} />
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
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name/email/role" style={inputStyle} />
        <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
          <option value="all">All roles</option>
          <option value="admin">Admin</option>
          <option value="cashier">Cashier</option>
          <option value="customer">Customer</option>
          <option value="unknown">Unknown</option>
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
          <option value="all">All status</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <button type="button" onClick={() => void load()} style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--d-accent)", border: "none", cursor: "pointer" }}>
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
          Loading users...
        </div>
      )}

      {!loading && activeUsers.length === 0 && (
        <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "40px 20px", textAlign: "center", fontSize: 14, color: "var(--d-text-2)" }}>
          No active users found.
        </div>
      )}

      {/* Active users list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {!loading && activeUsers.map(user => (
          <div key={user.id} style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)" }}>{user.full_name || "No name"}</p>
                <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 2 }}>{user.email || "—"}</p>
                <div style={{ marginTop: 8 }}><RoleBadge role={user.role} /></div>
              </div>
              <div style={{ fontSize: 12, color: "var(--d-text-3)", textAlign: "right" }}>
                <p>Created: {user.created_at ? new Date(user.created_at).toLocaleString() : "—"}</p>
                <p>Last sign in: {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString() : "—"}</p>
                <button
                  type="button"
                  onClick={() => setEditingUserId(editingUserId === user.id ? null : user.id)}
                  style={{ marginTop: 8, padding: "5px 12px", borderRadius: 7, fontSize: 12, color: "var(--d-text-2)", background: "transparent", border: "1px solid var(--d-border)", cursor: "pointer" }}
                >
                  {editingUserId === user.id ? "Cancel" : "Edit"}
                </button>
              </div>
            </div>

            {editingUserId === user.id && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--d-border)", display: "flex", flexDirection: "column", gap: 8 }}>
                <input defaultValue={user.full_name} placeholder="Full name" id={`edit-name-${user.id}`} style={inputStyle} />
                <input defaultValue="" placeholder="Phone (optional)" id={`edit-phone-${user.id}`} style={inputStyle} />
                <select defaultValue={user.role} id={`edit-role-${user.id}`} style={inputStyle}>
                  <option value="admin">Admin</option>
                  <option value="cashier">Cashier</option>
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    const nameEl = document.getElementById(`edit-name-${user.id}`) as HTMLInputElement;
                    const phoneEl = document.getElementById(`edit-phone-${user.id}`) as HTMLInputElement;
                    const roleEl = document.getElementById(`edit-role-${user.id}`) as HTMLSelectElement;
                    try {
                      await fetch("/api/admin/users", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          user_id: user.id,
                          full_name: nameEl?.value || user.full_name,
                          phone: phoneEl?.value || "",
                          role: roleEl?.value || user.role,
                        }),
                      });
                      setEditingUserId(null);
                      void load();
                    } catch {}
                  }}
                  style={{ padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--d-accent)", border: "none", cursor: "pointer" }}
                >
                  Save Changes
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid var(--d-border)", margin: "28px 0" }} />

      {/* Signup Requests */}
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--d-text-3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Signup Requests</p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
        <MiniStatCard label="Total" value={requestCounts.total} />
        <MiniStatCard label="Pending" value={requestCounts.pending} accent="var(--d-warning)" />
        <MiniStatCard label="Approved" value={requestCounts.approved} accent="var(--d-success)" />
        <MiniStatCard label="Rejected" value={requestCounts.rejected} accent="var(--d-error)" />
      </div>

      {!loading && filteredRequests.length === 0 && (
        <div style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "40px 20px", textAlign: "center", fontSize: 14, color: "var(--d-text-2)" }}>
          No user requests found.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {!loading && filteredRequests.map(request => (
          <div key={request.id} style={{ background: "var(--d-surface)", border: "1px solid var(--d-border)", borderRadius: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--d-text-1)" }}>{request.full_name}</p>
                <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 2 }}>{request.email}</p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  <RoleBadge role={request.requested_role} />
                  <StatusBadge status={request.status} />
                </div>
                <p style={{ fontSize: 12, color: "var(--d-text-3)", marginTop: 8 }}>
                  Requested: {new Date(request.requested_at).toLocaleString()}
                </p>
                {request.reviewed_at && (
                  <p style={{ fontSize: 12, color: "var(--d-text-3)" }}>
                    Reviewed: {new Date(request.reviewed_at).toLocaleString()}
                  </p>
                )}
              </div>

              {request.status === "pending" && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void reviewRequest(request.id, "approve")}
                    disabled={processingId === request.id}
                    style={{
                      padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      color: "#fff", background: "var(--d-success)", border: "none",
                      cursor: processingId === request.id ? "not-allowed" : "pointer",
                      opacity: processingId === request.id ? 0.5 : 1,
                    }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void reviewRequest(request.id, "reject")}
                    disabled={processingId === request.id}
                    style={{
                      padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                      color: "#fff", background: "var(--d-accent)", border: "none",
                      cursor: processingId === request.id ? "not-allowed" : "pointer",
                      opacity: processingId === request.id ? 0.5 : 1,
                    }}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>

            {request.review_note && (
              <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--d-border-soft)", background: "var(--d-surface-hover)", fontSize: 12, color: "var(--d-text-3)" }}>
                Note: {request.review_note}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
