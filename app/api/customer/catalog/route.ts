import { NextResponse } from "next/server";
import { requireCustomerApi } from "@/lib/customer-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { customerApiError } from "@/lib/customer-api";

type ProductRow = {
  id: string;
  name: string;
  price: number;
  category_id: string | null;
  categories: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  product_variants: Array<{ id: string; name: string; price_adjustment: number }> | null;
  product_addons: Array<{ id: string; name: string; price: number }> | null;
};

function pickCategory(
  relation: ProductRow["categories"]
): { id: string; name: string } | null {
  if (!relation) return null;
  if (Array.isArray(relation)) return relation[0] || null;
  return relation;
}

export async function GET() {
  const auth = await requireCustomerApi();
  if (!auth.ok) return auth.response;

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        `
        id,
        name,
        price,
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
      `
      )
      .or("is_active.is.true,is_active.is.null")
      .order("name", { ascending: true });

    if (error) {
      return customerApiError(500, error.message, "INTERNAL_ERROR");
    }

    const rows = (data || []) as ProductRow[];
    const categoriesMap = new Map<string, { id: string; name: string }>();

    const products = rows.map(row => {
      const category = pickCategory(row.categories);
      if (category?.id) {
        categoriesMap.set(category.id, { id: category.id, name: category.name });
      }

      return {
        id: row.id,
        name: row.name,
        price: Number(row.price || 0),
        category: category?.name || null,
        variants: (row.product_variants || []).map(variant => ({
          id: variant.id,
          name: variant.name,
          price_adjustment: Number(variant.price_adjustment || 0),
        })),
        addons: (row.product_addons || []).map(addon => ({
          id: addon.id,
          name: addon.name,
          price: Number(addon.price || 0),
        })),
      };
    });

    const categories = Array.from(categoriesMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return NextResponse.json({ categories, products });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load catalog";
    return customerApiError(500, message, "INTERNAL_ERROR");
  }
}

