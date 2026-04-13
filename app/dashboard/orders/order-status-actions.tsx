"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";
type OrderAction = "void" | "refund";

type Props = {
  orderId: string;
  currentStatus: string | null | undefined;
  paymentStatus?: string | null;
  total?: number | null;
};

function normalizeStatus(value: string | null | undefined): OrderStatus | null {
  const s = String(value || "").trim().toLowerCase();
  if (["pending","preparing","ready","completed","cancelled"].includes(s)) return s as OrderStatus;
  return null;
}

const ACTION_BTNS = [
  { key: "preparing",  label: "Mark Preparing",  can: (s: OrderStatus|null) => s === "pending",    color: "var(--d-warning)",  bg: "var(--d-warning-soft)" },
  { key: "ready",      label: "Mark Ready",       can: (s: OrderStatus|null) => s === "preparing",  color: "var(--d-success)",  bg: "var(--d-success-soft)" },
  { key: "completed",  label: "Mark Completed",   can: (s: OrderStatus|null) => s === "ready",      color: "var(--d-info)",     bg: "var(--d-info-soft)" },
] as const;

export default function OrderStatusActions({ orderId, currentStatus, paymentStatus, total }: Props) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<OrderStatus | null>(null);
  const [loadingAction, setLoadingAction] = useState<OrderAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const status = normalizeStatus(currentStatus);
  const paid = String(paymentStatus || "").trim().toLowerCase() === "paid";
  const canVoid = status === "pending" || status === "preparing" || status === "ready";
  const canRefund = status === "completed" && paid;

  async function updateStatus(nextStatus: OrderStatus) {
    if (loadingStatus || loadingAction) return;
    setError(null); setMessage(null);
    setLoadingStatus(nextStatus);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || "Failed"));
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setLoadingStatus(null);
    }
  }

  async function runAction(action: OrderAction) {
    if (loadingStatus || loadingAction) return;
    const reason = window.prompt(`Reason untuk ${action} order (wajib):`, "");
    if (!reason || reason.trim().length < 3) { setError("Reason minimum 3 characters."); return; }
    const managerPin = window.prompt("Manager PIN (optional):", "");
    if (!window.confirm(`${action === "void" ? "Void" : "Refund"} order ini${total ? ` (RM ${Number(total).toFixed(2)})` : ""}?`)) return;
    setError(null); setMessage(null);
    setLoadingAction(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim(), manager_pin: String(managerPin || "").trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(data?.error || `Failed to ${action}`));
      setMessage(data?.stock_restore_warning
        ? `${action} saved. Stock warning: ${String(data.stock_restore_warning)}`
        : `${action} success (${String(data?.approval_level || "auto")}).`
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`);
    } finally {
      setLoadingAction(null);
    }
  }

  const busy = Boolean(loadingStatus) || Boolean(loadingAction);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ACTION_BTNS.map(btn => {
          const enabled = btn.can(status) && !busy;
          return (
            <button
              key={btn.key}
              type="button"
              disabled={!enabled}
              onClick={() => void updateStatus(btn.key as OrderStatus)}
              style={{
                padding: "5px 12px",
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 600,
                color: btn.color,
                background: btn.bg,
                border: `1px solid ${btn.color}`,
                cursor: enabled ? "pointer" : "not-allowed",
                opacity: enabled ? 1 : 0.4,
              }}
            >
              {loadingStatus === btn.key ? "Updating..." : btn.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={!canVoid || busy}
          onClick={() => void runAction("void")}
          style={{
            padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
            color: "var(--d-error)", background: "var(--d-error-soft)",
            border: "1px solid var(--d-error)",
            cursor: canVoid && !busy ? "pointer" : "not-allowed",
            opacity: canVoid && !busy ? 1 : 0.4,
          }}
        >
          {loadingAction === "void" ? "Voiding..." : "Void"}
        </button>
        <button
          type="button"
          disabled={!canRefund || busy}
          onClick={() => void runAction("refund")}
          style={{
            padding: "5px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
            color: "var(--d-warning)", background: "var(--d-warning-soft)",
            border: "1px solid var(--d-warning)",
            cursor: canRefund && !busy ? "pointer" : "not-allowed",
            opacity: canRefund && !busy ? 1 : 0.4,
          }}
        >
          {loadingAction === "refund" ? "Refunding..." : "Refund"}
        </button>
      </div>
      {message && <p style={{ marginTop: 8, fontSize: 12, color: "var(--d-success)" }}>{message}</p>}
      {error   && <p style={{ marginTop: 8, fontSize: 12, color: "var(--d-error)" }}>{error}</p>}
    </div>
  );
}
