import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errors";
import {
  LANDING_PHOTO_PATH,
  getLandingPhotoPublicUrl,
} from "@/lib/landing-photo";
import {
  extractLandingPhoto,
  withLandingPhoto,
} from "@/lib/landing-photo-settings";
import {
  parseImageDataUrl,
  removeBrandAsset,
  replaceBrandAsset,
} from "@/lib/brand-image.server";

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
  try {
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
  } catch (error) {
    console.warn(
      "[landing-photo] clearEmbeddedLandingPhoto",
      errorMessage(error)
    );
  }
}

function friendlyLandingError(error: unknown, fallback: string) {
  const message = errorMessage(error);
  if (/SERVICE_ROLE|Faltan NEXT_PUBLIC_SUPABASE/i.test(message)) {
    return "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor (Vercel → Environment Variables).";
  }
  if (/row-level security|AccessDenied|not allowed|403/i.test(message)) {
    return "No hay permiso para subir a Storage. Ejecutá la migración 018_brand_assets_storage.sql en Supabase.";
  }
  if (/Bucket not found|No such bucket/i.test(message)) {
    return "Falta el bucket «brand-assets» en Supabase Storage.";
  }
  if (message.includes("MB") || /inválid/i.test(message)) {
    return message;
  }
  return fallback;
}

export async function GET() {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const { data: settings } = await staff.supabase
      .from("system_settings")
      .select("landing_photo_url")
      .limit(1)
      .maybeSingle();

    const fromColumn = settings?.landing_photo_url?.trim() || null;
    if (fromColumn && !fromColumn.startsWith("data:")) {
      return NextResponse.json({ url: fromColumn });
    }

    try {
      const service = createServiceClient();
      const { data, error } = await service.storage
        .from("brand-assets")
        .list("", { search: "landing-photo" });
      if (!error) {
        const file = (data ?? []).find((f) => f.name === LANDING_PHOTO_PATH);
        if (file) {
          return NextResponse.json({
            url: getLandingPhotoPublicUrl(file.updated_at ?? Date.now()),
          });
        }
      }
    } catch {
      // Sin service role: devolvemos lo que haya en columna (aunque sea data URL legado).
    }

    return NextResponse.json({ url: fromColumn });
  } catch (error) {
    console.error("[landing-photo] GET", error);
    return NextResponse.json(
      { error: friendlyLandingError(error, "No se pudo obtener la foto.") },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const body = (await request.json()) as { dataUrl?: string };
    if (!body.dataUrl?.startsWith("data:image/")) {
      return NextResponse.json({ error: "Imagen inválida." }, { status: 400 });
    }

    const { buffer } = parseImageDataUrl(body.dataUrl);

    const { data: settings } = await staff.supabase
      .from("system_settings")
      .select("id, landing_photo_url")
      .limit(1)
      .maybeSingle();
    if (!settings?.id) {
      return NextResponse.json(
        { error: "Configuración no disponible." },
        { status: 404 }
      );
    }

    let publicUrl: string | null = null;
    try {
      const service = createServiceClient();
      publicUrl = await replaceBrandAsset({
        service,
        path: LANDING_PHOTO_PATH,
        buffer,
        // Siempre JPEG: el editor convierte con canvas.toDataURL("image/jpeg")
        contentType: "image/jpeg",
        previousUrl: settings.landing_photo_url,
      });
    } catch (serviceError) {
      // Fallback: subir con la sesión staff (requiere políticas de Storage).
      console.warn(
        "[landing-photo] service upload failed, trying staff",
        errorMessage(serviceError)
      );
      const { error: uploadError } = await staff.supabase.storage
        .from("brand-assets")
        .upload(LANDING_PHOTO_PATH, buffer, {
          contentType: "image/jpeg",
          upsert: true,
          cacheControl: "3600",
        });
      if (uploadError) {
        throw new Error(
          friendlyLandingError(
            serviceError,
            friendlyLandingError(uploadError, "No se pudo guardar la foto.")
          )
        );
      }
      publicUrl = getLandingPhotoPublicUrl(Date.now());
    }

    const { error: updateError } = await staff.supabase
      .from("system_settings")
      .update({ landing_photo_url: publicUrl })
      .eq("id", settings.id);
    if (updateError) throw updateError;

    await clearEmbeddedLandingPhoto(staff.supabase);

    return NextResponse.json({ url: publicUrl });
  } catch (error) {
    console.error("[landing-photo] POST", error);
    return NextResponse.json(
      { error: friendlyLandingError(error, "No se pudo guardar la foto.") },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const { data: settings } = await staff.supabase
      .from("system_settings")
      .select("id, landing_photo_url")
      .limit(1)
      .maybeSingle();
    if (!settings?.id) {
      return NextResponse.json(
        { error: "Configuración no disponible." },
        { status: 404 }
      );
    }

    try {
      const service = createServiceClient();
      await removeBrandAsset({
        service,
        path: LANDING_PHOTO_PATH,
        previousUrl: settings.landing_photo_url,
      });
    } catch (serviceError) {
      console.warn(
        "[landing-photo] service delete failed, trying staff",
        errorMessage(serviceError)
      );
      const { error } = await staff.supabase.storage
        .from("brand-assets")
        .remove([LANDING_PHOTO_PATH]);
      if (error) {
        console.warn("[landing-photo] staff delete", error.message);
      }
    }

    const { error: updateError } = await staff.supabase
      .from("system_settings")
      .update({ landing_photo_url: null })
      .eq("id", settings.id);
    if (updateError) throw updateError;

    await clearEmbeddedLandingPhoto(staff.supabase);
    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("[landing-photo] DELETE", error);
    return NextResponse.json(
      { error: friendlyLandingError(error, "No se pudo eliminar la foto.") },
      { status: 500 }
    );
  }
}
