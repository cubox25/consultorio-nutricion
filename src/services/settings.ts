import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Clinic,
  ClinicSchedule,
  SystemSettings,
  AppointmentBlock,
} from "@/types";
import {
  resolveSettingsPrices,
  withStoredPrices,
} from "@/lib/price-settings";

function withResolvedPrices(row: SystemSettings | null): SystemSettings | null {
  if (!row) return null;
  const prices = resolveSettingsPrices(row);
  return {
    ...row,
    consultation_price: prices.consultation_price,
    anthropometry_price: prices.anthropometry_price,
  };
}

export async function getSystemSettings(supabase: SupabaseClient) {
  const withPrices =
    "id, site_name, professional_name, logo_url, description, phone, whatsapp, email, address, social_instagram, social_facebook, social_tiktok, primary_color, secondary_color, accent_color, timezone, appointment_duration_minutes, min_advance_hours, booking_cutoff_minutes, max_advance_days, auto_create_patient_on_booking, reminder_enabled, reminder_hours_before, reminder_day_of_appointment, booking_policy_text, about_text, services_json, how_to_book_text, footer_text, consultation_price, anthropometry_price, created_at, updated_at";
  const withoutPrices =
    "id, site_name, professional_name, logo_url, description, phone, whatsapp, email, address, social_instagram, social_facebook, social_tiktok, primary_color, secondary_color, accent_color, timezone, appointment_duration_minutes, min_advance_hours, booking_cutoff_minutes, max_advance_days, auto_create_patient_on_booking, reminder_enabled, reminder_hours_before, reminder_day_of_appointment, booking_policy_text, about_text, services_json, how_to_book_text, footer_text, created_at, updated_at";

  const first = await supabase
    .from("system_settings")
    .select(withPrices)
    .limit(1)
    .maybeSingle();
  if (!first.error) {
    return withResolvedPrices(first.data as SystemSettings | null);
  }

  const { data, error } = await supabase
    .from("system_settings")
    .select(withoutPrices)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return withResolvedPrices((data as SystemSettings | null) ?? null);
}

export async function updateSystemSettings(
  supabase: SupabaseClient,
  id: string,
  payload: Partial<SystemSettings>
) {
  const consulta = Number(payload.consultation_price);
  const anthro = Number(payload.anthropometry_price);
  const nextPayload: Partial<SystemSettings> = { ...payload };
  if (Number.isFinite(consulta) || Number.isFinite(anthro)) {
    const current = await getSystemSettings(supabase);
    nextPayload.services_json = withStoredPrices(
      payload.services_json ?? current?.services_json,
      Number.isFinite(consulta) ? consulta : Number(current?.consultation_price) || 0,
      Number.isFinite(anthro) ? anthro : Number(current?.anthropometry_price) || 0
    );
  }

  const first = await supabase
    .from("system_settings")
    .update(nextPayload)
    .eq("id", id)
    .select()
    .single();

  if (
    first.error &&
    /consultation_price|anthropometry_price/i.test(first.error.message)
  ) {
    const { consultation_price, anthropometry_price, ...rest } = nextPayload;
    void consultation_price;
    void anthropometry_price;
    const retry = await supabase
      .from("system_settings")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (retry.error) throw retry.error;
    return withResolvedPrices(retry.data as SystemSettings) as SystemSettings;
  }

  if (first.error) throw first.error;
  return withResolvedPrices(first.data as SystemSettings) as SystemSettings;
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
