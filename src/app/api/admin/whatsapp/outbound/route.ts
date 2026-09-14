import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

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

/**
 * DELETE body:
 * { mode: "historial" } → enviado / error / omitido
 * { mode: "todo" } → toda la cola
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

  try {
    const service = createServiceClient();

    if (mode === "one") {
      if (!body.id) {
        return NextResponse.json({ error: "Falta id." }, { status: 400 });
      }
      const { error, count } = await service
        .from("whatsapp_outbound_messages")
        .delete({ count: "exact" })
        .eq("id", body.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, deleted: count ?? 0 });
    }

    let query = service
      .from("whatsapp_outbound_messages")
      .delete({ count: "exact" });

    if (mode === "historial") {
      query = query.in("status", ["enviado", "error", "omitido"]);
    } else if (mode === "todo") {
      query = query.neq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
    }

    const { error, count } = await query;
    if (error) throw error;
    return NextResponse.json({ ok: true, deleted: count ?? 0 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "No se pudo borrar la cola.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
