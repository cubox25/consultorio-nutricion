import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  LANDING_PHOTO_BUCKET,
  LANDING_PHOTO_PATH,
  createServiceClient,
  getLandingPhotoPublicUrl,
} from "@/lib/landing-photo";

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "No autorizado." }, { status: 401 }) };
  }
  const { data: isStaff, error: staffError } = await supabase.rpc("is_staff");
  if (staffError || isStaff !== true) {
    return {
      error: NextResponse.json({ error: "No tenés permisos." }, { status: 403 }),
    };
  }
  return { user };
}

export async function GET() {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const service = createServiceClient();
    const { data, error } = await service.storage
      .from(LANDING_PHOTO_BUCKET)
      .list("", { search: "landing-photo" });
    if (error) throw error;
    const file = (data ?? []).find((f) => f.name === LANDING_PHOTO_PATH);
    if (!file) {
      return NextResponse.json({ url: null });
    }
    return NextResponse.json({
      url: getLandingPhotoPublicUrl(file.updated_at ?? Date.now()),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "No se pudo obtener la foto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const body = (await request.json()) as { dataUrl?: string };
    const dataUrl = body.dataUrl;
    if (!dataUrl || !dataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Imagen inválida." },
        { status: 400 }
      );
    }

    const match = /^data:(image\/[a-zA-Z+]+);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return NextResponse.json(
        { error: "Formato de imagen inválido." },
        { status: 400 }
      );
    }
    const mime = match[1];
    const buffer = Buffer.from(match[2], "base64");
    if (buffer.length > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "La imagen no puede superar 5 MB." },
        { status: 400 }
      );
    }

    const service = createServiceClient();
    const { data: buckets } = await service.storage.listBuckets();
    const exists = (buckets ?? []).some((b) => b.name === LANDING_PHOTO_BUCKET);
    if (!exists) {
      const { error: bucketError } = await service.storage.createBucket(
        LANDING_PHOTO_BUCKET,
        {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024,
          allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
        }
      );
      if (bucketError) throw bucketError;
    }

    const contentType =
      mime === "image/png"
        ? "image/png"
        : mime === "image/webp"
          ? "image/webp"
          : "image/jpeg";

    const { error: uploadError } = await service.storage
      .from(LANDING_PHOTO_BUCKET)
      .upload(LANDING_PHOTO_PATH, buffer, {
        contentType,
        upsert: true,
        cacheControl: "3600",
      });
    if (uploadError) throw uploadError;

    const publicUrl = getLandingPhotoPublicUrl(Date.now());
    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("[landing-photo] POST", error);
    const message =
      error instanceof Error ? error.message : "No se pudo guardar la foto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const service = createServiceClient();
    const { error } = await service.storage
      .from(LANDING_PHOTO_BUCKET)
      .remove([LANDING_PHOTO_PATH]);
    if (error) throw error;
    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("[landing-photo] DELETE", error);
    const message =
      error instanceof Error ? error.message : "No se pudo eliminar la foto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
