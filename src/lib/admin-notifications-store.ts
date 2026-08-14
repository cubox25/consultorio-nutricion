import { createClient } from "@/lib/supabase/client";
import { displayPatientName, formatDate, formatTime, todayISO } from "@/lib/utils";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import type { AdminNotificationItem } from "@/components/admin/admin-notifications-types";

export type { AdminNotificationItem };

type NotifState = {
  items: AdminNotificationItem[];
  loading: boolean;
  count: number;
};

const CACHE_KEY = "admin-notifications";
const POLL_MS = 30_000;

let state: NotifState = { items: [], loading: true, count: 0 };
const listeners = new Set<(s: NotifState) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;
let visibilityBound = false;

function emit() {
  for (const listener of listeners) listener(state);
}

async function fetchNotifications(force = false) {
  if (inflight && !force) return inflight;

  const run = async () => {
    try {
      if (!force) {
        const cached = getCached<AdminNotificationItem[]>(CACHE_KEY);
        if (cached) {
          state = {
            items: cached,
            loading: false,
            count: cached.length,
          };
          emit();
        }
      } else {
        invalidateCache(CACHE_KEY);
      }

      const supabase = createClient();
      const today = todayISO();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoIso = weekAgo.toISOString();

      const [pendingRes, todayCountRes, newPatientsRes, waRes] =
        await Promise.all([
          supabase
            .from("appointments")
            .select(
              `
              id,
              appointment_date,
              start_time,
              guest_first_name,
              guest_last_name,
              patient:patients(first_name, last_name),
              clinic:clinics(name)
            `
            )
            .eq("status", "pendiente")
            .gte("appointment_date", today)
            .order("appointment_date", { ascending: true })
            .order("start_time", { ascending: true })
            .limit(8),
          supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .eq("appointment_date", today)
            .in("status", ["pendiente", "confirmado"]),
          supabase
            .from("patients")
            .select("id", { count: "exact", head: true })
            .eq("is_active", true)
            .gte("created_at", weekAgoIso),
          supabase
            .from("whatsapp_service_status")
            .select("state")
            .eq("id", 1)
            .maybeSingle(),
        ]);

      const next: AdminNotificationItem[] = [];

      for (const appt of pendingRes.data ?? []) {
        const patient = Array.isArray(appt.patient)
          ? appt.patient[0]
          : appt.patient;
        const clinic = Array.isArray(appt.clinic)
          ? appt.clinic[0]
          : appt.clinic;
        const name = displayPatientName({
          patient: patient ?? null,
          guest_first_name: appt.guest_first_name,
          guest_last_name: appt.guest_last_name,
        });
        next.push({
          id: `pending-${appt.id}`,
          title: "Turno pendiente de confirmar",
          body: `${name} · ${formatDate(appt.appointment_date)} ${formatTime(appt.start_time)}${
            clinic?.name ? ` · ${clinic.name}` : ""
          }`,
          href: "/admin/agenda",
          icon: "pending",
        });
      }

      const todayCount = todayCountRes.count ?? 0;
      if (todayCount > 0) {
        next.push({
          id: `today-${today}`,
          title:
            todayCount === 1
              ? "1 turno pendiente para hoy"
              : `${todayCount} turnos pendientes para hoy`,
          body: "Revisá la agenda del día.",
          href: "/admin/agenda",
          icon: "today",
        });
      }

      const newPatients = newPatientsRes.count ?? 0;
      if (newPatients > 0) {
        next.push({
          id: `patients-week-${today}`,
          title:
            newPatients === 1
              ? "1 paciente nuevo esta semana"
              : `${newPatients} pacientes nuevos esta semana`,
          body: "Mirálos en el listado de pacientes.",
          href: "/admin/pacientes",
          icon: "patient",
        });
      }

      const waState = waRes.data?.state;
      if (
        waState &&
        (waState === "DISCONNECTED" ||
          waState === "ERROR" ||
          waState === "QR_REQUIRED")
      ) {
        next.push({
          id: `wa-${waState}`,
          title:
            waState === "QR_REQUIRED"
              ? "WhatsApp esperando QR"
              : "WhatsApp desconectado",
          body: "Entrá a WhatsApp para reconectar el servicio.",
          href: "/admin/whatsapp",
          icon: "whatsapp",
        });
      }

      setCached(CACHE_KEY, next, 25_000);
      state = { items: next, loading: false, count: next.length };
      emit();
    } catch {
      state = { ...state, loading: false };
      emit();
    } finally {
      inflight = null;
    }
  };

  if (force && inflight) {
    await inflight;
  }
  inflight = run();
  return inflight;
}

function onVisibilityOrFocus() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    return;
  }
  void fetchNotifications(true);
}

function ensurePolling() {
  if (!timer) {
    void fetchNotifications();
    timer = setInterval(() => void fetchNotifications(true), POLL_MS);
  }
  if (typeof window !== "undefined" && !visibilityBound) {
    visibilityBound = true;
    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);
  }
}

function stopPollingIfIdle() {
  if (listeners.size > 0) return;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (typeof window !== "undefined" && visibilityBound) {
    visibilityBound = false;
    document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    window.removeEventListener("focus", onVisibilityOrFocus);
  }
}

/** Una sola fuente de notificaciones para todas las campanitas del admin. */
export function subscribeAdminNotifications(listener: (s: NotifState) => void) {
  listeners.add(listener);
  listener(state);
  ensurePolling();
  return () => {
    listeners.delete(listener);
    stopPollingIfIdle();
  };
}

export function refreshAdminNotifications(force = true) {
  return fetchNotifications(force);
}
