import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateServiceClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/errors";
import {
  ensureBrandAssetsBucket,
  parseImageDataUrl,
  profileAvatarPath,
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
      error: NextResponse.json(
        {
          error:
            "No tenés permisos de staff. En Supabase SQL ejecutá: UPDATE profiles SET role = 'admin' WHERE email = 'tu@email.com';",
        },
        { status: 403 }
      ),
    };
  }
  return { user, supabase };
}

function mapAvatarError(error: unknown) {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  if (/SERVICE_ROLE|service role/i.test(message)) {
    return "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel (opcional si ya corriste la migración 018).";
  }
  if (/bucket|not found|does not exist/i.test(message)) {
    return "Falta el bucket «brand-assets». Ejecutá en Supabase la migración 018_brand_assets_storage.sql.";
  }
  if (/MB|inválid|invalid|mime/i.test(message)) {
    return message;
  }
  return friendlyError(error, "No se pudo guardar la foto.");
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const body = (await request.json()) as { dataUrl?: string };
    if (!body.dataUrl?.startsWith("data:image/")) {
      return NextResponse.json({ error: "Imagen inválida." }, { status: 400 });
    }

    const { data: profile } = await staff.supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", staff.user.id)
      .maybeSingle();

    const { buffer, contentType } = parseImageDataUrl(body.dataUrl);
    const path = profileAvatarPath(staff.user.id);

    // Preferimos service role solo para crear el bucket si hace falta.
    // El upload lo hace la sesión del staff (RLS de migración 018).
    const service = tryCreateServiceClient();
    if (service) {
      await ensureBrandAssetsBucket(service);
    }

    const url = await replaceBrandAsset({
      service: staff.supabase,
      path,
      buffer,
      contentType,
      previousUrl: profile?.avatar_url,
      ensureBucket: false,
    });

    const { error } = await staff.supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", staff.user.id);
    if (error) throw error;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[profile-avatar] POST", error);
    return NextResponse.json({ error: mapAvatarError(error) }, { status: 500 });
  }
}

export async function DELETE() {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const { data: profile } = await staff.supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", staff.user.id)
      .maybeSingle();

    await removeBrandAsset({
      service: staff.supabase,
      path: profileAvatarPath(staff.user.id),
      previousUrl: profile?.avatar_url,
    });

    const { error } = await staff.supabase
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", staff.user.id);
    if (error) throw error;

    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("[profile-avatar] DELETE", error);
    return NextResponse.json(
      { error: mapAvatarError(error) || "No se pudo eliminar la foto." },
      { status: 500 }
    );
  }
}
