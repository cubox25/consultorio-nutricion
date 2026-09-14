import { NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { tryCreateServiceClient } from "@/lib/supabase/admin";
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
 * Cambia el email de login.
 * Preferimos service role (confirmado al instante). Si no está en Vercel,
 * usamos la sesión del usuario (puede pedir confirmación según Auth).
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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) {
      return NextResponse.json(
        { error: "Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el servidor." },
        { status: 500 }
      );
    }

    // Verificar contraseña con un cliente aislado (no pisa la sesión del request)
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

    const service = tryCreateServiceClient();
    let updatedEmail = next;
    let needsConfirm = false;

    if (service) {
      const { data, error } = await service.auth.admin.updateUserById(
        staff.user.id,
        {
          email: next,
          email_confirm: true,
        }
      );
      if (error) {
        console.error("[account/email] admin", error);
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
      updatedEmail = data.user?.email ?? next;
      await service
        .from("profiles")
        .update({ email: updatedEmail })
        .eq("id", staff.user.id);
    } else {
      // Sin service role: cambio con la sesión del usuario logueado
      const { data, error } = await staff.supabase.auth.updateUser({
        email: next,
      });
      if (error) {
        console.error("[account/email] session", error);
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
      updatedEmail = data.user?.email ?? next;
      // Si Auth pide confirmación, el email efectivo sigue siendo el anterior
      needsConfirm =
        Boolean(data.user?.new_email) ||
        updatedEmail.toLowerCase() !== next;
      if (!needsConfirm) {
        await staff.supabase
          .from("profiles")
          .update({ email: updatedEmail })
          .eq("id", staff.user.id);
      }
    }

    return NextResponse.json({
      email: needsConfirm ? currentEmail : updatedEmail,
      pendingEmail: needsConfirm ? next : undefined,
      needsConfirm,
    });
  } catch (error) {
    console.error("[account/email]", error);
    return NextResponse.json(
      { error: friendlyError(error, "No se pudo cambiar el email.") },
      { status: 500 }
    );
  }
}
