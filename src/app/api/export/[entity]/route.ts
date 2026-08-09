import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCSV } from "@/lib/utils";

const ENTITY_TABLE: Record<string, string> = {
  patients: "patients",
  appointments: "appointments",
  clinical: "clinical_records",
  anthropometry: "anthropometric_records",
  plans: "nutrition_plans",
};

const ENTITY_FILENAME: Record<string, string> = {
  patients: "pacientes",
  appointments: "turnos",
  clinical: "historias-clinicas",
  anthropometry: "antropometria",
  plans: "planes-alimentarios",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ entity: string }> }
) {
  const { entity } = await params;
  const table = ENTITY_TABLE[entity];

  if (!table) {
    return NextResponse.json(
      {
        error:
          "Entidad no válida. Usá patients, appointments, clinical, anthropometry o plans.",
      },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const { data: isStaff, error: staffError } = await supabase.rpc("is_staff");
  if (staffError || isStaff !== true) {
    return NextResponse.json({ error: "No tenés permisos." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "No se pudo exportar los datos." },
      { status: 500 }
    );
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const csv = rows.length ? toCSV(rows) : "";
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${ENTITY_FILENAME[entity]}-${stamp}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
