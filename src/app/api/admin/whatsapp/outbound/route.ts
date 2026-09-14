import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tryCreateServiceClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

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
  return { supabase };
}

/**
 * Limpia la cola sin exigir SERVICE_ROLE:
 * - Con service role: DELETE real
 * - Sin service role: UPDATE a "omitido" (el staff ya tiene política UPDATE;
 *   la lista del panel no muestra omitidos)
 */
async function clearOutbound(
  db: SupabaseClient,
  mode: "historial" | "todo" | "one",
  id: string | undefined,
  hardDelete: boolean
) {
  if (mode === "one") {
    if (!id) return { error: "Falta id.", status: 400 as const };
    if (hardDelete) {
      const { error, count } = await db
        .from("whatsapp_outbound_messages")
        .delete({ count: "exact" })
        .eq("id", id);
      if (error) throw error;
      return { deleted: count ?? 0 };
    }
    const { error, count } = await db
      .from("whatsapp_outbound_messages")
      .update({ status: "omitido", error_message: null }, { count: "exact" })
      .eq("id", id)
      .neq("status", "omitido");
    if (error) throw error;
    return { deleted: count ?? 0 };
  }

  if (hardDelete) {
    let query = db.from("whatsapp_outbound_messages").delete({ count: "exact" });
    if (mode === "historial") {
      query = query.in("status", ["enviado", "error", "omitido"]);
    } else {
      query = query.neq("id", "00000000-0000-0000-0000-000000000000");
    }
    const { error, count } = await query;
    if (error) throw error;
    return { deleted: count ?? 0 };
  }

  let query = db
    .from("whatsapp_outbound_messages")
    .update(
      { status: "omitido", error_message: null },
      { count: "exact" }
    );

  if (mode === "historial") {
    query = query.in("status", ["enviado", "error"]);
  } else {
    query = query.in("status", [
      "enviado",
      "error",
      "pendiente",
      "enviando",
    ]);
  }

  const { error, count } = await query;
  if (error) throw error;
  return { deleted: count ?? 0 };
}

/**
 * DELETE body:
 * { mode: "historial" } → enviados / errores
 * { mode: "todo" } → toda la cola visible
 * { mode: "one", id: "uuid" } → un mensaje
 */
export async function DELETE(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  const body = (await request.json().catch(() => ({}))) as {
    mode?: "historial" | "todo" | "one";
    id?: string;
  };
  const mode = body.mode || "historial";
  if (mode !== "historial" && mode !== "todo" && mode !== "one") {
    return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
  }

  try {
    const service = tryCreateServiceClient();
    const db = service ?? staff.supabase;
    const result = await clearOutbound(db, mode, body.id, Boolean(service));

    if ("error" in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      soft: !service,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo borrar la cola.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
