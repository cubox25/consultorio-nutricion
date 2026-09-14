const { createClient } = require("@supabase/supabase-js");
const { config } = require("./config");
const { logger } = require("./logger");

function createSupabase() {
  if (!config.supabaseUrl || !config.supabaseServiceKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

const FLAG_BY_TYPE = {
  confirmacion: { flag: "confirmation_sent", at: "confirmation_sent_at" },
  recordatorio_24h: { flag: "reminder_sent", at: "reminder_sent_at" },
  recordatorio_2h: { flag: "reminder_2h_sent", at: "reminder_2h_sent_at" },
};

async function getMessageSettings(supabase) {
  const fallback = {
    professionalName: config.professionalName,
    confirmationTemplate: null,
    reminder24hTemplate: null,
    reminder2hTemplate: null,
    confirmationEnabled: config.confirmationEnabled,
    reminder24hEnabled: config.reminder24hEnabled,
    reminder2hEnabled: config.reminder2hEnabled,
  };

  try {
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

    if (error) {
      const basic = await supabase
        .from("system_settings")
        .select("professional_name")
        .limit(1)
        .maybeSingle();
      const name = basic.data?.professional_name?.trim();
      return {
        ...fallback,
        professionalName: name || config.professionalName,
      };
    }

    const name = data?.professional_name?.trim();
    return {
      professionalName: name || config.professionalName,
      confirmationTemplate: data?.whatsapp_confirmation_template || null,
      reminder24hTemplate: data?.whatsapp_reminder_24h_template || null,
      reminder2hTemplate: data?.whatsapp_reminder_2h_template || null,
      confirmationEnabled:
        data?.whatsapp_confirmation_enabled ?? config.confirmationEnabled,
      reminder24hEnabled:
        data?.whatsapp_reminder_24h_enabled ?? config.reminder24hEnabled,
      reminder2hEnabled:
        data?.whatsapp_reminder_2h_enabled ?? config.reminder2hEnabled,
    };
  } catch {
    return fallback;
  }
}

async function fetchPendingConfirmations(supabase, limit = 40) {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("confirmation_sent", false)
    .neq("status", "cancelado")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/**
 * Recordatorios cerca del momento ideal (p. ej. 24 h antes).
 * Antes se enviaban en cuanto faltaban ≤ 24 h (hasta el inicio del turno),
 * por eso llegaban mucho antes de lo esperado.
 */
async function fetchDueReminders(
  supabase,
  { flagColumn, targetOffsetHours, limit = 40 }
) {
  const now = Date.now();
  const targetMs = targetOffsetHours * 60 * 60 * 1000;
  const windowMs = Math.max(5, config.reminderWindowMinutes || 30) * 60 * 1000;
  // Si el servicio estuvo caído, aún se puede recuperar hasta la mitad del offset
  // (24h → hasta 12h antes; 2h → hasta 1h antes).
  const catchUpFloorMs = Math.floor(targetMs / 2);

  const fromDate = formatDateInTimezone(now, config.timezone);
  const toDate = formatDateInTimezone(
    now + targetMs + 36 * 60 * 60 * 1000,
    config.timezone
  );

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

  return (data || [])
    .filter((row) => {
      const start = appointmentStartUtc(row);
      if (!start) return false;
      const startMs = start.getTime();
      const msToStart = startMs - now;
      if (msToStart <= 0) return false;

      const idealSendAt = startMs - targetMs;
      // Todavía no es hora (faltan más de N horas)
      if (now < idealSendAt) return false;

      const windowEnd = idealSendAt + windowMs;
      // Ventana puntual: ideal → ideal + window
      if (now <= windowEnd) return true;

      // Recuperación si se perdió la ventana, sin acercarse demasiado al turno
      return msToStart >= catchUpFloorMs;
    })
    .slice(0, limit);
}

/** YYYY-MM-DD en la zona del consultorio (no UTC del servidor). */
function formatDateInTimezone(ms, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(ms));
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch {
    /* fallback abajo */
  }
  return new Date(ms).toISOString().slice(0, 10);
}

function appointmentStartUtc(row) {
  const date = String(row.appointment_date || "").slice(0, 10);
  let time = String(row.start_time || "").trim();
  // Postgres / drivers a veces mandan "10:00:00+00" o ISO completo
  if (time.includes("T")) {
    time = time.split("T")[1] || time;
  }
  time = time.replace(/[Zz]|[+-]\d{2}(?::?\d{2})?$/, "").trim();
  if (/^\d{2}:\d{2}$/.test(time)) time = `${time}:00`;
  time = time.slice(0, 8);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(time)) {
    return null;
  }
  // Horarios del consultorio = America/Argentina/Buenos_Aires (UTC-3, sin DST)
  const d = new Date(`${date}T${time}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolvePhone(row) {
  return row.guest_phone?.trim() || row.patient?.phone?.trim() || null;
}

function uniqueKey(type, appointmentId) {
  return `${type}:${appointmentId}`;
}

async function enqueueMessage(supabase, {
  appointmentId,
  patientId,
  phone,
  messageType,
  body,
  scheduledFor,
}) {
  const key = uniqueKey(messageType, appointmentId);
  const { data: existing, error: findErr } = await supabase
    .from("whatsapp_outbound_messages")
    .select("id, status")
    .eq("unique_key", key)
    .maybeSingle();

  if (findErr) {
    // Migración 008 no aplicada
    if (findErr.code === "42P01" || /does not exist/i.test(findErr.message)) {
      return { skipped: true, reason: "no_table" };
    }
    throw findErr;
  }

  if (existing) {
    // No recrear si ya enviado / omitido / enviando
    if (["enviado", "omitido", "enviando"].includes(existing.status)) {
      return { skipped: true, id: existing.id, status: existing.status };
    }
    // pendiente/error: actualizar body/phone si cambió
    const { error: updErr } = await supabase
      .from("whatsapp_outbound_messages")
      .update({
        phone,
        body,
        scheduled_for: scheduledFor || null,
        patient_id: patientId || null,
      })
      .eq("id", existing.id)
      .in("status", ["pendiente", "error"]);
    if (updErr) throw updErr;
    return { skipped: false, id: existing.id, updated: true };
  }

  const { data, error } = await supabase
    .from("whatsapp_outbound_messages")
    .insert({
      appointment_id: appointmentId,
      patient_id: patientId || null,
      phone,
      message_type: messageType,
      status: "pendiente",
      unique_key: key,
      body,
      scheduled_for: scheduledFor || null,
      attempts: 0,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // Carrera: unique_key
    if (error.code === "23505") return { skipped: true, reason: "duplicate" };
    throw error;
  }
  return { skipped: false, id: data?.id };
}

async function fetchQueueBatch(supabase, limit = 8) {
  const nowIso = new Date().toISOString();
  const selectCols = `
      id,
      appointment_id,
      patient_id,
      phone,
      message_type,
      status,
      unique_key,
      body,
      attempts,
      scheduled_for
    `;
  const dueOr = `scheduled_for.is.null,scheduled_for.lte.${nowIso}`;

  // Primero pendientes nuevos: si mezclamos con errores viejos (attempts>=3)
  // el LIMIT los tapa y la cola nunca avanza.
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
      return [];
    }
    throw pendingErr;
  }

  const pendingRows = pending || [];
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

  if (errorErr) {
    if (
      errorErr.code === "42P01" ||
      /does not exist/i.test(errorErr.message)
    ) {
      return pendingRows;
    }
    throw errorErr;
  }

  return [...pendingRows, ...(errors || [])];
}

async function claimQueueItem(supabase, id) {
  const { data: current, error: readErr } = await supabase
    .from("whatsapp_outbound_messages")
    .select("id, attempts, status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!current || !["pendiente", "error"].includes(current.status)) {
    return null;
  }

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

async function markQueueSent(supabase, id) {
  const { error } = await supabase
    .from("whatsapp_outbound_messages")
    .update({
      status: "enviado",
      sent_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("id", id);
  if (error) throw error;
}

async function markQueueError(supabase, id, message) {
  const { friendlyWhatsAppError } = require("./friendly-error");
  const { error } = await supabase
    .from("whatsapp_outbound_messages")
    .update({
      status: "error",
      error_message: friendlyWhatsAppError(message).slice(0, 1000),
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

async function markQueueOmitted(supabase, id, message) {
  const { error } = await supabase
    .from("whatsapp_outbound_messages")
    .update({
      status: "omitido",
      error_message: String(message || "").slice(0, 1000),
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

async function getAppointmentById(supabase, id) {
  const { data, error } = await supabase
    .from("appointments")
    .select(APPOINTMENT_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function markSent(supabase, id, flagColumn, atColumn) {
  const { data, error } = await supabase
    .from("appointments")
    .update({
      [flagColumn]: true,
      [atColumn]: new Date().toISOString(),
    })
    .eq("id", id)
    .eq(flagColumn, false)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function logNotification(supabase, payload) {
  const { error } = await supabase.from("notifications").insert({
    appointment_id: payload.appointmentId,
    patient_id: payload.patientId || null,
    phone: payload.phone,
    channel: "whatsapp_web",
    notification_type: payload.type,
    status:
      payload.status === "error"
        ? "fallido"
        : payload.status === "enviando"
          ? "enviando"
          : payload.status,
    sent_at: payload.status === "enviado" ? new Date().toISOString() : null,
    payload: payload.meta || {},
    error_message: payload.error || null,
    message_body: payload.body || null,
    attempts: payload.attempts || 0,
    last_attempt_at: payload.lastAttemptAt || null,
  });
  if (error) {
    logger.warn(`No se pudo registrar en notifications: ${error.message}`);
  }
}

async function upsertServiceStatus(supabase, patch) {
  const next = {
    id: 1,
    updated_at: new Date().toISOString(),
    ...patch,
  };
  if (patch.details) {
    const { data } = await supabase
      .from("whatsapp_service_status")
      .select("details")
      .eq("id", 1)
      .maybeSingle();
    const prev =
      data?.details && typeof data.details === "object" ? data.details : {};
    next.details = { ...prev, ...patch.details };
  }
  const { error } = await supabase
    .from("whatsapp_service_status")
    .upsert(next, { onConflict: "id" });
  if (error) {
    logger.warn(`No se pudo actualizar whatsapp_service_status: ${error.message}`);
  }
}

async function takeRemoteCommand(supabase) {
  const { data, error } = await supabase
    .from("whatsapp_service_status")
    .select("details")
    .eq("id", 1)
    .maybeSingle();
  if (error) return null;
  const command = data?.details?.command;
  if (!command) return null;
  await upsertServiceStatus(supabase, {
    details: { command: null, commandAt: null },
  });
  return String(command);
}

async function queueRemoteCommand(supabase, command) {
  await upsertServiceStatus(supabase, {
    details: {
      command,
      commandAt: new Date().toISOString(),
    },
  });
}

async function incrementMessagesSent(supabase) {
  const { data } = await supabase
    .from("whatsapp_service_status")
    .select("messages_sent_count")
    .eq("id", 1)
    .maybeSingle();
  const next = (data?.messages_sent_count || 0) + 1;
  await upsertServiceStatus(supabase, {
    messages_sent_count: next,
    last_message_at: new Date().toISOString(),
  });
  return next;
}

async function countOutboundByStatus(supabase) {
  const statuses = ["pendiente", "enviando", "enviado", "error"];
  const result = { pendiente: 0, enviando: 0, enviado: 0, error: 0 };
  for (const status of statuses) {
    const { count, error } = await supabase
      .from("whatsapp_outbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (!error) result[status] = count || 0;
  }
  return result;
}

module.exports = {
  createSupabase,
  getProfessionalName: getMessageSettings,
  getMessageSettings,
  fetchPendingConfirmations,
  fetchDueReminders,
  fetchPendingReminders: fetchDueReminders,
  appointmentStartUtc,
  resolvePhone,
  uniqueKey,
  FLAG_BY_TYPE,
  enqueueMessage,
  fetchQueueBatch,
  claimQueueItem,
  markQueueSent,
  markQueueError,
  markQueueOmitted,
  getAppointmentById,
  markSent,
  logNotification,
  upsertServiceStatus,
  incrementMessagesSent,
  countOutboundByStatus,
  takeRemoteCommand,
  queueRemoteCommand,
};
