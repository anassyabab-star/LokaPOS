import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const DEFAULT_BUCKET = "expense-invoices";
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "image/heic",
  "image/heif",
];

function getBucketName() {
  return String(process.env.EXPENSES_STORAGE_BUCKET || DEFAULT_BUCKET).trim() || DEFAULT_BUCKET;
}

function sanitizeFilename(name: string) {
  return name.replace(/[^\w.\-]+/g, "_");
}

async function ensurePublicBucket(bucketName: string) {
  const supabase = createSupabaseAdminClient();
  const { data: bucket, error: getBucketError } = await supabase.storage.getBucket(bucketName);

  if (!getBucketError && bucket) {
    if (!bucket.public) {
      const { error: updateError } = await supabase.storage.updateBucket(bucketName, {
        public: true,
        fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      });
      if (updateError) throw new Error(updateError.message);
    }
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  });
  if (createError) throw new Error(createError.message);
}

export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;

  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Max 8MB." },
        { status: 400 }
      );
    }

    const allowedMimeTypes = new Set(ALLOWED_MIME_TYPES);
    const mimeType = file.type || "application/octet-stream";
    if (!allowedMimeTypes.has(mimeType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use image or PDF." },
        { status: 400 }
      );
    }

    const bucketName = getBucketName();
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = `${Date.now()}-${sanitizeFilename(file.name)}`;
    const today = new Date().toISOString().slice(0, 10);
    const objectPath = `expenses/${today}/${safeName}`;

    await ensurePublicBucket(bucketName);

    const supabase = createSupabaseAdminClient();
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(objectPath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(objectPath);

    if (!publicUrlData?.publicUrl) {
      throw new Error("Failed to create invoice URL from Supabase Storage");
    }

    return NextResponse.json({
      success: true,
      file_id: objectPath,
      file_name: safeName,
      file_url: publicUrlData.publicUrl,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload invoice";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
