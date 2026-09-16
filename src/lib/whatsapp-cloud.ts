import "server-only";

export type CloudMessageType =
  | "confirmacion"
  | "recordatorio_24h"
  | "recordatorio_2h";

export type WhatsAppCloudConfig = {
  enabled: boolean;
  token: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  apiVersion: string;
  templateLang: string;
  templates: Record<CloudMessageType, string>;
};

export function getWhatsAppCloudConfig(): WhatsAppCloudConfig {
  const token = (process.env.WHATSAPP_TOKEN || "").trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const enabledFlag = ["1", "true", "yes", "on"].includes(
    String(process.env.WHATSAPP_CLOUD_ENABLED || "")
      .trim()
      .toLowerCase()
  );

  return {
    enabled: enabledFlag && Boolean(token && phoneNumberId),
    token,
    phoneNumberId,
    businessAccountId:
      (process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || "").trim() || null,
    apiVersion: (process.env.WHATSAPP_API_VERSION || "v21.0").trim(),
    templateLang: (process.env.WHATSAPP_TEMPLATE_LANG || "es_AR").trim(),
    templates: {
      confirmacion: (
        process.env.WHATSAPP_TEMPLATE_CONFIRMATION || "turno_confirmado"
      ).trim(),
      recordatorio_24h: (
        process.env.WHATSAPP_TEMPLATE_REMINDER_24H || "recordatorio_24h"
      ).trim(),
      recordatorio_2h: (
        process.env.WHATSAPP_TEMPLATE_REMINDER_2H || "recordatorio_2h"
      ).trim(),
    },
  };
}

/** Config incompleta pero con flag o parcialmente seteada (para el panel). */
export function getWhatsAppCloudStatus() {
  const cfg = getWhatsAppCloudConfig();
  const missing: string[] = [];
  if (!process.env.WHATSAPP_CLOUD_ENABLED) missing.push("WHATSAPP_CLOUD_ENABLED");
  else if (
    !["1", "true", "yes", "on"].includes(
      String(process.env.WHATSAPP_CLOUD_ENABLED).trim().toLowerCase()
    )
  ) {
    missing.push("WHATSAPP_CLOUD_ENABLED=true");
  }
  if (!cfg.token) missing.push("WHATSAPP_TOKEN");
  if (!cfg.phoneNumberId) missing.push("WHATSAPP_PHONE_NUMBER_ID");

  return {
    enabled: cfg.enabled,
    configured: Boolean(cfg.token && cfg.phoneNumberId),
    flagOn: ["1", "true", "yes", "on"].includes(
      String(process.env.WHATSAPP_CLOUD_ENABLED || "")
        .trim()
        .toLowerCase()
    ),
    missing,
    phoneNumberId: cfg.phoneNumberId || null,
    businessAccountId: cfg.businessAccountId,
    templates: cfg.templates,
    templateLang: cfg.templateLang,
  };
}

export type TemplateVars = {
  nombre: string;
  profesional: string;
  fecha: string;
  hora: string;
  consultorio: string;
};

type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string; code?: number };

/**
 * Envía plantilla Utility con variables en orden:
 * {{1}} nombre, {{2}} profesional, {{3}} fecha, {{4}} hora, {{5}} consultorio
 */
export async function sendWhatsAppTemplate(params: {
  toE164Digits: string;
  messageType: CloudMessageType;
  vars: TemplateVars;
}): Promise<SendResult> {
  const cfg = getWhatsAppCloudConfig();
  if (!cfg.enabled) {
    return {
      ok: false,
      error:
        "Cloud API desactivada o incompleta (WHATSAPP_CLOUD_ENABLED / TOKEN / PHONE_NUMBER_ID).",
    };
  }

  const templateName = cfg.templates[params.messageType];
  const url = `https://graph.facebook.com/${cfg.apiVersion}/${cfg.phoneNumberId}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to: params.toE164Digits,
    type: "template",
    template: {
      name: templateName,
      language: { code: cfg.templateLang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: params.vars.nombre },
            { type: "text", text: params.vars.profesional },
            { type: "text", text: params.vars.fecha },
            { type: "text", text: params.vars.hora },
            { type: "text", text: params.vars.consultorio },
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string; code?: number; error_user_msg?: string };
    };

    if (!res.ok) {
      const msg =
        json.error?.code === 131030
          ? "(#131030) Recipient phone number not in allowed list"
          : json.error?.error_user_msg ||
            json.error?.message ||
            `Meta HTTP ${res.status}`;
      return { ok: false, error: msg, code: json.error?.code };
    }

    return { ok: true, messageId: json.messages?.[0]?.id ?? null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Error de red con Meta",
    };
  }
}
