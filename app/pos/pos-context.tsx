"use client";

import { createContext, useContext, type ReactNode } from "react";

// Re-export all types needed by sub-components
export type { MainTab, CheckoutSubTab, Overlay, OrderRow, OrderDetailItem, ReportRange, DashboardData } from "./hooks/use-pos-state";
export { REGISTER_ID } from "./hooks/use-pos-state";

// The context type is the return type of usePosState
import { usePosState } from "./hooks/use-pos-state";
type PosStateType = ReturnType<typeof usePosState>;

const PosContext = createContext<PosStateType | null>(null);

export function PosProvider({ children, value }: { children: ReactNode; value: PosStateType }) {
  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used within PosProvider");
  return ctx;
}
