import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const supabase = createSupabaseAdminClient();

export async function POST(req: Request) {
  const body = await req.json();
  const { product_id, name, price } = body;

  if (!product_id || !name) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("product_addons")
    .insert([
      {
        product_id,
        name: String(name).trim(),
        price: Number(price || 0),
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, addon: data });
}
