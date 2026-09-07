import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  LANDING_PHOTO_BUCKET,
  LANDING_PHOTO_PATH,
  getLandingPhotoPublicUrl,
} from "@/lib/landing-photo";
import {
  extractLandingPhoto,
  withLandingPhoto,
} from "@/lib/landing-photo-settings";

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
  return { user, supabase };
}

/** Quita data URLs enormes de services_json (legado inseguro). */
async function clearEmbeddedLandingPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>
) {
  const { data } = await supabase
    .from("system_settings")
    .select("id, services_json")
    .limit(1)
    .maybeSingle();
  if (!data?.id) return;
  if (!extractLandingPhoto(data.services_json)) return;
  await supabase
    .from("system_settings")
    .update({
      services_json: withLandingPhoto(data.services_json, null),
    })
    .eq("id", data.id);
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
  } catch {
    return NextResponse.json(
      { error: "No se pudo obtener la foto." },
      { status: 500 }
    );
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

    const match =
      /^data:(image\/(jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
        dataUrl
      );
    if (!match) {
      return NextResponse.json(
        { error: "Formato de imagen inválido." },
        { status: 400 }
      );
    }
    const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
    const buffer = Buffer.from(match[3].replace(/\s/g, ""), "base64");
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

    await clearEmbeddedLandingPhoto(staff.supabase);

    const publicUrl = getLandingPhotoPublicUrl(Date.now());
    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("[landing-photo] POST", error);
    return NextResponse.json(
      { error: "No se pudo guardar la foto." },
      { status: 500 }
    );
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
    await clearEmbeddedLandingPhoto(staff.supabase);
    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("[landing-photo] DELETE", error);
    return NextResponse.json(
      { error: "No se pudo eliminar la foto." },
      { status: 500 }
    );
  }
}
