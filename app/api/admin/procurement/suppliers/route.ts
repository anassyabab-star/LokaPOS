import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupplierRow = {
  id: string;
  name: string;
  code: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
};

export async function GET(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const active = (searchParams.get("active") || "all").toLowerCase();

  try {
    const supabase = createSupabaseAdminClient();
    let query = supabase
      .from("suppliers")
      .select("id,name,code,contact_name,phone,email,notes,is_active,created_at,updated_at")
      .order("name", { ascending: true })
      .limit(500);

    if (active === "1") query = query.eq("is_active", true);
    if (active === "0") query = query.eq("is_active", false);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = ((data || []) as SupplierRow[]).map(row => ({
      ...row,
      is_active: row.is_active !== false,
    }));

    const filtered = rows.filter(row => {
      if (!q) return true;
      return (
        row.name.toLowerCase().includes(q) ||
        String(row.code || "").toLowerCase().includes(q) ||
        String(row.contact_name || "").toLowerCase().includes(q) ||
        String(row.phone || "").toLowerCase().includes(q) ||
        String(row.email || "").toLowerCase().includes(q)
      );
    });

    const summary = rows.reduce(
      (acc, row) => {
        acc.total += 1;
        if (row.is_active) acc.active += 1;
        else acc.inactive += 1;
        return acc;
      },
      { total: 0, active: 0, inactive: 0 }
    );

    return NextResponse.json({ suppliers: filtered, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load suppliers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const body = (await req.json()) as {
      name?: string;
      code?: string;
      contact_name?: string;
      phone?: string;
      email?: string;
      notes?: string;
      is_active?: boolean;
    };

    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Supplier name is required" }, { status: 400 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name,
        code: String(body.code || "").trim() || null,
        contact_name: String(body.contact_name || "").trim() || null,
        phone: String(body.phone || "").trim() || null,
        email: String(body.email || "").trim() || null,
        notes: String(body.notes || "").trim() || null,
        is_active: body.is_active !== false,
      })
      .select("id,name")
      .single();

    if (error) {
      const status = error.message.toLowerCase().includes("duplicate") ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ success: true, supplier: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create supplier";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
