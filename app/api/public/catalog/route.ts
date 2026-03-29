import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const supabase = createSupabaseAdminClient();

export async function GET() {
  try {
    // Categories
    const { data: cats } = await supabase
      .from("categories")
      .select("id, name")
      .order("name", { ascending: true });

    // Products with variants and addons
    let { data: products, error } = await supabase
      .from("products")
      .select(`
        id, name, price, image_url, category_id,
        categories ( id, name ),
        product_variants ( id, name, price_adjustment ),
        product_addons ( id, name, price )
      `)
      .or("is_active.is.true,is_active.is.null")
      .gt("stock", 0)
      .order("name", { ascending: true });

    // Fallback without image_url
    if (error && error.code === "42703") {
      const fb = await supabase
        .from("products")
        .select(`
          id, name, price, category_id,
          categories ( id, name ),
          product_variants ( id, name, price_adjustment ),
          product_addons ( id, name, price )
        `)
        .or("is_active.is.true,is_active.is.null")
        .gt("stock", 0)
        .order("name", { ascending: true });
      products = fb.data as typeof products;
      error = fb.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mapped = (products || []).map((p: Record<string, unknown>) => {
      const cat = p.categories;
      const catName = Array.isArray(cat) ? (cat[0] as Record<string, string>)?.name : (cat as Record<string, string>)?.name;
      return {
        id: p.id,
        name: p.name,
        price: p.price,
        image_url: (p as Record<string, unknown>).image_url || null,
        category: catName || null,
        variants: (p.product_variants as Array<Record<string, unknown>>) || [],
        addons: (p.product_addons as Array<Record<string, unknown>>) || [],
      };
    });

    return NextResponse.json({ categories: cats || [], products: mapped });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
}
