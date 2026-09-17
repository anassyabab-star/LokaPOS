import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const supabase = createSupabaseAdminClient();

/** How far back "bestsellers" looks. */
const BESTSELLER_WINDOW_DAYS = 90;

const PRODUCT_SELECT = `
  id, name, price, image_url, category_id,
  categories ( id, name ),
  product_variants ( id, name, price_adjustment ),
  product_addons ( id, name, price )
`;

const PRODUCT_SELECT_NO_IMAGE = `
  id, name, price, category_id,
  categories ( id, name ),
  product_variants ( id, name, price_adjustment ),
  product_addons ( id, name, price )
`;

/**
 * Product ids ranked by quantity sold, most first.
 *
 * Prefers the get_bestsellers RPC, which groups in the database and returns a
 * couple of dozen rows. Without it (migration 20260917 not applied yet) we page
 * through the window instead of taking PostgREST's arbitrary first 1,000 rows —
 * that older shortcut ranked by whatever the server happened to return.
 */
async function loadBestsellerIds(): Promise<string[]> {
  const since = new Date(Date.now() - BESTSELLER_WINDOW_DAYS * 86_400_000).toISOString();

  const rpc = await supabase.rpc("get_bestsellers", { p_since: since, p_limit: 24 });
  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as Array<{ product_id: string | null }>)
      .map(r => String(r.product_id || ""))
      .filter(Boolean);
  }

  const tally = new Map<string, number>();
  const PAGE = 1000;
  for (let page = 0; page < 6; page++) {
    const { data, error } = await supabase
      .from("order_items")
      .select("product_id, qty")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ product_id: string | null; qty: number | null }>) {
      if (!r.product_id) continue;
      tally.set(r.product_id, (tally.get(r.product_id) || 0) + Number(r.qty || 0));
    }
    if (data.length < PAGE) break;
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

export async function GET() {
  try {
    // Independent reads — run them together rather than one round trip after
    // another. Bestsellers is filtered against the product list afterwards.
    const [catsRes, productsRes, bestsellerIds] = await Promise.all([
      supabase.from("categories").select("id, name").order("name", { ascending: true }),
      supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .or("is_active.is.true,is_active.is.null")
        .gt("stock", 0)
        .order("name", { ascending: true }),
      loadBestsellerIds().catch(() => [] as string[]),
    ]);

    const cats = catsRes.data;
    let products = productsRes.data;
    let error = productsRes.error;

    // Fallback for databases without products.image_url.
    if (error && error.code === "42703") {
      const fb = await supabase
        .from("products")
        .select(PRODUCT_SELECT_NO_IMAGE)
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
      const catName = Array.isArray(cat)
        ? (cat[0] as Record<string, string>)?.name
        : (cat as Record<string, string>)?.name;
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

    const available = new Set(mapped.map(p => String(p.id)));
    const bestsellers = bestsellerIds.filter(id => available.has(id));

    return NextResponse.json(
      { categories: cats || [], products: mapped, bestsellers },
      {
        headers: {
          // The menu is identical for every visitor and changes rarely, so let
          // the CDN answer most requests. stale-while-revalidate means a menu
          // edit never makes anyone wait for the origin.
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return NextResponse.json({ error: "Failed to load catalog" }, { status: 500 });
  }
}
