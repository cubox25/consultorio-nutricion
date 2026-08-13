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

interface LocalStatus {
  state?: WaState;
  qrRequired?: boolean;
  qrDataUrl?: string | null;
  lastConnectedAt?: string | null;
  lastMessageAt?: string | null;
  lastError?: string | null;
  messagesSentCount?: number;
}

const STATE_UI: Record<
  WaState,
  { label: string; tone: "ok" | "warn" | "bad" | "info"; dot: string }
> = {
  READY: { label: "WhatsApp conectado", tone: "ok", dot: "🟢" },
  QR_REQUIRED: { label: "Esperando QR", tone: "warn", dot: "🟡" },
  CONNECTING: { label: "Conectando…", tone: "info", dot: "🟡" },
  DISCONNECTED: { label: "Desconectado", tone: "bad", dot: "🔴" },
  ERROR: { label: "Error", tone: "bad", dot: "🔴" },
};

export function WhatsAppStatusPanel() {
  const [row, setRow] = useState<WaStatusRow | null>(null);
  const [local, setLocal] = useState<LocalStatus | null>(null);
  const [serviceUp, setServiceUp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [confirmationTpl, setConfirmationTpl] = useState(DEFAULT_WA_CONFIRMATION);
  const [reminder24Tpl, setReminder24Tpl] = useState(DEFAULT_WA_REMINDER_24H);
  const [reminder2hTpl, setReminder2hTpl] = useState(DEFAULT_WA_REMINDER_2H);
  const [savingMsg, setSavingMsg] = useState(false);

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
            "whatsapp_confirmation_template, whatsapp_reminder_24h_template, whatsapp_reminder_2h_template"
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
        }
      } catch {
        // columnas de plantilla pueden faltar hasta migración 006
      }

      try {
        const res = await fetch("http://127.0.0.1:3100/status", {
          cache: "no-store",
        });
        if (res.ok) {
          const json = (await res.json()) as LocalStatus;
          setLocal(json);
          setServiceUp(true);
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

  const state = (local?.state || row?.state || "DISCONNECTED") as WaState;
  const ui = STATE_UI[state] ?? STATE_UI.DISCONNECTED;
  const qrDataUrl = local?.qrDataUrl || null;
  const messages =
    local?.messagesSentCount ?? row?.messages_sent_count ?? 0;
  const lastMessage = local?.lastMessageAt || row?.last_message_at;
  const lastConnected = local?.lastConnectedAt || row?.last_connected_at;
  const lastError = local?.lastError || row?.last_error;

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

          {!serviceUp ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--foreground)]">
              <p className="font-semibold">Servicio no detectado en esta PC</p>
              <p className="mt-1 text-[var(--muted)]">
                Ejecutá en una terminal:{" "}
                <code className="text-[var(--foreground)]">npm run whatsapp</code>
              </p>
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
          <CardTitle className="text-base">Mensajes a pacientes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-[var(--muted)]">
            Podés usar:{" "}
            <code className="text-[var(--foreground)]">
              {"{nombre} {fecha} {hora} {consultorio} {profesional}"}
            </code>
          </p>
          <Textarea
            label="Confirmación al reservar"
            rows={10}
            value={confirmationTpl}
            onChange={(e) => setConfirmationTpl(e.target.value)}
          />
          <Textarea
            label="Recordatorio 24 horas antes"
            rows={8}
            value={reminder24Tpl}
            onChange={(e) => setReminder24Tpl(e.target.value)}
          />
          <Textarea
            label="Recordatorio 2 horas antes"
            rows={8}
            value={reminder2hTpl}
            onChange={(e) => setReminder2hTpl(e.target.value)}
          />
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
    </div>
  );
}
