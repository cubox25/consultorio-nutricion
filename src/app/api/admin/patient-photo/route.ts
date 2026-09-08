import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  parseImageDataUrl,
  patientPhotoPath,
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
    const body = (await request.json()) as {
      dataUrl?: string;
      patientId?: string;
    };
    if (!body.patientId) {
      return NextResponse.json(
        { error: "Paciente inválido." },
        { status: 400 }
      );
    }
    if (!body.dataUrl?.startsWith("data:image/")) {
      return NextResponse.json({ error: "Imagen inválida." }, { status: 400 });
    }

    const { data: patient, error: patientError } = await staff.supabase
      .from("patients")
      .select("id, photo_url")
      .eq("id", body.patientId)
      .maybeSingle();
    if (patientError) throw patientError;
    if (!patient) {
      return NextResponse.json(
        { error: "Paciente no encontrado." },
        { status: 404 }
      );
    }

    const { buffer, contentType } = parseImageDataUrl(body.dataUrl);
    const service = createServiceClient();
    const url = await replaceBrandAsset({
      service,
      path: patientPhotoPath(patient.id),
      buffer,
      contentType,
      previousUrl: patient.photo_url,
    });

    const { data: updated, error } = await staff.supabase
      .from("patients")
      .update({ photo_url: url })
      .eq("id", patient.id)
      .select(
        "id, first_name, last_name, dni, phone, email, birth_date, sex, address, occupation, emergency_contact_name, emergency_contact_phone, notes, photo_url, clinical_history_number, health_insurance, marital_status, clinical_alerts, communication_consent, is_active, created_at, updated_at"
      )
      .single();
    if (error) throw error;

    return NextResponse.json({ url, patient: updated });
  } catch (error) {
    console.error("[patient-photo] POST", error);
    const message =
      error instanceof Error && error.message.includes("MB")
        ? error.message
        : "No se pudo guardar la foto.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const body = (await request.json()) as { patientId?: string };
    if (!body.patientId) {
      return NextResponse.json(
        { error: "Paciente inválido." },
        { status: 400 }
      );
    }

    const { data: patient, error: patientError } = await staff.supabase
      .from("patients")
      .select("id, photo_url")
      .eq("id", body.patientId)
      .maybeSingle();
    if (patientError) throw patientError;
    if (!patient) {
      return NextResponse.json(
        { error: "Paciente no encontrado." },
        { status: 404 }
      );
    }

    const service = createServiceClient();
    await removeBrandAsset({
      service,
      path: patientPhotoPath(patient.id),
      previousUrl: patient.photo_url,
    });

    const { data: updated, error } = await staff.supabase
      .from("patients")
      .update({ photo_url: null })
      .eq("id", patient.id)
      .select(
        "id, first_name, last_name, dni, phone, email, birth_date, sex, address, occupation, emergency_contact_name, emergency_contact_phone, notes, photo_url, clinical_history_number, health_insurance, marital_status, clinical_alerts, communication_consent, is_active, created_at, updated_at"
      )
      .single();
    if (error) throw error;

    return NextResponse.json({ url: null, patient: updated });
  } catch (error) {
    console.error("[patient-photo] DELETE", error);
    return NextResponse.json(
      { error: "No se pudo eliminar la foto." },
      { status: 500 }
    );
  }
}
