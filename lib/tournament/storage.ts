import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// Payment receipts are private (signed URLs for admins only); logos are public.
export const PAYMENT_BUCKET = "tournament-payments";
export const ASSET_BUCKET = "tournament-assets";

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
export const RECEIPT_TYPES = [...IMAGE_TYPES, "application/pdf"];

async function ensureBucket(name: string, isPublic: boolean, types: string[]) {
  const supabase = createSupabaseAdminClient();
  const { data: bucket, error } = await supabase.storage.getBucket(name);
  if (!error && bucket) return;
  const { error: createError } = await supabase.storage.createBucket(name, {
    public: isPublic,
    fileSizeLimit: `${MAX_UPLOAD_BYTES}`,
    allowedMimeTypes: types,
  });
  if (createError && !/already exists/i.test(createError.message)) throw new Error(createError.message);
}

/** Validate + upload; returns the object path. Throws with a user-facing message. */
export async function uploadTournamentFile(opts: {
  file: File;
  bucket: typeof PAYMENT_BUCKET | typeof ASSET_BUCKET;
  prefix: string;
}) {
  const { file, bucket, prefix } = opts;
  const types = bucket === PAYMENT_BUCKET ? RECEIPT_TYPES : IMAGE_TYPES;
  if (file.size <= 0) throw new Error("File is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("File too large (max 8MB)");
  const mime = file.type || "application/octet-stream";
  if (!types.includes(mime)) throw new Error(bucket === PAYMENT_BUCKET ? "Use an image or PDF" : "Use an image");

  await ensureBucket(bucket, bucket === ASSET_BUCKET, types);
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${prefix}/${Date.now()}-${safe}`;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: mime, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export function publicAssetUrl(path: string) {
  const supabase = createSupabaseAdminClient();
  return supabase.storage.from(ASSET_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function signedReceiptUrl(path: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(PAYMENT_BUCKET).createSignedUrl(path, 60 * 10);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}
