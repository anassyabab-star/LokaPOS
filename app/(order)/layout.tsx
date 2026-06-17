import type { ReactNode } from "react";
import { OrderProvider, OrderToast } from "./order-provider";

// Phone-width cream shell for the customer-ordering flow. Forces a light color
// scheme so it never inherits the dark admin theme from globals.css.
export default function OrderLayout({ children }: { children: ReactNode }) {
  return (
    <OrderProvider>
      <div
        style={{ colorScheme: "light" }}
        className="flex min-h-[100dvh] w-full justify-center bg-[#DDD8CF]"
      >
        <div className="relative w-full max-w-[440px] min-h-[100dvh] overflow-hidden bg-cream font-sans text-espresso antialiased">
          {children}
          <OrderToast />
        </div>
      </div>
    </OrderProvider>
  );
}
