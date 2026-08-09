import type { SupabaseClient } from "@supabase/supabase-js";
import { startOfMonth, endOfMonth, format } from "date-fns";
import type { Appointment, DashboardStats } from "@/types";
import { todayISO } from "@/lib/utils";

const DASHBOARD_APPT_SELECT = `
  id,
  clinic_id,
  patient_id,
  appointment_date,
  start_time,
  end_time,
  status,
  reason,
  guest_first_name,
  guest_last_name,
  patient:patients(id, first_name, last_name),
  clinic:clinics(id, name)
`.replace(/\s+/g, " ").trim();

export async function getDashboardStats(
  supabase: SupabaseClient
): Promise<DashboardStats> {
  const today = todayISO();
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const [
    patientsRes,
    newPatientsRes,
    todayRes,
    pendingRes,
    confirmedRes,
    monthRes,
    upcomingRes,
    clinicsRes,
  ] = await Promise.all([
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .gte("created_at", `${monthStart}T00:00:00`),
    supabase
      .from("appointments")
      .select(DASHBOARD_APPT_SELECT)
      .eq("appointment_date", today)
      .neq("status", "cancelado")
      .order("start_time"),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendiente"),
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "confirmado")
      .gte("appointment_date", today),
    supabase
      .from("appointments")
      .select("status, clinic_id, clinic:clinics(name)")
      .gte("appointment_date", monthStart)
      .lte("appointment_date", monthEnd),
    supabase
      .from("appointments")
      .select(DASHBOARD_APPT_SELECT)
      .gte("appointment_date", today)
      .neq("status", "cancelado")
      .order("appointment_date")
      .order("start_time")
      .limit(8),
    supabase.from("clinics").select("id, name"),
  ]);

  if (patientsRes.error) throw patientsRes.error;
  if (newPatientsRes.error) throw newPatientsRes.error;
  if (todayRes.error) throw todayRes.error;
  if (pendingRes.error) throw pendingRes.error;
  if (confirmedRes.error) throw confirmedRes.error;
  if (monthRes.error) throw monthRes.error;
  if (upcomingRes.error) throw upcomingRes.error;

  const monthRows = monthRes.data ?? [];
  const attended = monthRows.filter((r) => r.status === "atendido").length;
  const cancelled = monthRows.filter((r) => r.status === "cancelado").length;
  const noShow = monthRows.filter((r) => r.status === "no_asistio").length;

  const clinicMap = new Map<string, string>();
  (clinicsRes.data ?? []).forEach((c) => clinicMap.set(c.id, c.name));

  const byClinicCount = new Map<string, number>();
  monthRows.forEach((row) => {
    const name =
      (row.clinic as { name?: string } | null)?.name ||
      clinicMap.get(row.clinic_id) ||
      "Sin consultorio";
    byClinicCount.set(name, (byClinicCount.get(name) ?? 0) + 1);
  });

  return {
    totalPatients: patientsRes.count ?? 0,
    newPatients: newPatientsRes.count ?? 0,
    todayAppointments: (todayRes.data ?? []).length,
    pendingAppointments: pendingRes.count ?? 0,
    confirmedAppointments: confirmedRes.count ?? 0,
    monthAppointments: monthRows.length,
    attendedAppointments: attended,
    cancelledAppointments: cancelled,
    noShowAppointments: noShow,
    byClinic: Array.from(byClinicCount.entries()).map(([name, total]) => ({
      name,
      total,
    })),
    upcoming: (upcomingRes.data ?? []) as unknown as Appointment[],
    todayList: (todayRes.data ?? []) as unknown as Appointment[],
  };
}
