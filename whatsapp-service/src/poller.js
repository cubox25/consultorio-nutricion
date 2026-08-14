const { config } = require("./config");
const { logger } = require("./logger");
const { toWhatsAppId } = require("./phone");
const {
  buildConfirmationMessage,
  buildReminderMessage,
} = require("./messages");
const {
  getMessageSettings,
  fetchPendingConfirmations,
  fetchDueReminders,
  resolvePhone,
  enqueueMessage,
  fetchQueueBatch,
  claimQueueItem,
  markQueueSent,
  markQueueError,
  markQueueOmitted,
  getAppointmentById,
  markSent,
  logNotification,
  incrementMessagesSent,
  FLAG_BY_TYPE,
  appointmentStartUtc,
  countOutboundByStatus,
} = require("./supabase");
const { patchStatus } = require("./status-store");

/**
 * @param {{
 *   supabase: import('@supabase/supabase-js').SupabaseClient,
 *   wa: { isReady: () => boolean, sendText: (id: string, text: string) => Promise<unknown> }
 * }} deps
 */
function createPoller({ supabase, wa }) {
  let running = false;
  let timer = null;

  function buildBody(row, type, settings) {
    if (type === "confirmacion") {
      return buildConfirmationMessage(
        row,
        settings.professionalName,
        settings.confirmationTemplate
      );
    }
    if (type === "recordatorio_24h") {
      return buildReminderMessage(
        row,
        settings.professionalName,
        settings.reminder24hTemplate,
        "24h"
      );
    }
    return buildReminderMessage(
      row,
      settings.professionalName,
      settings.reminder2hTemplate,
      "2h"
    );
  }

  async function enqueueFromAppointments(settings) {
    let queueAvailable = true;

    async function push(payload) {
      const result = await enqueueMessage(supabase, payload);
      if (result?.reason === "no_table") queueAvailable = false;
      return result;
    }

    if (settings.confirmationEnabled) {
      for (const row of await fetchPendingConfirmations(supabase)) {
        await push({
          appointmentId: row.id,
          patientId: row.patient_id,
          phone: resolvePhone(row),
          messageType: "confirmacion",
          body: buildBody(row, "confirmacion", settings),
          scheduledFor: row.created_at,
        });
        if (!queueAvailable) return false;
      }
    }

    if (settings.reminder24hEnabled) {
      for (const row of await fetchDueReminders(supabase, {
        flagColumn: "reminder_sent",
        targetOffsetHours: 24,
      })) {
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
      for (const row of await fetchDueReminders(supabase, {
        flagColumn: "reminder_2h_sent",
        targetOffsetHours: 2,
      })) {
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

  async function processQueueItem(item) {
    const shortId = String(item.appointment_id).slice(0, 8);
    const type = item.message_type;
    const flags = FLAG_BY_TYPE[type];
    if (!flags) {
      await markQueueOmitted(supabase, item.id, "Tipo de mensaje desconocido");
      return;
    }

    const claimed = await claimQueueItem(supabase, item.id);
    if (!claimed) {
      logger.info(`Cola #${item.id.slice(0, 8)}: ya tomada por otro ciclo`);
      return;
    }

    const row = await getAppointmentById(supabase, item.appointment_id);
    if (!row || row.status === "cancelado") {
      await markQueueOmitted(supabase, item.id, "Turno cancelado o inexistente");
      return;
    }

    if (row[flags.flag] === true) {
      await markQueueSent(supabase, item.id);
      logger.info(`Turno #${shortId}: flag ${flags.flag} ya true — sin reenvío`);
      return;
    }

    const phoneRaw = item.phone || resolvePhone(row);
    if (!phoneRaw) {
      logger.warn(`Turno #${shortId}: sin teléfono — omitido (${type})`);
      await markQueueOmitted(supabase, item.id, "Sin número de teléfono");
      await markSent(supabase, row.id, flags.flag, flags.at);
      await logNotification(supabase, {
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: null,
        type,
        status: "omitido",
        error: "Sin número de teléfono",
        body: item.body,
        attempts: claimed.attempts,
      });
      return;
    }

    const chatId = toWhatsAppId(phoneRaw);
    if (!chatId) {
      logger.warn(`Turno #${shortId}: teléfono inválido "${phoneRaw}"`);
      await markQueueOmitted(supabase, item.id, "Teléfono no normalizable");
      await markSent(supabase, row.id, flags.flag, flags.at);
      await logNotification(supabase, {
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: phoneRaw,
        type,
        status: "omitido",
        error: "Teléfono no normalizable",
        body: item.body,
        attempts: claimed.attempts,
      });
      return;
    }

    const text = item.body || "";
    logger.info(`Enviando ${type} turno #${shortId} → ${chatId}`);

    try {
      await wa.sendText(chatId, text);
    } catch (err) {
      const message = err?.message || String(err);
      logger.error(`Error enviando (${type}) #${shortId}`, message);
      patchStatus({ lastError: message });
      await markQueueError(supabase, item.id, message);
      await logNotification(supabase, {
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: phoneRaw,
        type,
        status: "error",
        error: message,
        body: text,
        attempts: claimed.attempts,
        lastAttemptAt: new Date().toISOString(),
      });
      return;
    }

    const marked = await markSent(supabase, row.id, flags.flag, flags.at);
    await markQueueSent(supabase, item.id);

    if (!marked) {
      logger.warn(`Turno #${shortId}: enviado pero flag ya estaba true`);
    } else {
      logger.info(`Mensaje enviado OK (${type}) #${shortId}`);
    }

    await logNotification(supabase, {
      appointmentId: row.id,
      patientId: row.patient_id,
      phone: phoneRaw,
      type,
      status: "enviado",
      body: text,
      attempts: claimed.attempts,
      meta: { chatId, queueId: item.id },
    });

    const count = await incrementMessagesSent(supabase);
    patchStatus({
      lastMessageAt: new Date().toISOString(),
      messagesSentCount: count,
      lastError: null,
    });
  }

  async function legacyDirectSend(settings) {
    async function one(row, type, flagColumn, atColumn) {
      const phoneRaw = resolvePhone(row);
      if (!phoneRaw) {
        await markSent(supabase, row.id, flagColumn, atColumn);
        return;
      }
      const chatId = toWhatsAppId(phoneRaw);
      if (!chatId) {
        await markSent(supabase, row.id, flagColumn, atColumn);
        return;
      }
      const { data: fresh } = await supabase
        .from("appointments")
        .select(`id, ${flagColumn}`)
        .eq("id", row.id)
        .maybeSingle();
      if (!fresh || fresh[flagColumn] === true) return;

      const text = buildBody(row, type, settings);
      try {
        await wa.sendText(chatId, text);
      } catch (err) {
        await logNotification(supabase, {
          appointmentId: row.id,
          patientId: row.patient_id,
          phone: phoneRaw,
          type,
          status: "error",
          error: err?.message || String(err),
        });
        return;
      }
      await markSent(supabase, row.id, flagColumn, atColumn);
      await logNotification(supabase, {
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: phoneRaw,
        type,
        status: "enviado",
        body: text,
        meta: { chatId },
      });
      const count = await incrementMessagesSent(supabase);
      patchStatus({
        lastMessageAt: new Date().toISOString(),
        messagesSentCount: count,
        lastError: null,
      });
    }

    if (settings.confirmationEnabled) {
      for (const row of await fetchPendingConfirmations(supabase)) {
        await one(row, "confirmacion", "confirmation_sent", "confirmation_sent_at");
      }
    }
    if (settings.reminder24hEnabled) {
      for (const row of await fetchDueReminders(supabase, {
        flagColumn: "reminder_sent",
        targetOffsetHours: 24,
      })) {
        await one(row, "recordatorio_24h", "reminder_sent", "reminder_sent_at");
      }
    }
    if (settings.reminder2hEnabled) {
      for (const row of await fetchDueReminders(supabase, {
        flagColumn: "reminder_2h_sent",
        targetOffsetHours: 2,
      })) {
        await one(
          row,
          "recordatorio_2h",
          "reminder_2h_sent",
          "reminder_2h_sent_at"
        );
      }
    }
  }

  async function tick() {
    if (running) return;
    running = true;
    try {
      const settings = await getMessageSettings(supabase);
      logger.info(
        `Ciclo cola (confirm=${settings.confirmationEnabled}, 24h=${settings.reminder24hEnabled}, 2h=${settings.reminder2hEnabled}, ready=${wa.isReady()})`
      );

      const queueAvailable = await enqueueFromAppointments(settings);

      if (!queueAvailable) {
        logger.warn(
          "Sin tabla whatsapp_outbound_messages — modo legacy. Ejecutá migración 008."
        );
        if (wa.isReady()) await legacyDirectSend(settings);
        return;
      }

      const counts = await countOutboundByStatus(supabase);
      if (counts.pendiente || counts.error) {
        logger.info(
          `Cola: ${counts.pendiente} pendientes, ${counts.error} error, ${counts.enviando} enviando`
        );
        patchStatus({ details: { outbound: counts } });
      }

      if (!wa.isReady()) {
        logger.info("WhatsApp no listo — mensajes quedan pendientes");
        return;
      }

      const batch = await fetchQueueBatch(supabase, 8);
      for (const item of batch) {
        if (item.status === "error" && (item.attempts || 0) >= 3) continue;
        await processQueueItem(item);
        await new Promise((r) => setTimeout(r, 800));
      }
    } catch (err) {
      logger.error("Error en ciclo de polling", err?.message || err);
      patchStatus({ lastError: err?.message || String(err) });
    } finally {
      running = false;
    }
  }

  return {
    start() {
      logger.info(
        `Poller cada ${Math.round(config.pollIntervalMs / 1000)}s (cola + anti-duplicados)`
      );
      void tick();
      timer = setInterval(() => void tick(), config.pollIntervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    tick,
  };
}

module.exports = { createPoller };
