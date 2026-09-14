import type { SupabaseClient } from "@supabase/supabase-js";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  format,
} from "date-fns";
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

function isTransientError(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  return /fetch|network|timeout|ECONN|ETIMEDOUT|503|502|504|429|JWT|session|Failed to fetch|upstream/i.test(
    message
  );
}

/** Reintenta ante errores de red / Supabase intermitentes. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; delayMs?: number } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 450;
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i >= attempts) break;
      // Siempre reintentar al menos 1 vez; después solo si parece transitorio.
      if (i > 1 && !isTransientError(error)) break;
      await new Promise((r) => setTimeout(r, delayMs * i));
    }
  }
  throw lastError;
}

export async function getDashboardStats(
  supabase: SupabaseClient
): Promise<DashboardStats> {
  const today = todayISO();
  const now = new Date();
  const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");

  const sixMonthsStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const sixMonthsStartIso = sixMonthsStart.toISOString();

  // Dos oleadas: primero lo esencial del panel, después lo decorativo.
  // Así una demora en el gráfico no tumba todo el dashboard.
  const [
    patientsRes,
    newPatientsRes,
    todayRes,
    weekRes,
    pendingRes,
    confirmedRes,
    upcomingRes,
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
      .gte("appointment_date", weekStart)
      .lte("appointment_date", weekEnd)
      .neq("status", "cancelado"),
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
      .select(DASHBOARD_APPT_SELECT)
      .gte("appointment_date", today)
      .neq("status", "cancelado")
      .order("appointment_date")
      .order("start_time")
      .limit(8),
  ]);

  const critical = [
    patientsRes,
    newPatientsRes,
    todayRes,
    weekRes,
    pendingRes,
    confirmedRes,
    upcomingRes,
  ];
  const criticalError = critical.find((r) => r.error)?.error;
  if (criticalError) throw criticalError;

  const [monthRes, clinicsRes, patientsBaseRes, patientsRecentRes] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("status, clinic_id, clinic:clinics(name)")
        .gte("appointment_date", monthStart)
        .lte("appointment_date", monthEnd),
      supabase.from("clinics").select("id, name"),
      supabase
        .from("patients")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true)
        .lt("created_at", sixMonthsStartIso),
      supabase
        .from("patients")
        .select("created_at")
        .eq("is_active", true)
        .gte("created_at", sixMonthsStartIso)
        .order("created_at", { ascending: true }),
    ]);

  const monthRows = monthRes.error ? [] : (monthRes.data ?? []);
  const attended = monthRows.filter((r) => r.status === "atendido").length;
  const cancelled = monthRows.filter((r) => r.status === "cancelado").length;
  const noShow = monthRows.filter((r) => r.status === "no_asistio").length;

  const clinicMap = new Map<string, string>();
  (clinicsRes.error ? [] : clinicsRes.data ?? []).forEach((c) =>
    clinicMap.set(c.id, c.name)
  );

  const byClinicCount = new Map<string, number>();
  monthRows.forEach((row) => {
    const name =
      (row.clinic as { name?: string } | null)?.name ||
      clinicMap.get(row.clinic_id) ||
      "Sin consultorio";
    byClinicCount.set(name, (byClinicCount.get(name) ?? 0) + 1);
  });

  const baseCount = patientsBaseRes.error ? 0 : (patientsBaseRes.count ?? 0);
  const patientsRecent = patientsRecentRes.error
    ? []
    : (patientsRecentRes.data ?? []);
  const patientsByMonth: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const end = d.getTime();
    const recentInWindow = patientsRecent.filter(
      (p) => new Date(p.created_at).getTime() <= end
    ).length;
    patientsByMonth.push({
      label: new Intl.DateTimeFormat("es-AR", { month: "short" }).format(d),
      total: baseCount + recentInWindow,
    });
  }

  return {
    totalPatients: patientsRes.count ?? 0,
    newPatients: newPatientsRes.count ?? 0,
    todayAppointments: (todayRes.data ?? []).length,
    weekAppointments: weekRes.count ?? 0,
    pendingAppointments: pendingRes.count ?? 0,
    confirmedAppointments: confirmedRes.count ?? 0,
    monthAppointments: monthRows.length,
    attendedAppointments: attended,
    cancelledAppointments: cancelled,
    noShowAppointments: noShow,
    patientsByMonth,
    byClinic: Array.from(byClinicCount.entries()).map(([name, total]) => ({
      name,
      total,
    })),
    upcoming: (upcomingRes.data ?? []) as unknown as Appointment[],
    todayList: (todayRes.data ?? []) as unknown as Appointment[],
  };
}
