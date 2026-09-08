import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
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

    const { data: profile } = await staff.supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", staff.user.id)
      .maybeSingle();

    const { buffer, contentType } = parseImageDataUrl(body.dataUrl);
    const path = profileAvatarPath(staff.user.id);
    const service = createServiceClient();
    const url = await replaceBrandAsset({
      service,
      path,
      buffer,
      contentType,
      previousUrl: profile?.avatar_url,
    });

    const { error } = await staff.supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", staff.user.id);
    if (error) throw error;

    return NextResponse.json({ url });
  } catch (error) {
    console.error("[profile-avatar] POST", error);
    const message =
      error instanceof Error && error.message.includes("MB")
        ? error.message
        : "No se pudo guardar la foto.";
    return NextResponse.json({ error: message }, { status: 500 });
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

    const service = createServiceClient();
    await removeBrandAsset({
      service,
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
      { error: "No se pudo eliminar la foto." },
      { status: 500 }
    );
  }
}
