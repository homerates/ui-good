export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  const propertyId = formData.get("property_id") as string | null;

  if (!file || !propertyId) {
    return NextResponse.json({ error: "Missing file or property_id" }, { status: 400 });
  }

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return NextResponse.json({ error: "Only JPEG, PNG, or WebP images allowed" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const supabase = db();

  // Verify this property belongs to the requesting user
  const { data: prop } = await supabase
    .from("properties")
    .select("id, user_id")
    .eq("id", propertyId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${propertyId}/${Date.now()}.${ext}`;

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("property-photos")
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error("[photo upload]", uploadError.message);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("property-photos").getPublicUrl(path);
  const photoUrl = urlData.publicUrl;

  // Store as user_photo snapshot — highest priority in photo resolution chain
  await supabase.from("property_snapshots").insert({
    property_id: propertyId,
    snapshot_type: "user_photo",
    data: { photoUrl },
    confidence: 1.0,
    fetched_at: new Date().toISOString(),
  });

  return NextResponse.json({ photoUrl });
}
