import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// ================= UPDATE =================
export async function PUT(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const body = await req.json();

  const { name, price, cost, stock, category_id, image_url, is_active } = body;

  if (stock != null && stock < 0) {
    return NextResponse.json(
      { error: "Stock cannot be negative" },
      { status: 400 }
    );
  }

  const updateData: Record<string, unknown> = {};
  if (name !== undefined) updateData.name = name;
  if (price !== undefined) updateData.price = price;
  if (cost !== undefined) updateData.cost = cost;
  if (image_url !== undefined) updateData.image_url = image_url || null;
  if (stock !== undefined) updateData.stock = stock;
  if (category_id !== undefined) updateData.category_id = category_id;
  if (is_active !== undefined) updateData.is_active = is_active;

  let { error } = await supabase
    .from("products")
    .update(updateData)
    .eq("id", id);

  if (error?.code === "42703" && "image_url" in updateData) {
    const fallbackData = { ...updateData };
    delete fallbackData.image_url;
    const fallback = await supabase.from("products").update(fallbackData).eq("id", id);
    error = fallback.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ================= DELETE =================
export async function DELETE(_: Request, { params }: RouteContext) {
  const { id } = await params;

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
