import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireStaffApi } from "@/lib/staff-api-auth";

const supabase = createSupabaseAdminClient();

const SELFIE_BUCKET = "staff-selfies";
const MAX_SELFIE_BYTES = 5 * 1024 * 1024;

async function ensureSelfieBucket() {
  const { data: bucket } = await supabase.storage.getBucket(SELFIE_BUCKET);
  if (bucket) return;
  const { error } = await supabase.storage.createBucket(SELFIE_BUCKET, {
    public: true,
    fileSizeLimit: `${MAX_SELFIE_BYTES}`,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error) throw new Error(error.message);
}

type Geofence = { enabled?: boolean; lat?: number; lng?: number; radius_m?: number } | null;

// Haversine distance in meters between two lat/lng points.
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Returns null if allowed, or an error message string if the clock should be blocked.
async function checkGeofence(location: string | null): Promise<string | null> {
  const { data } = await supabase
    .from("store_settings")
    .select("clockin_geofence")
    .eq("id", "main")
    .maybeSingle();

  const fence = (data?.clockin_geofence ?? null) as Geofence;
  // Not configured / disabled → no enforcement.
  if (!fence || !fence.enabled || typeof fence.lat !== "number" || typeof fence.lng !== "number") {
    return null;
  }

  if (!location) {
    return "GPS wajib untuk clock in. Sila benarkan akses lokasi dan cuba lagi.";
  }
  const [latStr, lngStr] = location.split(",");
  const lat = Number(latStr), lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "Lokasi tidak sah. Sila benarkan akses lokasi dan cuba lagi.";
  }

  const radius = Number(fence.radius_m) > 0 ? Number(fence.radius_m) : 150;
  const dist = distanceMeters(lat, lng, fence.lat, fence.lng);
  if (dist > radius) {
    return `Anda ~${Math.round(dist)}m dari kedai. Clock in hanya dibenarkan dalam radius ${radius}m.`;
  }
  return null;
}

// Accepts a data URL (data:image/jpeg;base64,...) and returns the public URL.
async function uploadSelfie(dataUrl: string, userId: string, action: "clockin" | "clockout") {
  const match = /^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) throw new Error("Format gambar tidak sah.");
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength <= 0) throw new Error("Gambar kosong.");
  if (buffer.byteLength > MAX_SELFIE_BYTES) throw new Error("Gambar terlalu besar (maks 5MB).");

  await ensureSelfieBucket();

  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const objectPath = `${userId}/${Date.now()}-${action}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(SELFIE_BUCKET)
    .upload(objectPath, buffer, { contentType: mime, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from(SELFIE_BUCKET).getPublicUrl(objectPath);
  if (!data?.publicUrl) throw new Error("Gagal jana URL gambar.");
  return data.publicUrl;
}

export async function GET() {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  try {
    // Get staff profile
    const { data: profile } = await supabase
      .from("staff_profiles")
      .select("hourly_rate, employment_type, is_active")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    // Get open clockin (no clock_out_at)
    const { data: clockin } = await supabase
      .from("staff_clockins")
      .select("id, clock_in_at, notes")
      .eq("user_id", auth.user.id)
      .is("clock_out_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({ profile: profile ?? null, clockin: clockin ?? null });
  } catch (err) {
    return NextResponse.json({ error: "Failed to load status" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireStaffApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const selfie = String(body?.selfie || "").trim();
  const location = String(body?.location || "").trim() || null;

  try {
    if (action === "clockin") {
      // Check if already clocked in
      const { data: existing } = await supabase
        .from("staff_clockins")
        .select("id")
        .eq("user_id", auth.user.id)
        .is("clock_out_at", null)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({ error: "Sudah clock in." }, { status: 409 });
      }

      if (!selfie) {
        return NextResponse.json({ error: "Sila ambil gambar terlebih dahulu." }, { status: 400 });
      }
      const fenceError = await checkGeofence(location);
      if (fenceError) return NextResponse.json({ error: fenceError }, { status: 403 });
      const selfieUrl = await uploadSelfie(selfie, auth.user.id, "clockin");

      const { data, error } = await supabase
        .from("staff_clockins")
        .insert([{
          user_id: auth.user.id,
          clock_in_at: new Date().toISOString(),
          clock_in_selfie: selfieUrl,
          clock_in_location: location,
        }])
        .select("id, clock_in_at")
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, clockin: data });
    }

    if (action === "clockout") {
      const { data: open } = await supabase
        .from("staff_clockins")
        .select("id, clock_in_at")
        .eq("user_id", auth.user.id)
        .is("clock_out_at", null)
        .order("clock_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!open) {
        return NextResponse.json({ error: "Tiada sesi clock in aktif." }, { status: 409 });
      }

      if (!selfie) {
        return NextResponse.json({ error: "Sila ambil gambar terlebih dahulu." }, { status: 400 });
      }
      const fenceError = await checkGeofence(location);
      if (fenceError) return NextResponse.json({ error: fenceError }, { status: 403 });
      const selfieUrl = await uploadSelfie(selfie, auth.user.id, "clockout");

      const clockOutAt = new Date();
      const clockInAt = new Date(open.clock_in_at);
      const durationMinutes = Math.round((clockOutAt.getTime() - clockInAt.getTime()) / 60000);

      const { data, error } = await supabase
        .from("staff_clockins")
        .update({
          clock_out_at: clockOutAt.toISOString(),
          duration_minutes: durationMinutes,
          notes: String(body?.notes || "").trim() || null,
          clock_out_selfie: selfieUrl,
          clock_out_location: location,
        })
        .eq("id", open.id)
        .select("id, clock_in_at, clock_out_at, duration_minutes")
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, clockin: data });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
