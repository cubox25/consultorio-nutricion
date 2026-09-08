import { NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { friendlyError } from "@/lib/errors";

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

/**
 * Cambia el email de login con service role (confirmado al instante).
 * Evita fallos por SMTP / “confirm email change” del dashboard.
 */
export async function POST(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const body = (await request.json()) as {
      email?: string;
      currentPassword?: string;
    };
    const next = (body.email ?? "").trim().toLowerCase();
    const currentPassword = body.currentPassword ?? "";

    if (!next || !next.includes("@")) {
      return NextResponse.json(
        { error: "Ingresá un email válido." },
        { status: 400 }
      );
    }
    if (currentPassword.length < 6) {
      return NextResponse.json(
        { error: "La contraseña actual es obligatoria." },
        { status: 400 }
      );
    }

    const currentEmail = staff.user.email;
    if (!currentEmail) {
      return NextResponse.json(
        { error: "Sesión no válida." },
        { status: 401 }
      );
    }
    if (next === currentEmail.toLowerCase()) {
      return NextResponse.json(
        { error: "El email es el mismo que el actual." },
        { status: 400 }
      );
    }

    // Verificar contraseña con un cliente aislado (no pisa la sesión del request)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json(
        { error: "Falta configuración del servidor." },
        { status: 500 }
      );
    }
    const authClient = createSupabaseJsClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: passwordError } = await authClient.auth.signInWithPassword({
      email: currentEmail,
      password: currentPassword,
    });
    if (passwordError) {
      return NextResponse.json(
        { error: "La contraseña actual no es correcta." },
        { status: 400 }
      );
    }

    const service = createServiceClient();
    const { data, error } = await service.auth.admin.updateUserById(
      staff.user.id,
      {
        email: next,
        email_confirm: true,
      }
    );
    if (error) {
      console.error("[account/email]", error);
      const msg = error.message.toLowerCase();
      if (
        msg.includes("already") ||
        msg.includes("registered") ||
        msg.includes("exists")
      ) {
        return NextResponse.json(
          { error: "Ese email ya está en uso por otra cuenta." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        {
          error: friendlyError(
            error,
            error.message || "No se pudo cambiar el email."
          ),
        },
        { status: 500 }
      );
    }

    await service
      .from("profiles")
      .update({ email: next })
      .eq("id", staff.user.id);

    return NextResponse.json({
      email: data.user?.email ?? next,
    });
  } catch (error) {
    console.error("[account/email]", error);
    return NextResponse.json(
      { error: friendlyError(error, "No se pudo cambiar el email.") },
      { status: 500 }
    );
  }
}
