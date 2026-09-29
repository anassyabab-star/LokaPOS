import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-auth";
import { ASSET_BUCKET, publicAssetUrl, uploadTournamentFile } from "@/lib/tournament/storage";

// POST multipart { file } — tournament / team logo or payment QR. Public URL back.
export async function POST(req: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) return auth.response;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });
    const path = await uploadTournamentFile({ file, bucket: ASSET_BUCKET, prefix: "logos" });
    return NextResponse.json({ url: publicAssetUrl(path) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400 });
  }
}
