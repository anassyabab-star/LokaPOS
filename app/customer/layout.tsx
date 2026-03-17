export default async function CustomerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-screen bg-white text-gray-900" style={{ colorScheme: "light" }}>{children}</div>;
}
