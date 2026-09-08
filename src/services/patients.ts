import type { SupabaseClient } from "@supabase/supabase-js";
import type { Patient, PatientActivityHints } from "@/types";
import { patientSearchOrFilter } from "@/lib/postgrest";
import { todayISO } from "@/lib/utils";

const PATIENT_LIST_SELECT =
  "id, first_name, last_name, dni, phone, email, birth_date, sex, address, occupation, emergency_contact_name, emergency_contact_phone, notes, photo_url, clinical_history_number, health_insurance, marital_status, clinical_alerts, communication_consent, is_active, created_at, updated_at";

export async function searchPatients(
  supabase: SupabaseClient,
  query: string,
  page = 1,
  pageSize = 20
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let q = supabase
    .from("patients")
    .select(PATIENT_LIST_SELECT, { count: "exact" })
    .eq("is_active", true)
    .order("last_name", { ascending: true })
    .range(from, to);

  if (query.trim()) {
    const filter = patientSearchOrFilter(query);
    if (filter) q = q.or(filter);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: (data ?? []) as Patient[], count: count ?? 0 };
}

export async function getPatientsActivityHints(
  supabase: SupabaseClient,
  patientIds: string[]
): Promise<Record<string, PatientActivityHints>> {
  const result: Record<string, PatientActivityHints> = {};
  patientIds.forEach((id) => {
    result[id] = { lastConsultation: null, nextAppointment: null };
  });
  if (!patientIds.length) return result;

  const today = todayISO();

  // Capamos el volumen: con N pacientes bastan ~N filas por lado para el “más reciente”.
  const softLimit = Math.max(patientIds.length * 3, 30);

  const [recordsRes, appointmentsRes] = await Promise.all([
    supabase
      .from("clinical_records")
      .select("patient_id, record_date")
      .in("patient_id", patientIds)
      .order("record_date", { ascending: false })
      .limit(softLimit),
    supabase
      .from("appointments")
      .select("patient_id, appointment_date, start_time")
      .in("patient_id", patientIds)
      .gte("appointment_date", today)
      .neq("status", "cancelado")
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true })
      .limit(softLimit),
  ]);

  if (recordsRes.error) throw recordsRes.error;
  if (appointmentsRes.error) throw appointmentsRes.error;

  for (const row of recordsRes.data ?? []) {
    if (row.patient_id && !result[row.patient_id]?.lastConsultation) {
      result[row.patient_id].lastConsultation = row.record_date;
    }
  }

  for (const row of appointmentsRes.data ?? []) {
    if (row.patient_id && !result[row.patient_id]?.nextAppointment) {
      result[row.patient_id].nextAppointment = `${row.appointment_date} ${String(
        row.start_time
      ).slice(0, 5)}`;
    }
  }

  return result;
}

export async function getPatient(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Patient;
}

export async function createPatient(
  supabase: SupabaseClient,
  payload: Partial<Patient>
) {
  const { data, error } = await supabase
    .from("patients")
    .insert(payload)
    .select(PATIENT_LIST_SELECT)
    .single();
  if (error) throw error;
  return data as Patient;
}

export async function updatePatient(
  supabase: SupabaseClient,
  id: string,
  payload: Partial<Patient>
) {
  const { data, error } = await supabase
    .from("patients")
    .update(payload)
    .eq("id", id)
    .select(PATIENT_LIST_SELECT)
    .single();
  if (error) throw error;
  return data as Patient;
}

export async function softDeletePatient(supabase: SupabaseClient, id: string) {
  const { error } = await supabase
    .from("patients")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

function storagePathFromPublicUrl(url: string | null | undefined): string | null {
  if (!url || url.startsWith("data:")) return null;
  const marker = "/storage/v1/object/public/brand-assets/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  const path = url.slice(idx + marker.length).split("?")[0];
  return path || null;
}

/**
 * Elimina el paciente y su historial clínico (CASCADE).
 * Limpia archivos en Storage antes de borrar la fila.
 * Los turnos quedan (patient_id en null); no se borra el usuario admin.
 */
export async function deletePatient(supabase: SupabaseClient, id: string) {
  const [{ data: files }, { data: anthros }, { data: patient }] =
    await Promise.all([
      supabase.from("files").select("storage_path").eq("patient_id", id),
      supabase
        .from("anthropometry_documents")
        .select("storage_path")
        .eq("patient_id", id),
      supabase.from("patients").select("photo_url").eq("id", id).maybeSingle(),
    ]);

  const filePaths = (files ?? [])
    .map((f) => f.storage_path)
    .filter((p): p is string => !!p);
  const anthroPaths = (anthros ?? [])
    .map((f) => f.storage_path)
    .filter((p): p is string => !!p);
  const photoPath = storagePathFromPublicUrl(patient?.photo_url);

  if (filePaths.length) {
    await supabase.storage.from("patient-files").remove(filePaths);
  }
  if (anthroPaths.length) {
    await supabase.storage.from("anthropometry").remove(anthroPaths);
  }
  if (photoPath) {
    await supabase.storage.from("brand-assets").remove([photoPath]);
  }

  const { error } = await supabase.from("patients").delete().eq("id", id);
  if (error) throw error;
}
