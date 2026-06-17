// Shapes returned by /api/public/catalog (the existing live backend).
export type Variant = { id: string; name: string; price_adjustment: number };
export type Addon = { id: string; name: string; price: number };

export type Product = {
  id: string;
  name: string;
  price: number; // RM
  image_url: string | null;
  category: string | null;
  variants: Variant[];
  addons: Addon[];
};

export type Category = { id: string; name: string };
