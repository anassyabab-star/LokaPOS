"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";

type Props = {
  orderId: string;
  currentStatus: string | null | undefined;
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

export default function OrderStatusActions({ orderId, currentStatus }: Props) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = normalizeStatus(currentStatus);
  const canMarkPreparing = status === "pending";
  const canMarkReady = status === "preparing";
  const canMarkCompleted = status === "ready";

  async function updateStatus(nextStatus: OrderStatus) {
    if (loadingStatus) return;
    setError(null);
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

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canMarkPreparing || Boolean(loadingStatus)}
          onClick={() => updateStatus("preparing")}
          className="rounded-md border border-amber-700/50 bg-amber-900/20 px-2.5 py-1 text-xs font-medium text-amber-200 transition hover:bg-amber-800/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingStatus === "preparing" ? "Updating..." : "Mark Preparing"}
        </button>
        <button
          type="button"
          disabled={!canMarkReady || Boolean(loadingStatus)}
          onClick={() => updateStatus("ready")}
          className="rounded-md border border-emerald-700/50 bg-emerald-900/20 px-2.5 py-1 text-xs font-medium text-emerald-200 transition hover:bg-emerald-800/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingStatus === "ready" ? "Updating..." : "Mark Ready"}
        </button>
        <button
          type="button"
          disabled={!canMarkCompleted || Boolean(loadingStatus)}
          onClick={() => updateStatus("completed")}
          className="rounded-md border border-sky-700/50 bg-sky-900/20 px-2.5 py-1 text-xs font-medium text-sky-200 transition hover:bg-sky-800/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loadingStatus === "completed" ? "Updating..." : "Mark Completed"}
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
    </div>
  );
}
