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
 * Recordatorios: desde que llegó la hora objetivo hasta el inicio del turno
 * (así no se pierden si WhatsApp estaba desconectado en la ventana corta).
 */
async function fetchDueReminders(
  supabase,
  { flagColumn, targetOffsetHours, limit = 40 }
) {
  const now = Date.now();
  const targetMs = targetOffsetHours * 60 * 60 * 1000;
  // Desde hoy hasta targetOffsetHours + 1 día de margen en fechas
  const fromDate = new Date(now).toISOString().slice(0, 10);
  const to = new Date(now + targetMs + 24 * 60 * 60 * 1000);
  const toDate = to.toISOString().slice(0, 10);

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
      const msToStart = start.getTime() - now;
      // Ya es hora de enviar (faltan <= offset) y el turno aún no empezó
      return msToStart > 0 && msToStart <= targetMs;
    })
    .slice(0, limit);
}

function appointmentStartUtc(row) {
  const date = String(row.appointment_date || "").slice(0, 10);
  const time = String(row.start_time || "").slice(0, 8);
  if (!date || !time) return null;
  const iso = `${date}T${time.length === 5 ? `${time}:00` : time}-03:00`;
  const d = new Date(iso);
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
  const { data, error } = await supabase
    .from("whatsapp_outbound_messages")
    .select(
      `
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
    `
    )
    .in("status", ["pendiente", "error"])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (error.code === "42P01" || /does not exist/i.test(error.message)) {
      return [];
    }
    throw error;
  }
  return data || [];
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
  const { error } = await supabase
    .from("whatsapp_outbound_messages")
    .update({
      status: "error",
      error_message: String(message || "Error").slice(0, 1000),
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
  const { error } = await supabase.from("whatsapp_service_status").upsert(
    {
      id: 1,
      updated_at: new Date().toISOString(),
      ...patch,
    },
    { onConflict: "id" }
  );
  if (error) {
    logger.warn(`No se pudo actualizar whatsapp_service_status: ${error.message}`);
  }
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
};
