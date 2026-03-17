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
  const status = String(value || "").trim().toLowerCase();
  if (
    status === "pending" ||
    status === "preparing" ||
    status === "ready" ||
    status === "completed" ||
    status === "cancelled"
  ) {
    return status;
  }
  return null;
}

export default function OrderStatusActions({
  orderId,
  currentStatus,
  paymentStatus,
  total,
}: Props) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<OrderStatus | null>(null);
  const [loadingAction, setLoadingAction] = useState<OrderAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const status = normalizeStatus(currentStatus);
  const normalizedPaymentStatus = String(paymentStatus || "").trim().toLowerCase();
  const canMarkPreparing = status === "pending";
  const canMarkReady = status === "preparing";
  const canMarkCompleted = status === "ready";
  const canVoid = status === "pending" || status === "preparing" || status === "ready";
  const canRefund = status === "completed" && normalizedPaymentStatus === "paid";

  async function updateStatus(nextStatus: OrderStatus) {
    if (loadingStatus || loadingAction) return;
    setError(null);
    setMessage(null);
    setLoadingStatus(nextStatus);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || "Failed to update order status"));
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update order status");
    } finally {
      setLoadingStatus(null);
    }
  }

  async function runAction(action: OrderAction) {
    if (loadingStatus || loadingAction) return;

    const label = action === "void" ? "void" : "refund";
    const reason = window.prompt(`Reason untuk ${label} order (wajib):`, "");
    if (!reason || reason.trim().length < 3) {
      setError("Reason minimum 3 characters.");
      return;
    }

    const managerPin = window.prompt(
      "Manager PIN (optional). Isi jika transaksi perlukan approval tambahan.",
      ""
    );

    const confirmation = window.confirm(
      `${action === "void" ? "Void" : "Refund"} order ini${total ? ` (RM ${Number(total).toFixed(2)})` : ""}?`
    );
    if (!confirmation) return;

    setError(null);
    setMessage(null);
    setLoadingAction(action);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason.trim(),
          manager_pin: String(managerPin || "").trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(String(data?.error || `Failed to ${action} order`));
      }
      if (data?.stock_restore_warning) {
        setMessage(
          `${action === "void" ? "Void" : "Refund"} saved. Stock warning: ${String(data.stock_restore_warning)}`
        );
      } else {
        setMessage(
          `${action === "void" ? "Void" : "Refund"} success (${String(data?.approval_level || "auto")}).`
        );
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to ${action} order`);
    } finally {
      setLoadingAction(null);
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canMarkPreparing || Boolean(loadingStatus) || Boolean(loadingAction)}
          onClick={() => updateStatus("preparing")}
          className="rounded-md border border-amber-700/50 bg-amber-900/20 px-2.5 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-800/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingStatus === "preparing" ? "Updating..." : "Mark Preparing"}
        </button>
        <button
          type="button"
          disabled={!canMarkReady || Boolean(loadingStatus) || Boolean(loadingAction)}
          onClick={() => updateStatus("ready")}
          className="rounded-md border border-emerald-700/50 bg-emerald-900/20 px-2.5 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-800/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingStatus === "ready" ? "Updating..." : "Mark Ready"}
        </button>
        <button
          type="button"
          disabled={!canMarkCompleted || Boolean(loadingStatus) || Boolean(loadingAction)}
          onClick={() => updateStatus("completed")}
          className="rounded-md border border-sky-700/50 bg-sky-900/20 px-2.5 py-1 text-xs font-medium text-sky-200 transition hover:bg-sky-800/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingStatus === "completed" ? "Updating..." : "Mark Completed"}
        </button>
        <button
          type="button"
          disabled={!canVoid || Boolean(loadingStatus) || Boolean(loadingAction)}
          onClick={() => void runAction("void")}
          className="rounded-md border border-red-700/50 bg-red-900/20 px-2.5 py-1 text-xs font-medium text-red-200 transition hover:bg-red-800/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingAction === "void" ? "Voiding..." : "Void"}
        </button>
        <button
          type="button"
          disabled={!canRefund || Boolean(loadingStatus) || Boolean(loadingAction)}
          onClick={() => void runAction("refund")}
          className="rounded-md border border-orange-700/50 bg-orange-900/20 px-2.5 py-1 text-xs font-medium text-orange-200 transition hover:bg-orange-800/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingAction === "refund" ? "Refunding..." : "Refund"}
        </button>
      </div>
      {message ? <p className="mt-2 text-xs text-emerald-400">{message}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
