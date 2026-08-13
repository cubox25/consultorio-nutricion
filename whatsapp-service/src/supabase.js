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

async function getProfessionalName(supabase) {
  const fallback = {
    professionalName: config.professionalName,
    confirmationTemplate: null,
    reminder24hTemplate: null,
    reminder2hTemplate: null,
  };

  try {
    const { data, error } = await supabase
      .from("system_settings")
      .select(
        "professional_name, whatsapp_confirmation_template, whatsapp_reminder_24h_template, whatsapp_reminder_2h_template"
      )
      .limit(1)
      .maybeSingle();

    if (error) {
      // Migración 006 aún no aplicada
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
    };
  } catch {
    return fallback;
  }
}

async function fetchPendingConfirmations(supabase, limit = 20) {
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
 * Recordatorios: turnos cuyo inicio cae dentro de [target - window, target + window]
 * targetOffsetHours: 24 o 2
 */
async function fetchPendingReminders(
  supabase,
  {
    flagColumn,
    targetOffsetHours,
    windowMinutes,
    limit = 20,
  }
) {
  const now = Date.now();
  const targetMs = targetOffsetHours * 60 * 60 * 1000;
  const windowMs = windowMinutes * 60 * 1000;
  const from = new Date(now + targetMs - windowMs);
  const to = new Date(now + targetMs + windowMs);

  // Filtrar por rango de fechas calendario (incluye bordes)
  const fromDate = from.toISOString().slice(0, 10);
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
    .limit(100);

  if (error) throw error;

  return (data || [])
    .filter((row) => {
      const start = appointmentStartUtc(row);
      if (!start) return false;
      const diff = start.getTime() - now;
      return diff >= targetMs - windowMs && diff <= targetMs + windowMs;
    })
    .slice(0, limit);
}

function appointmentStartUtc(row) {
  const date = String(row.appointment_date || "").slice(0, 10);
  const time = String(row.start_time || "").slice(0, 8);
  if (!date || !time) return null;
  // Interpretar como hora local Argentina (UTC-3 estándar; sin DST)
  // Formato: YYYY-MM-DDTHH:mm:ss-03:00
  const iso = `${date}T${time.length === 5 ? `${time}:00` : time}-03:00`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function resolvePhone(row) {
  return (
    row.guest_phone?.trim() ||
    row.patient?.phone?.trim() ||
    null
  );
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
  // Si data es null, otro worker ya lo marcó (o no existía) → evitar doble conteo
  return Boolean(data);
}

async function logNotification(supabase, payload) {
  const { error } = await supabase.from("notifications").insert({
    appointment_id: payload.appointmentId,
    patient_id: payload.patientId || null,
    phone: payload.phone,
    channel: "whatsapp_web",
    notification_type: payload.type,
    status: payload.status,
    sent_at: payload.status === "enviado" ? new Date().toISOString() : null,
    payload: payload.meta || {},
    error_message: payload.error || null,
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

module.exports = {
  createSupabase,
  getProfessionalName,
  getMessageSettings: getProfessionalName,
  fetchPendingConfirmations,
  fetchPendingReminders,
  appointmentStartUtc,
  resolvePhone,
  markSent,
  logNotification,
  upsertServiceStatus,
  incrementMessagesSent,
};
