import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  logoStoragePath,
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

export async function POST(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const body = (await request.json()) as { dataUrl?: string };
    if (!body.dataUrl?.startsWith("data:image/")) {
      return NextResponse.json({ error: "Imagen inválida." }, { status: 400 });
    }

    const { data: settings } = await staff.supabase
      .from("system_settings")
      .select("id, logo_url")
      .limit(1)
      .maybeSingle();
    if (!settings?.id) {
      return NextResponse.json(
        { error: "Configuración no disponible." },
        { status: 404 }
      );
    }

    const { buffer, contentType } = parseImageDataUrl(body.dataUrl);
    const service = createServiceClient();
    const url = await replaceBrandAsset({
      service,
      path: logoStoragePath(),
      buffer,
      contentType,
      previousUrl: settings.logo_url,
    });

    const { error } = await staff.supabase
      .from("system_settings")
      .update({ logo_url: url })
      .eq("id", settings.id);
    if (error) throw error;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[logo] POST", error);
    const message =
      error instanceof Error && error.message.includes("MB")
        ? error.message
        : "No se pudo guardar el logo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const { data: settings } = await staff.supabase
      .from("system_settings")
      .select("id, logo_url")
      .limit(1)
      .maybeSingle();
    if (!settings?.id) {
      return NextResponse.json(
        { error: "Configuración no disponible." },
        { status: 404 }
      );
    }

    const service = createServiceClient();
    await removeBrandAsset({
      service,
      path: logoStoragePath(),
      previousUrl: settings.logo_url,
    });

    const { error } = await staff.supabase
      .from("system_settings")
      .update({ logo_url: null })
      .eq("id", settings.id);
    if (error) throw error;

    return NextResponse.json({ url: null });
  } catch (error) {
    console.error("[logo] DELETE", error);
    return NextResponse.json(
      { error: "No se pudo eliminar el logo." },
      { status: 500 }
    );
  }
}
