"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { getSystemSettings, updateSystemSettings } from "@/services/settings";
import {
  DEFAULT_WA_CONFIRMATION,
  DEFAULT_WA_REMINDER_24H,
  DEFAULT_WA_REMINDER_2H,
} from "@/lib/whatsapp-templates";
import type { SystemSettings } from "@/types";
import { PageHeader } from "@/components/ui/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";

type WaState =
  | "CONNECTING"
  | "QR_REQUIRED"
  | "READY"
  | "DISCONNECTED"
  | "ERROR";

interface WaStatusRow {
  state: WaState;
  qr_required: boolean;
  last_connected_at: string | null;
  last_message_at: string | null;
  last_error: string | null;
  messages_sent_count: number;
  updated_at: string;
}

interface OutboundCounts {
  pendiente: number;
  enviando: number;
  enviado: number;
  error: number;
}

interface LocalStatus {
  state?: WaState;
  qrRequired?: boolean;
  qrDataUrl?: string | null;
  lastConnectedAt?: string | null;
  lastMessageAt?: string | null;
  lastError?: string | null;
  messagesSentCount?: number;
  outbound?: OutboundCounts | null;
}

type OutboundRow = {
  id: string;
  appointment_id: string;
  phone: string | null;
  message_type: string;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  body: string | null;
};

const STATE_UI: Record<
  WaState,
  { label: string; tone: "ok" | "warn" | "bad" | "info"; dot: string }
> = {
  READY: { label: "WhatsApp conectado", tone: "ok", dot: "🟢" },
  QR_REQUIRED: { label: "Esperando QR", tone: "warn", dot: "🟡" },
  CONNECTING: { label: "Conectando…", tone: "info", dot: "🟡" },
  DISCONNECTED: { label: "WhatsApp desconectado", tone: "bad", dot: "🔴" },
  ERROR: { label: "Error", tone: "bad", dot: "🔴" },
};

const TYPE_LABELS: Record<string, string> = {
  confirmacion: "Confirmación",
  recordatorio_24h: "Recordatorio 24h",
  recordatorio_2h: "Recordatorio 2h",
};

function ToggleRow({
  label,
  description,
  enabled,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--foreground)]">{label}</p>
        <p className="text-xs text-[var(--muted)]">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`inline-flex h-9 min-w-[6.5rem] items-center justify-center rounded-full px-4 text-xs font-semibold transition ${
          enabled
            ? "bg-[var(--sage-soft)] text-[var(--sage-deep)]"
            : "bg-[#f3f4f6] text-[var(--muted)]"
        } disabled:opacity-60`}
        aria-pressed={enabled}
      >
        {enabled ? "ACTIVADO" : "DESACTIVADO"}
      </button>
    </div>
  );
}

export function WhatsAppStatusPanel() {
  const [row, setRow] = useState<WaStatusRow | null>(null);
  const [local, setLocal] = useState<LocalStatus | null>(null);
  const [serviceUp, setServiceUp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [confirmationTpl, setConfirmationTpl] = useState(DEFAULT_WA_CONFIRMATION);
  const [reminder24Tpl, setReminder24Tpl] = useState(DEFAULT_WA_REMINDER_24H);
  const [reminder2hTpl, setReminder2hTpl] = useState(DEFAULT_WA_REMINDER_2H);
  const [confirmationOn, setConfirmationOn] = useState(true);
  const [reminder24On, setReminder24On] = useState(true);
  const [reminder2hOn, setReminder2hOn] = useState(false);
  const [savingMsg, setSavingMsg] = useState(false);
  const [savingToggles, setSavingToggles] = useState(false);
  const [outbound, setOutbound] = useState<OutboundCounts>({
    pendiente: 0,
    enviando: 0,
    enviado: 0,
    error: 0,
  });
  const [queueRows, setQueueRows] = useState<OutboundRow[]>([]);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("whatsapp_service_status")
        .select(
          "state, qr_required, last_connected_at, last_message_at, last_error, messages_sent_count, updated_at"
        )
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      setRow((data as WaStatusRow | null) ?? null);

      try {
        const settings =
          getCached<SystemSettings>("settings") ??
          (await getSystemSettings(supabase));
        if (settings) {
          setCached("settings", settings);
          setSettingsId(settings.id);
        }

        const { data: templates, error: tplError } = await supabase
          .from("system_settings")
          .select(
            `
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
        if (!tplError && templates) {
          setConfirmationTpl(
            templates.whatsapp_confirmation_template?.trim() ||
              DEFAULT_WA_CONFIRMATION
          );
          setReminder24Tpl(
            templates.whatsapp_reminder_24h_template?.trim() ||
              DEFAULT_WA_REMINDER_24H
          );
          setReminder2hTpl(
            templates.whatsapp_reminder_2h_template?.trim() ||
              DEFAULT_WA_REMINDER_2H
          );
          if (typeof templates.whatsapp_confirmation_enabled === "boolean") {
            setConfirmationOn(templates.whatsapp_confirmation_enabled);
          }
          if (typeof templates.whatsapp_reminder_24h_enabled === "boolean") {
            setReminder24On(templates.whatsapp_reminder_24h_enabled);
          }
          if (typeof templates.whatsapp_reminder_2h_enabled === "boolean") {
            setReminder2hOn(templates.whatsapp_reminder_2h_enabled);
          }
        }
      } catch {
        // columnas pueden faltar hasta migraciones 006/008
      }

      try {
        const [pendRes, envRes, okRes, errRes, recentRes] = await Promise.all([
          supabase
            .from("whatsapp_outbound_messages")
            .select("id", { count: "exact", head: true })
            .eq("status", "pendiente"),
          supabase
            .from("whatsapp_outbound_messages")
            .select("id", { count: "exact", head: true })
            .eq("status", "enviando"),
          supabase
            .from("whatsapp_outbound_messages")
            .select("id", { count: "exact", head: true })
            .eq("status", "enviado"),
          supabase
            .from("whatsapp_outbound_messages")
            .select("id", { count: "exact", head: true })
            .eq("status", "error"),
          supabase
            .from("whatsapp_outbound_messages")
            .select(
              "id, appointment_id, phone, message_type, status, attempts, last_attempt_at, sent_at, error_message, created_at, body"
            )
            .in("status", ["pendiente", "enviando", "error", "enviado"])
            .order("updated_at", { ascending: false })
            .limit(20),
        ]);

        setOutbound({
          pendiente: pendRes.count ?? 0,
          enviando: envRes.count ?? 0,
          enviado: okRes.count ?? 0,
          error: errRes.count ?? 0,
        });
        setQueueRows((recentRes.data as OutboundRow[]) ?? []);
      } catch {
        // migración 008 pendiente
      }

      try {
        const res = await fetch("http://127.0.0.1:3100/status", {
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as LocalStatus;
          setLocal(json);
          setServiceUp(true);
          if (json.outbound) setOutbound(json.outbound);
        } else {
          setLocal(null);
          setServiceUp(false);
        }
      } catch {
        setLocal(null);
        setServiceUp(false);
      }
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "No se pudo cargar el estado. ¿Ejecutaste la migración 005?"
        )
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 5_000);
    return () => clearInterval(id);
  }, [load]);

  const saveTemplates = async () => {
    if (!settingsId) {
      toast.error("No se pudo cargar la configuración.");
      return;
    }
    setSavingMsg(true);
    try {
      const supabase = createClient();
      const updated = await updateSystemSettings(supabase, settingsId, {
        whatsapp_confirmation_template: confirmationTpl.trim() || null,
        whatsapp_reminder_24h_template: reminder24Tpl.trim() || null,
        whatsapp_reminder_2h_template: reminder2hTpl.trim() || null,
      } as Partial<SystemSettings>);
      invalidateCache("settings");
      setCached("settings", updated);
      toast.success("Mensajes guardados");
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "No se pudo guardar. ¿Ejecutaste la migración 006_whatsapp_message_templates.sql?"
        )
      );
    } finally {
      setSavingMsg(false);
    }
  };

  const saveToggle = async (
    field:
      | "whatsapp_confirmation_enabled"
      | "whatsapp_reminder_24h_enabled"
      | "whatsapp_reminder_2h_enabled",
    value: boolean
  ) => {
    if (!settingsId) {
      toast.error("No se pudo cargar la configuración.");
      return;
    }
    setSavingToggles(true);
    try {
      const supabase = createClient();
      const updated = await updateSystemSettings(supabase, settingsId, {
        [field]: value,
      } as Partial<SystemSettings>);
      invalidateCache("settings");
      setCached("settings", updated);
      toast.success("Preferencia guardada");
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "No se pudo guardar. ¿Ejecutaste la migración 008_whatsapp_queue_and_toggles.sql?"
        )
      );
      // revert UI on failure by reloading
      void load();
    } finally {
      setSavingToggles(false);
    }
  };

  const disconnectWhatsApp = async () => {
    if (
      !window.confirm(
        "¿Desconectar WhatsApp? Se cerrará la sesión y tendrás que escanear el QR otra vez. No se borran turnos ni mensajes."
      )
    ) {
      return;
    }
    setDisconnecting(true);
    try {
      const res = await fetch("http://127.0.0.1:3100/disconnect", {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "No se pudo desconectar");
      }
      toast.success("WhatsApp desconectado");
      await load();
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "No se pudo desconectar. ¿Está corriendo npm run whatsapp?"
        )
      );
    } finally {
      setDisconnecting(false);
    }
  };

  const retryMessage = async (id: string) => {
    setRetryingId(id);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("whatsapp_outbound_messages")
        .update({
          status: "pendiente",
          error_message: null,
        })
        .eq("id", id)
        .eq("status", "error");
      if (error) throw error;
      toast.success("Reintento encolado");
      await load();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo reintentar el envío."));
    } finally {
      setRetryingId(null);
    }
  };

  const state = (local?.state || row?.state || "DISCONNECTED") as WaState;
  const ui = STATE_UI[state] ?? STATE_UI.DISCONNECTED;
  const qrDataUrl = local?.qrDataUrl || null;
  const messages =
    local?.messagesSentCount ?? row?.messages_sent_count ?? 0;
  const lastMessage = local?.lastMessageAt || row?.last_message_at;
  const lastConnected = local?.lastConnectedAt || row?.last_connected_at;
  const lastError = local?.lastError || row?.last_error;
  const hasSendErrors = outbound.error > 0;
  const statusExtra =
    state === "READY" && hasSendErrors
      ? "⚠️ Conectado, con errores de envío"
      : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="WhatsApp"
        description="Conexión del servicio y mensajes automáticos a pacientes."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={loading}
            onClick={() => void load()}
          >
            <RefreshCw className="h-4 w-4" />
            Actualizar
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-[var(--green)]" />
            Conexión
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-semibold text-[var(--foreground)]">
              {ui.dot} {ui.label}
            </p>
            <Badge
              tone={
                ui.tone === "ok"
                  ? "success"
                  : ui.tone === "warn" || ui.tone === "info"
                    ? "warning"
                    : "danger"
              }
            >
              {state}
            </Badge>
          </div>

          {statusExtra ? (
            <p className="text-sm font-medium text-[#9a6f10]">{statusExtra}</p>
          ) : null}

          <div className="flex flex-wrap gap-2 text-sm">
            {outbound.pendiente > 0 ? (
              <span className="rounded-full bg-[var(--yellow-soft)] px-3 py-1 text-[#9a6f10]">
                🟡 {outbound.pendiente} pendiente
                {outbound.pendiente === 1 ? "" : "s"}
              </span>
            ) : null}
            {outbound.error > 0 ? (
              <span className="rounded-full bg-[var(--pink-mist)] px-3 py-1 text-[var(--pink)]">
                🔴 {outbound.error} con error
              </span>
            ) : null}
            {outbound.enviado > 0 ? (
              <span className="rounded-full bg-[var(--sage-soft)] px-3 py-1 text-[var(--sage-deep)]">
                🟢 {outbound.enviado} enviado
                {outbound.enviado === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>

          {!serviceUp ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)]">
              <p className="font-semibold">Servicio no detectado en esta PC</p>
              <p className="mt-1 text-[var(--muted)]">
                Ejecutá en una terminal:{" "}
                <code className="text-[var(--foreground)]">npm run whatsapp</code>
              </p>
            </div>
          ) : null}

          {serviceUp ? (
            <div className="flex flex-wrap gap-2">
              {(state === "READY" ||
                state === "QR_REQUIRED" ||
                state === "CONNECTING" ||
                state === "ERROR") && (
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  loading={disconnecting}
                  onClick={() => void disconnectWhatsApp()}
                >
                  Desconectar WhatsApp
                </Button>
              )}
              {(state === "DISCONNECTED" || state === "ERROR") && !qrDataUrl ? (
                <p className="text-sm text-[var(--muted)]">
                  Para conectar de nuevo, dejá el servicio corriendo y escaneá el
                  QR cuando aparezca.
                </p>
              ) : null}
            </div>
          ) : null}

          {serviceUp && qrDataUrl ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-white p-4">
              <p className="text-sm font-medium text-[var(--foreground)]">
                Escaneá este QR con WhatsApp → Dispositivos vinculados
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="Código QR de WhatsApp"
                className="h-64 w-64 rounded-xl border border-[var(--border)]"
              />
            </div>
          ) : null}

          {serviceUp && state === "CONNECTING" && !qrDataUrl ? (
            <p className="text-sm text-[var(--muted)]">
              Iniciando WhatsApp Web… en unos segundos debería aparecer el QR.
            </p>
          ) : null}

          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Mensajes enviados
              </dt>
              <dd className="mt-1 text-sm font-semibold text-[var(--foreground)]">
                {messages}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Último mensaje
              </dt>
              <dd className="mt-1 text-sm text-[var(--foreground)]">
                {lastMessage ? formatDateTime(lastMessage) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Última conexión
              </dt>
              <dd className="mt-1 text-sm text-[var(--foreground)]">
                {lastConnected ? formatDateTime(lastConnected) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Última actualización
              </dt>
              <dd className="mt-1 text-sm text-[var(--foreground)]">
                {row?.updated_at ? formatDateTime(row.updated_at) : "—"}
              </dd>
            </div>
          </dl>

          {lastError ? (
            <p className="rounded-xl bg-[var(--pink-mist)] px-3 py-2 text-sm text-[var(--pink)]">
              Último error: {lastError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensajes automáticos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Confirmación del turno"
            description="Se envía al crear el turno (o queda pendiente si WhatsApp está desconectado)."
            enabled={confirmationOn}
            disabled={savingToggles}
            onChange={(v) => {
              setConfirmationOn(v);
              void saveToggle("whatsapp_confirmation_enabled", v);
            }}
          />
          <Textarea
            label="Texto de confirmación"
            rows={8}
            value={confirmationTpl}
            onChange={(e) => setConfirmationTpl(e.target.value)}
          />

          <ToggleRow
            label="Recordatorio 24 horas antes"
            description="Se envía cuando faltan ~24 h; si WhatsApp estaba offline, se reintenta al reconectar."
            enabled={reminder24On}
            disabled={savingToggles}
            onChange={(v) => {
              setReminder24On(v);
              void saveToggle("whatsapp_reminder_24h_enabled", v);
            }}
          />
          <Textarea
            label="Texto recordatorio 24 h"
            rows={6}
            value={reminder24Tpl}
            onChange={(e) => setReminder24Tpl(e.target.value)}
          />

          <ToggleRow
            label="Recordatorio 2 horas antes"
            description="Se envía cuando faltan ~2 h."
            enabled={reminder2hOn}
            disabled={savingToggles}
            onChange={(v) => {
              setReminder2hOn(v);
              void saveToggle("whatsapp_reminder_2h_enabled", v);
            }}
          />
          <Textarea
            label="Texto recordatorio 2 h"
            rows={6}
            value={reminder2hTpl}
            onChange={(e) => setReminder2hTpl(e.target.value)}
          />

          <p className="text-xs text-[var(--muted)]">
            Placeholders:{" "}
            <code className="text-[var(--foreground)]">
              {"{nombre} {fecha} {hora} {consultorio} {profesional}"}
            </code>
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setConfirmationTpl(DEFAULT_WA_CONFIRMATION);
                setReminder24Tpl(DEFAULT_WA_REMINDER_24H);
                setReminder2hTpl(DEFAULT_WA_REMINDER_2H);
              }}
            >
              Restaurar textos
            </Button>
            <Button
              type="button"
              loading={savingMsg}
              onClick={() => void saveTemplates()}
            >
              Guardar mensajes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado de mensajes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span>🟢 Enviados: {outbound.enviado}</span>
            <span>🟡 Pendientes: {outbound.pendiente}</span>
            <span>🔴 Errores: {outbound.error}</span>
          </div>

          {queueRows.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Todavía no hay mensajes en la cola. Si ves un error al cargar,
              ejecutá la migración{" "}
              <code className="text-[var(--foreground)]">
                008_whatsapp_queue_and_toggles.sql
              </code>
              .
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)]">
              {queueRows.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      {TYPE_LABELS[item.message_type] || item.message_type} ·{" "}
                      <span className="font-medium capitalize">{item.status}</span>
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      Tel: {item.phone || "—"} · Intentos: {item.attempts || 0}
                      {item.last_attempt_at
                        ? ` · Último intento: ${formatDateTime(item.last_attempt_at)}`
                        : ""}
                      {item.sent_at
                        ? ` · Enviado: ${formatDateTime(item.sent_at)}`
                        : ""}
                    </p>
                    {item.error_message ? (
                      <p className="text-xs text-[var(--pink)]">
                        {item.error_message}
                      </p>
                    ) : null}
                  </div>
                  {item.status === "error" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={retryingId === item.id}
                      onClick={() => void retryMessage(item.id)}
                    >
                      Reintentar envío
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
