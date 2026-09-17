"use client";

import { orderTarget, type OrderTargetFields } from "@/lib/order-flow";

// Where an order goes once it is ready: 🪑 Meja 7 · 📟 Buzzer 12 · 🥡 Take Away.
// Shared by the POS Orders tab, the Collect Payment sheet and the Kitchen Display.

const LIGHT: Record<string, string> = {
  table: "border-amber-200 bg-amber-100 text-amber-800",
  buzzer: "border-blue-200 bg-blue-100 text-blue-800",
  take_away: "border-gray-200 bg-gray-100 text-gray-700",
  counter: "border-gray-200 bg-gray-50 text-gray-500",
};

const DARK: Record<string, string> = {
  table: "border-transparent bg-amber-400 text-black",
  buzzer: "border-transparent bg-blue-500 text-white",
  take_away: "border-transparent bg-gray-600 text-gray-100",
  counter: "border-transparent bg-gray-800 text-gray-400",
};

const ICON: Record<string, string> = {
  table: "🪑",
  buzzer: "📟",
  take_away: "🥡",
  counter: "🏪",
};

export function OrderTargetBadge({
  order,
  dark = false,
  size = "sm",
  hideCounter = false,
}: {
  order: OrderTargetFields | null | undefined;
  dark?: boolean;
  size?: "sm" | "lg";
  hideCounter?: boolean;
}) {
  const target = orderTarget(order);
  if (target.kind === "counter" && hideCounter) return null;

  const palette = dark ? DARK : LIGHT;
  const sizing = size === "lg" ? "px-3 py-1 text-sm font-bold" : "px-2 py-0.5 text-[10px] font-semibold";

  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border ${palette[target.kind]} ${sizing}`}>
      <span aria-hidden>{ICON[target.kind]}</span>
      {target.text}
    </span>
  );
}
