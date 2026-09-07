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
const DISMISSED_KEY = "admin-notifications-dismissed";
const POLL_MS = 30_000;

let state: NotifState = { items: [], loading: true, count: 0 };
const listeners = new Set<(s: NotifState) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight: Promise<void> | null = null;
let visibilityBound = false;

function emit() {
  for (const listener of listeners) listener(state);
}

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore quota */
  }
}

function applyDismissed(items: AdminNotificationItem[]): AdminNotificationItem[] {
  const dismissed = readDismissed();
  if (dismissed.size === 0) return items;

  const visible = items.filter((item) => {
    // Turnos aún pendientes de confirmar: nunca se ocultan por click
    if (!item.dismissible) return true;
    return !dismissed.has(item.id);
  });

  // Limpia ids viejos que ya no existen en el feed actual
  const liveIds = new Set(items.map((i) => i.id));
  let changed = false;
  for (const id of [...dismissed]) {
    if (!liveIds.has(id)) {
      dismissed.delete(id);
      changed = true;
    }
  }
  if (changed) writeDismissed(dismissed);

  return visible;
}

function publish(items: AdminNotificationItem[], loading = false) {
  const visible = applyDismissed(items);
  state = { items: visible, loading, count: visible.length };
  emit();
}

async function fetchNotifications(force = false) {
  if (inflight && !force) return inflight;

  const run = async () => {
    try {
      if (!force) {
        const cached = getCached<AdminNotificationItem[]>(CACHE_KEY);
        if (cached) {
          publish(cached, false);
        }
      } else {
        invalidateCache(CACHE_KEY);
      }

      const supabase = createClient();
      const today = todayISO();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoIso = weekAgo.toISOString();

      const [pendingRes, newBookingsRes, todayCountRes, newPatientsRes, waRes] =
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
            .select(
              `
              id,
              appointment_date,
              start_time,
              created_at,
              guest_first_name,
              guest_last_name,
              patient:patients(first_name, last_name),
              clinic:clinics(name)
            `
            )
            .eq("status", "confirmado")
            .eq("is_public_request", true)
            .gte("appointment_date", today)
            .gte("created_at", weekAgoIso)
            .order("created_at", { ascending: false })
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
      const seenApptIds = new Set<string>();

      for (const appt of pendingRes.data ?? []) {
        seenApptIds.add(appt.id);
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
          dismissible: false,
        });
      }

      for (const appt of newBookingsRes.data ?? []) {
        if (seenApptIds.has(appt.id)) continue;
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
          id: `booking-${appt.id}`,
          title: "Nuevo turno confirmado",
          body: `${name} · ${formatDate(appt.appointment_date)} ${formatTime(appt.start_time)}${
            clinic?.name ? ` · ${clinic.name}` : ""
          }`,
          href: "/admin/agenda",
          icon: "pending",
          dismissible: true,
        });
      }

      const todayCount = todayCountRes.count ?? 0;
      if (todayCount > 0) {
        next.push({
          id: `today-${today}`,
          title:
            todayCount === 1
              ? "1 turno para hoy"
              : `${todayCount} turnos para hoy`,
          body: "Revisá la agenda del día.",
          href: "/admin/agenda",
          icon: "today",
          // Recordatorio del día: se puede ocultar al abrirlo; los pendientes siguen
          dismissible: true,
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
          dismissible: true,
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
          dismissible: true,
        });
      }

      setCached(CACHE_KEY, next, 25_000);
      publish(next, false);
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

/**
 * Oculta una notificación del ícono al abrirla.
 * Los turnos pendientes de confirmar manual no se ocultan hasta confirmar o atender.
 */
export function dismissAdminNotification(item: AdminNotificationItem) {
  if (!item.dismissible) return;

  const dismissed = readDismissed();
  if (dismissed.has(item.id)) return;
  dismissed.add(item.id);
  writeDismissed(dismissed);

  const visible = state.items.filter((i) => i.id !== item.id);
  state = { items: visible, loading: false, count: visible.length };
  emit();
}
