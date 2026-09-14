import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_WA_CONFIRMATION,
  DEFAULT_WA_REMINDER_24H,
  DEFAULT_WA_REMINDER_2H,
} from "@/lib/whatsapp-templates";
import {
  getWhatsAppCloudConfig,
  sendWhatsAppTemplate,
  type CloudMessageType,
  type TemplateVars,
} from "@/lib/whatsapp-cloud";
import { normalizeArgentinaWhatsApp } from "@/lib/whatsapp-phone";
import { tryCreateServiceClient } from "@/lib/supabase/admin";

const TIMEZONE = "America/Argentina/Buenos_Aires";
const REMINDER_WINDOW_MINUTES = 30;

const APPOINTMENT_SELECT = `
  id,
  clinic_id,
  patient_id,
  appointment_date,
  start_time,
  end_time,
  status,
  guest_first_name,
  guest_last_name,
  guest_phone,
  confirmation_sent,
  confirmation_sent_at,
  reminder_sent,
  reminder_sent_at,
  reminder_2h_sent,
  reminder_2h_sent_at,
  created_at,
  patient:patients ( id, first_name, last_name, phone ),
  clinic:clinics ( id, name, address, phone )
`;

const FLAG_BY_TYPE: Record<
  CloudMessageType,
  { flag: string; at: string }
> = {
  confirmacion: { flag: "confirmation_sent", at: "confirmation_sent_at" },
  recordatorio_24h: { flag: "reminder_sent", at: "reminder_sent_at" },
  recordatorio_2h: { flag: "reminder_2h_sent", at: "reminder_2h_sent_at" },
};

type AppointmentRow = {
  id: string;
  patient_id: string | null;
  appointment_date: string;
  start_time: string;
  status: string;
  guest_first_name?: string | null;
  guest_phone?: string | null;
  confirmation_sent?: boolean;
  reminder_sent?: boolean;
  reminder_2h_sent?: boolean;
  created_at?: string;
  patient?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
  } | null;
  clinic?: {
    id: string;
    name?: string | null;
    address?: string | null;
    phone?: string | null;
  } | null;
};

type MessageSettings = {
  professionalName: string;
  confirmationEnabled: boolean;
  reminder24hEnabled: boolean;
  reminder2hEnabled: boolean;
  confirmationTemplate: string | null;
  reminder24hTemplate: string | null;
  reminder2hTemplate: string | null;
};

type OutboundRow = {
  id: string;
  appointment_id: string;
  patient_id: string | null;
  phone: string | null;
  message_type: CloudMessageType;
  status: string;
  body: string | null;
  attempts: number | null;
  scheduled_for: string | null;
};

function formatDateInTimezone(ms: number): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fallback */
  }
  return new Date(ms).toISOString().slice(0, 10);
}

function appointmentStartUtc(row: AppointmentRow): Date | null {
  const date = String(row.appointment_date || "").slice(0, 10);
  let time = String(row.start_time || "").trim();
  if (time.includes("T")) time = time.split("T")[1] || time;
  time = time.replace(/[Zz]|[+-]\d{2}(?::?\d{2})?$/, "").trim();
  if (/^\d{2}:\d{2}$/.test(time)) time = `${time}:00`;
  time = time.slice(0, 8);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  const d = new Date(`${date}T${time}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDateAR(isoDate: string): string {
  const [y, m, d] = String(isoDate).slice(0, 10).split("-");
  if (!y || !m || !d) return String(isoDate);
  return `${d}/${m}/${y}`;
}

function formatTime(time: string): string {
  return String(time || "").slice(0, 5) || "—";
}

function patientFirstName(row: AppointmentRow): string {
  return (
    row.patient?.first_name?.trim() ||
    row.guest_first_name?.trim() ||
    "hola"
  );
}

function clinicLabel(row: AppointmentRow): string {
  const name = row.clinic?.name?.trim();
  const address = row.clinic?.address?.trim();
  if (name && address) return `${name} — ${address}`;
  return address || name || "Consultorio";
}

function resolvePhone(row: AppointmentRow): string | null {
  return row.guest_phone?.trim() || row.patient?.phone?.trim() || null;
}

function varsFromRow(row: AppointmentRow, professionalName: string): TemplateVars {
  return {
    nombre: patientFirstName(row),
    profesional: professionalName || "Pamela, Lic. en Nutrición",
    fecha: formatDateAR(row.appointment_date),
    hora: formatTime(row.start_time),
    consultorio: clinicLabel(row),
  };
}

function applyTemplate(template: string, vars: TemplateVars): string {
  let text = template;
  for (const [key, value] of Object.entries(vars)) {
    text = text.split(`{${key}}`).join(String(value ?? ""));
  }
  return text.trim();
}

function buildBody(
  row: AppointmentRow,
  type: CloudMessageType,
  settings: MessageSettings
): string {
  const vars = varsFromRow(row, settings.professionalName);
  if (type === "confirmacion") {
    return applyTemplate(
      settings.confirmationTemplate?.trim() || DEFAULT_WA_CONFIRMATION,
      vars
    );
  }
  if (type === "recordatorio_24h") {
    return applyTemplate(
      settings.reminder24hTemplate?.trim() || DEFAULT_WA_REMINDER_24H,
      vars
    );
  }
  return applyTemplate(
    settings.reminder2hTemplate?.trim() || DEFAULT_WA_REMINDER_2H,
    vars
  );
}

async function getMessageSettings(
  supabase: SupabaseClient
): Promise<MessageSettings> {
  const fallback: MessageSettings = {
    professionalName:
      process.env.WHATSAPP_PROFESSIONAL_NAME || "Pamela, Lic. en Nutrición",
    confirmationEnabled: true,
    reminder24hEnabled: true,
    reminder2hEnabled: false,
    confirmationTemplate: null,
    reminder24hTemplate: null,
    reminder2hTemplate: null,
  };

  const { data, error } = await supabase
    .from("system_settings")
    .select(
      `
      professional_name,
      whatsapp_confirmation_template,
      whatsapp_reminder_24h_template,
      whatsapp_reminder_2h_template,
      whatsapp_confirmation_enabled,
      whatsapp_reminder_24h_enabled,
      whatsapp_reminder_2h_enabled
    `
    )
    .limit(1)
    .maybeSingle();

  if (error || !data) return fallback;

  return {
    professionalName:
      data.professional_name?.trim() || fallback.professionalName,
    confirmationEnabled: data.whatsapp_confirmation_enabled ?? true,
    reminder24hEnabled: data.whatsapp_reminder_24h_enabled ?? true,
    reminder2hEnabled: data.whatsapp_reminder_2h_enabled ?? false,
    confirmationTemplate: data.whatsapp_confirmation_template || null,
    reminder24hTemplate: data.whatsapp_reminder_24h_template || null,
    reminder2hTemplate: data.whatsapp_reminder_2h_template || null,
  };
}

async function fetchPendingConfirmations(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("confirmation_sent", false)
    .neq("status", "cancelado")
    .order("created_at", { ascending: true })
    .limit(40);
  if (error) throw error;
  return (data || []) as unknown as AppointmentRow[];
}

async function fetchDueReminders(
  supabase: SupabaseClient,
  flagColumn: "reminder_sent" | "reminder_2h_sent",
  targetOffsetHours: number
) {
  const now = Date.now();
  const targetMs = targetOffsetHours * 60 * 60 * 1000;
  const windowMs = REMINDER_WINDOW_MINUTES * 60 * 1000;
  const catchUpFloorMs = Math.floor(targetMs / 2);
  const fromDate = formatDateInTimezone(now);
  const toDate = formatDateInTimezone(now + targetMs + 36 * 60 * 60 * 1000);

  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq(flagColumn, false)
    .neq("status", "cancelado")
    .gte("appointment_date", fromDate)
    .lte("appointment_date", toDate)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(120);

  if (error) throw error;

  return ((data || []) as unknown as AppointmentRow[])
    .filter((row) => {
      const start = appointmentStartUtc(row);
      if (!start) return false;
      const startMs = start.getTime();
      const msToStart = startMs - now;
      if (msToStart <= 0) return false;
      const idealSendAt = startMs - targetMs;
      if (now < idealSendAt) return false;
      if (now <= idealSendAt + windowMs) return true;
      return msToStart >= catchUpFloorMs;
    })
    .slice(0, 40);
}

async function enqueueMessage(
  supabase: SupabaseClient,
  payload: {
    appointmentId: string;
    patientId: string | null;
    phone: string | null;
    messageType: CloudMessageType;
    body: string;
    scheduledFor: string | null;
  }
) {
  const key = `${payload.messageType}:${payload.appointmentId}`;
  const { data: existing, error: findErr } = await supabase
    .from("whatsapp_outbound_messages")
    .select("id, status")
    .eq("unique_key", key)
    .maybeSingle();

  if (findErr) {
    if (findErr.code === "42P01" || /does not exist/i.test(findErr.message)) {
      return { skipped: true as const, reason: "no_table" as const };
    }
    throw findErr;
  }

  if (existing) {
    if (["enviado", "omitido", "enviando"].includes(existing.status)) {
      return { skipped: true as const, id: existing.id, status: existing.status };
    }
    await supabase
      .from("whatsapp_outbound_messages")
      .update({
        phone: payload.phone,
        body: payload.body,
        scheduled_for: payload.scheduledFor,
        patient_id: payload.patientId,
      })
      .eq("id", existing.id)
      .in("status", ["pendiente", "error"]);
    return { skipped: false as const, id: existing.id, updated: true };
  }

  const { data, error } = await supabase
    .from("whatsapp_outbound_messages")
    .insert({
      appointment_id: payload.appointmentId,
      patient_id: payload.patientId,
      phone: payload.phone,
      message_type: payload.messageType,
      status: "pendiente",
      unique_key: key,
      body: payload.body,
      scheduled_for: payload.scheduledFor,
      attempts: 0,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { skipped: true as const, reason: "duplicate" as const };
    throw error;
  }
  return { skipped: false as const, id: data?.id };
}

async function enqueueFromAppointments(
  supabase: SupabaseClient,
  settings: MessageSettings,
  onlyConfirmations = false
) {
  let queueAvailable = true;

  const push = async (payload: Parameters<typeof enqueueMessage>[1]) => {
    const result = await enqueueMessage(supabase, payload);
    if (result && "reason" in result && result.reason === "no_table") {
      queueAvailable = false;
    }
    return result;
  };

  if (settings.confirmationEnabled) {
    for (const row of await fetchPendingConfirmations(supabase)) {
      await push({
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: resolvePhone(row),
        messageType: "confirmacion",
        body: buildBody(row, "confirmacion", settings),
        scheduledFor: row.created_at || null,
      });
      if (!queueAvailable) return false;
    }
  }

  if (onlyConfirmations) return queueAvailable;

  if (settings.reminder24hEnabled) {
    for (const row of await fetchDueReminders(supabase, "reminder_sent", 24)) {
      const start = appointmentStartUtc(row);
      await push({
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: resolvePhone(row),
        messageType: "recordatorio_24h",
        body: buildBody(row, "recordatorio_24h", settings),
        scheduledFor: start
          ? new Date(start.getTime() - 24 * 60 * 60 * 1000).toISOString()
          : null,
      });
      if (!queueAvailable) return false;
    }
  }

  if (settings.reminder2hEnabled) {
    for (const row of await fetchDueReminders(
      supabase,
      "reminder_2h_sent",
      2
    )) {
      const start = appointmentStartUtc(row);
      await push({
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: resolvePhone(row),
        messageType: "recordatorio_2h",
        body: buildBody(row, "recordatorio_2h", settings),
        scheduledFor: start
          ? new Date(start.getTime() - 2 * 60 * 60 * 1000).toISOString()
          : null,
      });
      if (!queueAvailable) return false;
    }
  }

  return queueAvailable;
}

async function fetchQueueBatch(supabase: SupabaseClient, limit = 8) {
  const nowIso = new Date().toISOString();
  const dueOr = `scheduled_for.is.null,scheduled_for.lte.${nowIso}`;
  const selectCols =
    "id, appointment_id, patient_id, phone, message_type, status, body, attempts, scheduled_for";

  const { data: pending, error: pendingErr } = await supabase
    .from("whatsapp_outbound_messages")
    .select(selectCols)
    .eq("status", "pendiente")
    .or(dueOr)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (pendingErr) {
    if (
      pendingErr.code === "42P01" ||
      /does not exist/i.test(pendingErr.message)
    ) {
      return [] as OutboundRow[];
    }
    throw pendingErr;
  }

  const pendingRows = (pending || []) as OutboundRow[];
  const remaining = Math.max(0, limit - pendingRows.length);
  if (remaining === 0) return pendingRows;

  const { data: errors, error: errorErr } = await supabase
    .from("whatsapp_outbound_messages")
    .select(selectCols)
    .eq("status", "error")
    .lt("attempts", 3)
    .or(dueOr)
    .order("created_at", { ascending: true })
    .limit(remaining);

  if (errorErr) throw errorErr;
  return [...pendingRows, ...((errors || []) as OutboundRow[])];
}

async function claimQueueItem(supabase: SupabaseClient, id: string) {
  const { data: current, error: readErr } = await supabase
    .from("whatsapp_outbound_messages")
    .select("id, attempts, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current || !["pendiente", "error"].includes(current.status)) return null;

  const nextAttempts = (current.attempts || 0) + 1;
  const { data, error } = await supabase
    .from("whatsapp_outbound_messages")
    .update({
      status: "enviando",
      last_attempt_at: new Date().toISOString(),
      attempts: nextAttempts,
    })
    .eq("id", id)
    .eq("status", current.status)
    .select("id, attempts")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getAppointmentById(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as AppointmentRow | null;
}

async function markAppointmentSent(
  supabase: SupabaseClient,
  id: string,
  flagColumn: string,
  atColumn: string
) {
  const { error } = await supabase
    .from("appointments")
    .update({
      [flagColumn]: true,
      [atColumn]: new Date().toISOString(),
    })
    .eq("id", id)
    .eq(flagColumn, false);
  if (error) throw error;
}

async function upsertServiceStatus(
  supabase: SupabaseClient,
  patch: Record<string, unknown>
) {
  await supabase.from("whatsapp_service_status").upsert(
    {
      id: 1,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
}

async function processQueueItem(
  supabase: SupabaseClient,
  item: OutboundRow,
  settings: MessageSettings
) {
  const type = item.message_type as CloudMessageType;
  const flags = FLAG_BY_TYPE[type];
  if (!flags) {
    await supabase
      .from("whatsapp_outbound_messages")
      .update({
        status: "omitido",
        error_message: "Tipo de mensaje desconocido",
      })
      .eq("id", item.id);
    return { result: "omitido" as const };
  }

  if (item.scheduled_for) {
    const when = new Date(item.scheduled_for).getTime();
    if (Number.isFinite(when) && when > Date.now() + 15_000) {
      return { result: "wait" as const };
    }
  }

  const claimed = await claimQueueItem(supabase, item.id);
  if (!claimed) return { result: "skip" as const };

  const row = await getAppointmentById(supabase, item.appointment_id);
  if (!row || row.status === "cancelado") {
    await supabase
      .from("whatsapp_outbound_messages")
      .update({
        status: "omitido",
        error_message: "Turno cancelado o inexistente",
      })
      .eq("id", item.id);
    return { result: "omitido" as const };
  }

  const already =
    type === "confirmacion"
      ? row.confirmation_sent === true
      : type === "recordatorio_24h"
        ? row.reminder_sent === true
        : row.reminder_2h_sent === true;
  if (already) {
    await supabase
      .from("whatsapp_outbound_messages")
      .update({
        status: "enviado",
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", item.id);
    return { result: "already" as const };
  }

  const phoneRaw = item.phone || resolvePhone(row);
  if (!phoneRaw) {
    await markAppointmentSent(supabase, row.id, flags.flag, flags.at);
    await supabase
      .from("whatsapp_outbound_messages")
      .update({
        status: "omitido",
        error_message: "Sin número de teléfono",
      })
      .eq("id", item.id);
    return { result: "omitido" as const };
  }

  const digits = normalizeArgentinaWhatsApp(phoneRaw);
  if (!digits) {
    await markAppointmentSent(supabase, row.id, flags.flag, flags.at);
    await supabase
      .from("whatsapp_outbound_messages")
      .update({
        status: "omitido",
        error_message: "Teléfono no normalizable",
      })
      .eq("id", item.id);
    return { result: "omitido" as const };
  }

  const vars = varsFromRow(row, settings.professionalName);
  const send = await sendWhatsAppTemplate({
    toE164Digits: digits,
    messageType: type,
    vars,
  });

  if (!send.ok) {
    await supabase
      .from("whatsapp_outbound_messages")
      .update({
        status: "error",
        error_message: send.error.slice(0, 1000),
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    await upsertServiceStatus(supabase, {
      state: "READY",
      qr_required: false,
      last_error: send.error.slice(0, 500),
      details: { provider: "cloud_api" },
    });
    return { result: "error" as const, error: send.error };
  }

  await markAppointmentSent(supabase, row.id, flags.flag, flags.at);
  await supabase
    .from("whatsapp_outbound_messages")
    .update({
      status: "enviado",
      sent_at: new Date().toISOString(),
      error_message: null,
      body: item.body || buildBody(row, type, settings),
    })
    .eq("id", item.id);

  const { data: st } = await supabase
    .from("whatsapp_service_status")
    .select("messages_sent_count")
    .eq("id", 1)
    .maybeSingle();
  const nextCount = (st?.messages_sent_count || 0) + 1;

  await upsertServiceStatus(supabase, {
    state: "READY",
    qr_required: false,
    last_connected_at: new Date().toISOString(),
    last_message_at: new Date().toISOString(),
    last_error: null,
    messages_sent_count: nextCount,
    details: {
      provider: "cloud_api",
      lastMetaMessageId: send.messageId,
    },
  });

  return { result: "enviado" as const };
}

export type ProcessCloudOptions = {
  onlyConfirmations?: boolean;
  appointmentId?: string;
};

export async function processWhatsAppCloudQueue(
  options: ProcessCloudOptions = {}
) {
  const cfg = getWhatsAppCloudConfig();
  if (!cfg.enabled) {
    return {
      ok: false as const,
      error:
        "Cloud API no habilitada. Configurá WHATSAPP_CLOUD_ENABLED, WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID.",
      sent: 0,
      errors: 0,
      pending: 0,
    };
  }

  const service = tryCreateServiceClient();
  if (!service) {
    return {
      ok: false as const,
      error:
        "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor (Vercel → Environment Variables).",
      sent: 0,
      errors: 0,
      pending: 0,
    };
  }
  const supabase = service;
  const settings = await getMessageSettings(supabase);

  await upsertServiceStatus(supabase, {
    state: "READY",
    qr_required: false,
    last_connected_at: new Date().toISOString(),
    last_error: null,
    details: { provider: "cloud_api" },
  });

  if (options.appointmentId) {
    const row = await getAppointmentById(supabase, options.appointmentId);
    if (row && settings.confirmationEnabled && !row.confirmation_sent) {
      await enqueueMessage(supabase, {
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: resolvePhone(row),
        messageType: "confirmacion",
        body: buildBody(row, "confirmacion", settings),
        scheduledFor: row.created_at || null,
      });
    }
  } else {
    await enqueueFromAppointments(
      supabase,
      settings,
      options.onlyConfirmations === true
    );
  }

  let sent = 0;
  let errors = 0;
  const batch = await fetchQueueBatch(supabase, 10);
  for (const item of batch) {
    if (options.appointmentId && item.appointment_id !== options.appointmentId) {
      continue;
    }
    if (options.onlyConfirmations && item.message_type !== "confirmacion") {
      continue;
    }
    const out = await processQueueItem(supabase, item, settings);
    if (out.result === "enviado") sent += 1;
    if (out.result === "error") errors += 1;
    await new Promise((r) => setTimeout(r, 300));
  }

  const { count: pending } = await supabase
    .from("whatsapp_outbound_messages")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendiente");

  return {
    ok: true as const,
    sent,
    errors,
    pending: pending ?? 0,
    provider: "cloud_api" as const,
  };
}
