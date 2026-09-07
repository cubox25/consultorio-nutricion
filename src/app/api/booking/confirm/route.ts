import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/postgrest";

function normalizeDni(value: string) {
  return value.replace(/\D/g, "");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: unknown; dni?: unknown };
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const dni = normalizeDni(typeof body.dni === "string" ? body.dni : "");

    if (!isUuid(id)) {
      return NextResponse.json({ error: "Turno inválido." }, { status: 400 });
    }
    if (dni.length < 7) {
      return NextResponse.json(
        { error: "Se requiere el DNI para confirmar el turno." },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    const { data: existing, error: loadError } = await supabase
      .from("appointments")
      .select(
        `
        id,
        status,
        is_public_request,
        guest_dni,
        guest_first_name,
        guest_last_name
      `
      )
      .eq("id", id)
      .eq("is_public_request", true)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!existing) {
      return NextResponse.json({ error: "Turno no encontrado." }, { status: 404 });
    }

    const guestDni = normalizeDni(existing.guest_dni ?? "");
    if (!guestDni || guestDni !== dni) {
      return NextResponse.json({ error: "Turno no encontrado." }, { status: 404 });
    }

    if (existing.status !== "pendiente" && existing.status !== "confirmado") {
      return NextResponse.json({ error: "Turno no disponible." }, { status: 409 });
    }

    const firstName = existing.guest_first_name?.trim() || null;
    const lastName = existing.guest_last_name?.trim() || null;

    if (existing.status === "pendiente") {
      const { data, error } = await supabase
        .from("appointments")
        .update({
          status: "confirmado",
          guest_first_name: firstName,
          guest_last_name: lastName,
        })
        .eq("id", id)
        .eq("is_public_request", true)
        .eq("status", "pendiente")
        .select("id, status, guest_first_name, guest_last_name")
        .maybeSingle();
      if (error) throw error;
      if (data) {
        return NextResponse.json({
          id: data.id,
          status: data.status,
          first_name: data.guest_first_name,
          last_name: data.guest_last_name,
        });
      }
    }

    return NextResponse.json({
      id: existing.id,
      status: existing.status,
      first_name: firstName,
      last_name: lastName,
    });
  } catch (error) {
    console.error("[booking/confirm]", error);
    return NextResponse.json(
      { error: "No se pudo confirmar el turno." },
      { status: 500 }
    );
  }
}
