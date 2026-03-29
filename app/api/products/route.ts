import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const supabase = createSupabaseAdminClient();

type ProductQueryRow = {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  image_url: string | null;
  stock: number;
  is_active: boolean | null;
  category_id: string | null;
  categories: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  product_variants: Array<{ id: string; name: string; price_adjustment: number }> | null;
  product_addons: Array<{ id: string; name: string; price: number }> | null;
};

function pickCategoryName(
  categories: ProductQueryRow["categories"]
) {
  if (!categories) return null;
  if (Array.isArray(categories)) return categories[0]?.name || null;
  return categories.name || null;
}

// ================= GET PRODUCTS =================
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("include_inactive") === "1";

  let query = supabase
    .from("products")
    .select(`
      id,
      name,
      price,
      cost,
      image_url,
      stock,
      is_active,
      category_id,
      categories (
        id,
        name
      ),
      product_variants (
        id,
        name,
        price_adjustment
      ),
      product_addons (
        id,
        name,
        price
      )
    `)
    .order("created_at", { ascending: true });

  if (!includeInactive) {
    query = query.or("is_active.is.true,is_active.is.null");
  }

  let { data, error } = await query;
  if (error?.code === "42703") {
    let fallbackQuery = supabase
      .from("products")
      .select(`
        id,
        name,
        price,
        cost,
        stock,
        is_active,
        category_id,
        categories (
          id,
          name
        ),
        product_variants (
          id,
          name,
          price_adjustment
        ),
        product_addons (
          id,
          name,
          price
        )
      `)
      .order("created_at", { ascending: true });

    if (!includeInactive) {
      fallbackQuery = fallbackQuery.or("is_active.is.true,is_active.is.null");
    }

    const fallback = await fallbackQuery;
    data = fallback.data as typeof data;
    error = fallback.error as typeof error;
  }

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  const formatted = ((data || []) as ProductQueryRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    cost: p.cost,
    image_url: p.image_url || null,
    stock: p.stock,
    category_id: p.category_id || null,
    category: pickCategoryName(p.categories),
    status: p.is_active === false ? "disabled" : "enabled",
    variants: p.product_variants || [],
    addons: p.product_addons || [],
  }));

  return NextResponse.json(formatted);
}

// ================= ADD PRODUCT =================
export async function POST(req: Request) {
  const body = await req.json();

  const { name, price, cost, stock, category_id, image_url } = body;

  if (!name || price == null || stock == null || !category_id) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 }
    );
  }

  // Prevent duplicate product name
  const { count } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
    .ilike("name", name);

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Product name already exists" },
      { status: 400 }
    );
  }

  let { data: createdProduct, error } = await supabase
    .from("products")
    .insert([
      {
        name,
        price,
        cost: cost ?? 0,
        image_url: image_url || null,
        stock,
        category_id,
        is_active: true,
      },
    ])
    .select("id, name")
    .single();

  if (error?.code === "42703") {
    const fallback = await supabase
      .from("products")
      .insert([
        {
          name,
          price,
          cost: cost ?? 0,
          stock,
          category_id,
          is_active: true,
        },
      ])
      .select("id, name")
      .single();
    createdProduct = fallback.data;
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, product: createdProduct });
}
