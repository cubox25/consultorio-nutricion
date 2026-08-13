import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Clinic,
  ClinicSchedule,
  SystemSettings,
  AppointmentBlock,
} from "@/types";

export async function getSystemSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("system_settings")
    .select(
      "id, site_name, professional_name, logo_url, description, phone, whatsapp, email, address, social_instagram, social_facebook, social_tiktok, primary_color, secondary_color, accent_color, timezone, appointment_duration_minutes, min_advance_hours, booking_cutoff_minutes, max_advance_days, auto_create_patient_on_booking, reminder_enabled, reminder_hours_before, reminder_day_of_appointment, booking_policy_text, about_text, services_json, how_to_book_text, footer_text, created_at, updated_at"
    )
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as SystemSettings | null;
}

export async function updateSystemSettings(
  supabase: SupabaseClient,
  id: string,
  payload: Partial<SystemSettings>
) {
  const { data, error } = await supabase
    .from("system_settings")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as SystemSettings;
}

export async function listClinics(supabase: SupabaseClient, activeOnly = false) {
  let q = supabase
    .from("clinics")
    .select(
      "id, name, address, phone, google_maps_url, appointment_duration_minutes, is_active, sort_order, notes, created_at, updated_at"
    )
    .order("sort_order");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Clinic[];
}

export async function upsertClinic(
  supabase: SupabaseClient,
  payload: Partial<Clinic> & { id?: string }
) {
  if (payload.id) {
    const { data, error } = await supabase
      .from("clinics")
      .update(payload)
      .eq("id", payload.id)
      .select()
      .single();
    if (error) throw error;
    return data as Clinic;
  }
  const { data, error } = await supabase
    .from("clinics")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as Clinic;
}

export async function listClinicSchedules(
  supabase: SupabaseClient,
  clinicId?: string,
  activeOnly = true
) {
  let q = supabase.from("clinic_schedules").select("*");
  if (activeOnly) q = q.eq("is_active", true);
  if (clinicId) q = q.eq("clinic_id", clinicId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ClinicSchedule[];
}

export async function replaceClinicSchedules(
  supabase: SupabaseClient,
  clinicId: string,
  schedules: Omit<ClinicSchedule, "id" | "created_at" | "updated_at" | "clinic_id">[]
) {
  const { error: delError } = await supabase
    .from("clinic_schedules")
    .delete()
    .eq("clinic_id", clinicId);
  if (delError) throw delError;

  if (!schedules.length) return [];

  const { data, error } = await supabase
    .from("clinic_schedules")
    .insert(schedules.map((s) => ({ ...s, clinic_id: clinicId })))
    .select();
  if (error) throw error;
  return (data ?? []) as ClinicSchedule[];
}

export async function listBlocks(
  supabase: SupabaseClient,
  from: string,
  to: string,
  clinicId?: string
) {
  let q = supabase
    .from("appointment_blocks")
    .select("*")
    .gte("block_date", from)
    .lte("block_date", to);
  if (clinicId) q = q.or(`clinic_id.eq.${clinicId},clinic_id.is.null`);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as AppointmentBlock[];
}
