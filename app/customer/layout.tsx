import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Loka Coffee — Order",
  description: "Order kopi Loka secara online",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#7F1D1D",
};

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FDF8F4] text-gray-900" style={{ colorScheme: "light" }}>
      {children}
    </div>
  );
}
