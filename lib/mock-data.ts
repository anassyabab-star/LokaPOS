export type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
};

export type Order = {
  id: string;
  ticket: string;
  items: number;
  total: number;
  status: "Preparing" | "Ready" | "Completed";
  created_at: string;
};

export const mockProducts: Product[] = [
  { id: "p1", name: "Flat White", category: "Coffee", price: 10, stock: 54 },
  { id: "p2", name: "Latte", category: "Coffee", price: 11, stock: 46 },
  { id: "p3", name: "Iced Americano", category: "Coffee", price: 9, stock: 39 },
  { id: "p4", name: "Matcha Latte", category: "Non-Coffee", price: 12, stock: 22 },
  { id: "p5", name: "Butter Croissant", category: "Pastry", price: 7, stock: 18 },
  { id: "p6", name: "Blueberry Muffin", category: "Pastry", price: 8, stock: 13 },
];

export const mockOrders: Order[] = [
  {
    id: "o1",
    ticket: "A-104",
    items: 3,
    total: 31,
    status: "Preparing",
    created_at: "2026-03-06T09:20:00Z",
  },
  {
    id: "o2",
    ticket: "A-103",
    items: 1,
    total: 10,
    status: "Ready",
    created_at: "2026-03-06T09:12:00Z",
  },
  {
    id: "o3",
    ticket: "A-102",
    items: 2,
    total: 20,
    status: "Completed",
    created_at: "2026-03-06T09:05:00Z",
  },
];
