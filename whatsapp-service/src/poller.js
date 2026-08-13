const { config } = require("./config");
const { logger } = require("./logger");
const { toWhatsAppId } = require("./phone");
const {
  buildConfirmationMessage,
  buildReminderMessage,
} = require("./messages");
const {
  getProfessionalName,
  fetchPendingConfirmations,
  fetchPendingReminders,
  resolvePhone,
  markSent,
  logNotification,
  incrementMessagesSent,
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

  async function processOne({
    row,
    type,
    flagColumn,
    atColumn,
    buildMessage,
  }) {
    const shortId = String(row.id).slice(0, 8);
    const phoneRaw = resolvePhone(row);

    if (!phoneRaw) {
      logger.warn(
        `Turno #${shortId}: sin teléfono — no se envía (${type})`
      );
      await logNotification(supabase, {
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: null,
        type,
        status: "omitido",
        error: "Sin número de teléfono",
      });
      // Marcar para no reintentar indefinidamente
      await markSent(supabase, row.id, flagColumn, atColumn);
      return;
    }

    const chatId = toWhatsAppId(phoneRaw);
    if (!chatId) {
      logger.warn(
        `Turno #${shortId}: teléfono inválido "${phoneRaw}" — omitido`
      );
      await logNotification(supabase, {
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: phoneRaw,
        type,
        status: "omitido",
        error: "Teléfono no normalizable",
      });
      await markSent(supabase, row.id, flagColumn, atColumn);
      return;
    }

    // Re-check flag just before send (anti-duplicado)
    const { data: fresh, error: freshErr } = await supabase
      .from("appointments")
      .select(`id, ${flagColumn}`)
      .eq("id", row.id)
      .maybeSingle();
    if (freshErr) throw freshErr;
    if (!fresh || fresh[flagColumn] === true) {
      logger.info(`Turno #${shortId}: ya procesado (${type}), se omite`);
      return;
    }

    const text = buildMessage(row);

    logger.info(`Enviando ${type} para turno #${shortId} → ${chatId}`);
    try {
      await wa.sendText(chatId, text);
    } catch (err) {
      const message = err?.message || String(err);
      logger.error(`Error enviando mensaje (${type}) #${shortId}`, message);
      patchStatus({ lastError: message });
      await logNotification(supabase, {
        appointmentId: row.id,
        patientId: row.patient_id,
        phone: phoneRaw,
        type,
        status: "fallido",
        error: message,
      });
      return;
    }

    const marked = await markSent(supabase, row.id, flagColumn, atColumn);
    if (!marked) {
      logger.warn(
        `Turno #${shortId}: mensaje enviado pero flag ya estaba en true`
      );
    } else {
      logger.info(`Mensaje enviado correctamente (${type}) #${shortId}`);
      logger.info(`Turno #${shortId} marcado como enviado (${flagColumn})`);
    }

    await logNotification(supabase, {
      appointmentId: row.id,
      patientId: row.patient_id,
      phone: phoneRaw,
      type,
      status: "enviado",
      meta: { chatId },
    });

    const count = await incrementMessagesSent(supabase);
    patchStatus({
      lastMessageAt: new Date().toISOString(),
      messagesSentCount: count,
      lastError: null,
    });
  }

  async function tick() {
    if (running) return;
    if (!wa.isReady()) {
      logger.info("WhatsApp no listo — se omite ciclo de polling");
      return;
    }
    running = true;
    try {
      logger.info("Buscando turnos pendientes...");
      const settings = await getProfessionalName(supabase);
      const {
        professionalName,
        confirmationTemplate,
        reminder24hTemplate,
        reminder2hTemplate,
      } = settings;

      if (config.confirmationEnabled) {
        const pending = await fetchPendingConfirmations(supabase);
        for (const row of pending) {
          await processOne({
            row,
            type: "confirmacion",
            flagColumn: "confirmation_sent",
            atColumn: "confirmation_sent_at",
            buildMessage: (r) =>
              buildConfirmationMessage(
                r,
                professionalName,
                confirmationTemplate
              ),
          });
        }
      }

      if (config.reminder24hEnabled) {
        const pending = await fetchPendingReminders(supabase, {
          flagColumn: "reminder_sent",
          targetOffsetHours: 24,
          windowMinutes: config.reminderWindowMinutes,
        });
        for (const row of pending) {
          await processOne({
            row,
            type: "recordatorio_24h",
            flagColumn: "reminder_sent",
            atColumn: "reminder_sent_at",
            buildMessage: (r) =>
              buildReminderMessage(
                r,
                professionalName,
                reminder24hTemplate,
                "24h"
              ),
          });
        }
      }

      if (config.reminder2hEnabled) {
        const pending = await fetchPendingReminders(supabase, {
          flagColumn: "reminder_2h_sent",
          targetOffsetHours: 2,
          windowMinutes: config.reminderWindowMinutes,
        });
        for (const row of pending) {
          await processOne({
            row,
            type: "recordatorio_2h",
            flagColumn: "reminder_2h_sent",
            atColumn: "reminder_2h_sent_at",
            buildMessage: (r) =>
              buildReminderMessage(
                r,
                professionalName,
                reminder2hTemplate,
                "2h"
              ),
          });
        }
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
        `Poller cada ${Math.round(config.pollIntervalMs / 1000)}s (confirm=${config.confirmationEnabled}, 24h=${config.reminder24hEnabled}, 2h=${config.reminder2hEnabled})`
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
