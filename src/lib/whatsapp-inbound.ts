import "server-only";

import { tryCreateServiceClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/whatsapp-cloud";
import {
  digitsOnly,
  normalizeArgentinaWhatsApp,
} from "@/lib/whatsapp-phone";

/** WhatsApp de Pamela (el que sí se atiende). */
const PAMELA_WHATSAPP = "3816617606";

const PROCESSED_CAP = 80;
const INBOUND_LOG_CAP = 25;

export type InboundChatLogItem = {
  at: string;
  from: string;
  text: string;
  action: string;
};

type MetaInboundMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    type?: string;
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
};

type MetaWebhookBody = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: { messages?: MetaInboundMessage[] };
    }>;
  }>;
};

function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function isAck(text: string) {
  const t = fold(text).replace(/[^a-z0-9]+/g, " ").trim();
  return /^(ok|oka|okey|dale|gracias|grax|listo|si|perfecto|genial|buenisimo|joya|va|bien)$/.test(
    t
  );
}

function isCancelOrChangeIntent(text: string) {
  const t = fold(text);
  return /(cancel|anul|dar de baja|dalo de baja|de baja|no puedo|no voy|no asisto|suspend|sacame el turno|sacar el turno|borrar el turno|eliminar el turno|no me presento|reprogram|cambiar.*(turno|hora|dia|fecha)|modific.*(turno|hora|dia)|pasar el turno|mover el turno|otro (dia|horario)|otra hora)/.test(
    t
  );
}

function messageText(msg: MetaInboundMessage) {
  if (msg.type === "text") return (msg.text?.body || "").trim();
  if (msg.type === "button") return (msg.button?.text || "").trim();
  if (msg.type === "interactive") {
    return (
      msg.interactive?.button_reply?.title ||
      msg.interactive?.list_reply?.title ||
      ""
    ).trim();
  }
  return "";
}

function pamelaWhatsAppDigits(fromSettings: string | null | undefined) {
  return (
    normalizeArgentinaWhatsApp(fromSettings) ||
    normalizeArgentinaWhatsApp(PAMELA_WHATSAPP) ||
    "5493816617606"
  );
}

function extractMessages(payload: MetaWebhookBody): MetaInboundMessage[] {
  const out: MetaInboundMessage[] = [];
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      for (const msg of change.value?.messages || []) {
        if (msg?.id && msg.from) out.push(msg);
      }
    }
  }
  return out;
}

async function alreadyProcessed(messageId: string) {
  const supabase = tryCreateServiceClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("whatsapp_service_status")
    .select("details")
    .eq("id", 1)
    .maybeSingle();
  const details = (data?.details || {}) as {
    inbound_processed_ids?: string[];
  };
  return (details.inbound_processed_ids || []).includes(messageId);
}

async function markProcessed(params: {
  messageId: string;
  log: InboundChatLogItem;
}) {
  const supabase = tryCreateServiceClient();
  if (!supabase) return;
  const { data } = await supabase
    .from("whatsapp_service_status")
    .select("details")
    .eq("id", 1)
    .maybeSingle();
  const details = {
    ...((data?.details && typeof data.details === "object"
      ? data.details
      : {}) as Record<string, unknown>),
  };
  const ids = [
    ...((details.inbound_processed_ids as string[] | undefined) || []).filter(
      (id) => id !== params.messageId
    ),
    params.messageId,
  ].slice(-PROCESSED_CAP);
  const log = [
    params.log,
    ...((details.inbound_messages as InboundChatLogItem[] | undefined) || []),
  ].slice(0, INBOUND_LOG_CAP);
  await supabase
    .from("whatsapp_service_status")
    .update({
      details: {
        ...details,
        inbound_processed_ids: ids,
        inbound_messages: log,
      },
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
}

async function loadPamelaWhatsApp() {
  const supabase = tryCreateServiceClient();
  if (!supabase) return PAMELA_WHATSAPP;
  const { data } = await supabase
    .from("system_settings")
    .select("whatsapp")
    .limit(1)
    .maybeSingle();
  return (data?.whatsapp as string | null)?.trim() || PAMELA_WHATSAPP;
}

function buildReply(kind: "cancel" | "other", pamelaNumber: string) {
  const digits = pamelaWhatsAppDigits(pamelaNumber);
  const link = `https://wa.me/${digits}`;
  const display = digitsOnly(pamelaNumber) || PAMELA_WHATSAPP;
  if (kind === "cancel") {
    return [
      "Para dar de baja o cambiar el turno, escribile a Pamela por WhatsApp:",
      display,
      link,
      "",
      "Este número solo manda confirmaciones y recordatorios; no se atiende acá.",
    ].join("\n");
  }
  return [
    "Este WhatsApp es automático: confirma y recuerda turnos. Nadie mira este chat.",
    "Para dar de baja, cambiar el turno o hablar con Pamela, escribile a:",
    display,
    link,
  ].join("\n");
}

/**
 * Responde mensajes al número de Cloud API y deriva a Pamela.
 * No cancela turnos: la baja la confirma ella.
 */
export async function handleWhatsAppInbound(payload: unknown) {
  const body = (payload || {}) as MetaWebhookBody;
  const messages = extractMessages(body);
  if (!messages.length) return;

  const pamelaNumber = await loadPamelaWhatsApp();

  for (const msg of messages) {
    const from = digitsOnly(msg.from);
    if (!from) continue;
    if (await alreadyProcessed(msg.id || "")) continue;

    const text = messageText(msg);
    let action = "ignored";
    let reply = "";

    if (isAck(text)) {
      action = "ack";
    } else if (isCancelOrChangeIntent(text)) {
      action = "redirect_pamela_cancel";
      reply = buildReply("cancel", pamelaNumber);
    } else {
      action = "redirect_pamela";
      reply = buildReply("other", pamelaNumber);
    }

    if (reply) {
      const sent = await sendWhatsAppText({ toE164Digits: from, body: reply });
      if (!sent.ok) {
        console.error("[whatsapp inbound] reply", sent.error);
        action = `${action}|reply_fail`;
      }
    }

    await markProcessed({
      messageId: msg.id || `${from}-${msg.timestamp || Date.now()}`,
      log: {
        at: new Date().toISOString(),
        from,
        text: text.slice(0, 280) || `(${msg.type || "mensaje"})`,
        action,
      },
    });
  }
}
