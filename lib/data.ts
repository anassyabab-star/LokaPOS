import { type Order, type Product } from "@/lib/mock-data";
import { supabase } from "@/lib/supabase";

type ProductRow = {
  id: string;
  name: string;
  category: string | null;
  price: number;
  stock: number | null;
};

type OrderRow = {
  id: string;
  order_number: string | null;
  total: number;
  status: string | null;
  created_at: string;
};

export async function getProducts(): Promise<Product[]> {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, name, category, price, stock")
    .order("name");

  if (error) {
    console.error("Supabase getProducts error:", error);
    throw new Error("Failed to fetch products");
  }

  const rows = (data ?? []) as ProductRow[];
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    category: row.category || "Uncategorized",
    price: Number(row.price || 0),
    stock: Number(row.stock || 0),
  }));
}

export async function getOrders(): Promise<Order[]> {
  if (!supabase) {
    throw new Error("Supabase is not configured");
  }

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, total, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase getOrders error:", error);
    throw new Error("Failed to fetch orders");
  }

  const rows = (data ?? []) as OrderRow[];
  return rows.map(row => ({
    id: row.id,
    ticket: row.order_number || row.id.slice(0, 8).toUpperCase(),
    items: 0,
    total: Number(row.total || 0),
    status:
      row.status?.toLowerCase() === "preparing"
        ? "Preparing"
        : row.status?.toLowerCase() === "ready"
          ? "Ready"
          : "Completed",
    created_at: row.created_at,
  }));
}
