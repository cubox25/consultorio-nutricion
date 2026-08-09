import type { SupabaseClient } from "@supabase/supabase-js";
import type { Appointment, AppointmentStatus } from "@/types";

const APPOINTMENT_LIST_SELECT = `
  id,
  clinic_id,
  patient_id,
  appointment_date,
  start_time,
  end_time,
  status,
  reason,
  notes,
  guest_first_name,
  guest_last_name,
  guest_dni,
  guest_phone,
  guest_email,
  is_public_request,
  created_at,
  updated_at,
  patient:patients(id, first_name, last_name, dni, phone, email),
  clinic:clinics(id, name, appointment_duration_minutes)
`.replace(/\s+/g, " ").trim();

export async function listAppointments(
  supabase: SupabaseClient,
  filters: {
    from?: string;
    to?: string;
    clinicId?: string;
    status?: AppointmentStatus | "";
    patientId?: string;
  } = {}
) {
  let q = supabase
    .from("appointments")
    .select(APPOINTMENT_LIST_SELECT)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (filters.from) q = q.gte("appointment_date", filters.from);
  if (filters.to) q = q.lte("appointment_date", filters.to);
  if (filters.clinicId) q = q.eq("clinic_id", filters.clinicId);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.patientId) q = q.eq("patient_id", filters.patientId);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Appointment[];
}

export async function createAppointment(
  supabase: SupabaseClient,
  payload: Partial<Appointment>
) {
  const { data, error } = await supabase
    .from("appointments")
    .insert(payload)
    .select(APPOINTMENT_LIST_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Appointment;
}

export async function updateAppointment(
  supabase: SupabaseClient,
  id: string,
  payload: Partial<Appointment>
) {
  const { data, error } = await supabase
    .from("appointments")
    .update(payload)
    .eq("id", id)
    .select(APPOINTMENT_LIST_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as Appointment;
}

export async function updateAppointmentStatus(
  supabase: SupabaseClient,
  id: string,
  status: AppointmentStatus,
  cancellationReason?: string
) {
  const payload: Partial<Appointment> = { status };
  if (status === "cancelado") {
    payload.cancelled_at = new Date().toISOString();
    payload.cancellation_reason = cancellationReason ?? null;
  }
  return updateAppointment(supabase, id, payload);
}
