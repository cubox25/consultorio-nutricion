"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, History, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createAndDownloadFullBackup, normalizeBackupPayload } from "@/lib/backup";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { formatDateTime } from "@/lib/utils";
import type { BackupLog } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/states";

export function BackupsManager() {
  const supabase = useMemo(() => createClient(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<"backup" | "restore" | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState("");
  const [pendingBackup, setPendingBackup] = useState<unknown>(null);
  const [pendingMeta, setPendingMeta] = useState<{
    exported_at: string;
    counts: Record<string, number>;
  } | null>(null);

  const loadLogs = useCallback(async () => {
    const cached = getCached<BackupLog[]>("backups");
    if (cached) {
      setLogs(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const { data, error } = await supabase
        .from("backup_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      const rows = (data ?? []) as BackupLog[];
      setLogs(rows);
      setCached("backups", rows);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo cargar el historial."));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  async function logBackup(payload: {
    backup_type: string;
    status: BackupLog["status"];
    file_name?: string;
    record_counts?: Record<string, number>;
    notes?: string;
  }) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("backup_logs").insert({
      backup_type: payload.backup_type,
      status: payload.status,
      file_name: payload.file_name ?? null,
      record_counts: payload.record_counts ?? {},
      notes: payload.notes ?? null,
      created_by: user?.id ?? null,
    });
    if (error) throw error;
  }

  async function handleBackup() {
    setWorking("backup");
    try {
      const { fileName, record_counts } =
        await createAndDownloadFullBackup(supabase);
      await logBackup({
        backup_type: "completo",
        status: "completado",
        file_name: fileName,
        record_counts,
        notes: "Respaldo descargado en este dispositivo.",
      });
      toast.success("Respaldo guardado en tu dispositivo");
      invalidateCache("backups");
      await loadLogs();
    } catch (error) {
      try {
        await logBackup({
          backup_type: "completo",
          status: "fallido",
          notes: friendlyError(error),
        });
      } catch {
        // ignore
      }
      toast.error(friendlyError(error, "No se pudo crear el respaldo."));
      invalidateCache("backups");
      await loadLogs();
    } finally {
      setWorking(null);
    }
  }

  async function onPickRestoreFile(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text) as unknown;
      const normalized = normalizeBackupPayload(raw);
      const counts: Record<string, number> = {};
      for (const [key, rows] of Object.entries(normalized.data)) {
        counts[key] = Array.isArray(rows) ? rows.length : 0;
      }
      setPendingBackup(raw);
      setPendingMeta({
        exported_at: normalized.exported_at,
        counts,
      });
      setRestoreConfirm("");
      setRestoreOpen(true);
    } catch (error) {
      toast.error(friendlyError(error, "Archivo de respaldo inválido."));
    }
  }

  async function confirmRestore() {
    if (restoreConfirm.trim().toUpperCase() !== "RESTAURAR") {
      toast.error('Escribí RESTAURAR para confirmar.');
      return;
    }
    if (!pendingBackup) return;
    setWorking("restore");
    try {
      const res = await fetch("/api/admin/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          backup: pendingBackup,
          confirm: "RESTAURAR",
        }),
      });
      const payload = (await res.json()) as {
        error?: string;
        restored?: Record<string, number>;
      };
      if (!res.ok) throw new Error(payload.error || "No se pudo restaurar.");
      toast.success("Respaldo cargado correctamente");
      setRestoreOpen(false);
      setPendingBackup(null);
      setPendingMeta(null);
      invalidateCache("backups");
      await loadLogs();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo restaurar el respaldo."));
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Backups"
        description="Una copia de seguridad en tu celular o computadora, por si algo falla."
      />

      <Card className="border-[var(--border)] shadow-[var(--shadow-soft)]">
        <CardContent className="space-y-5 pt-6">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Guardar respaldo
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              Con un solo toque se descarga un archivo con pacientes, turnos,
              historias y configuración. Guardalo donde te quede cómodo.
            </p>
          </div>
          <Button
            className="w-full sm:w-auto"
            size="lg"
            loading={working === "backup"}
            disabled={!!working}
            onClick={() => void handleBackup()}
          >
            <Download className="h-4 w-4" />
            Crear respaldo ahora
          </Button>
        </CardContent>
      </Card>

      <Card className="border-[var(--border)] shadow-[var(--shadow-soft)]">
        <CardContent className="space-y-5 pt-6">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Cargar un respaldo
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              Si la base se vació o se perdió información, podés volver a subir
              un archivo que hayas guardado antes. Se fusiona con lo que haya
              ahora (no borra tu usuario de acceso).
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              void onPickRestoreFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!!working}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Elegir archivo de respaldo
          </Button>
        </CardContent>
      </Card>

      <Card className="border-[var(--border)] shadow-[var(--shadow-soft)]">
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--muted)]" />
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Últimos respaldos
            </h2>
          </div>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="Todavía no hay respaldos"
              description="Cuando crees uno, va a aparecer acá."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium capitalize text-[var(--foreground)]">
                      {log.backup_type === "restauracion"
                        ? "Restauración"
                        : log.backup_type === "completo"
                          ? "Respaldo completo"
                          : log.backup_type}
                    </span>
                    <Badge
                      tone={
                        log.status === "completado"
                          ? "success"
                          : log.status === "fallido"
                            ? "danger"
                            : "warning"
                      }
                    >
                      {log.status === "completado"
                        ? "OK"
                        : log.status === "fallido"
                          ? "Falló"
                          : "En proceso"}
                    </Badge>
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    {formatDateTime(log.created_at)}
                    {log.file_name ? ` · ${log.file_name}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Modal
        open={restoreOpen}
        onClose={() => {
          if (working === "restore") return;
          setRestoreOpen(false);
          setPendingBackup(null);
          setPendingMeta(null);
        }}
        title="Confirmar restauración"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={working === "restore"}
              onClick={() => {
                setRestoreOpen(false);
                setPendingBackup(null);
                setPendingMeta(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              loading={working === "restore"}
              onClick={() => void confirmRestore()}
            >
              Restaurar datos
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm text-[var(--muted)]">
          <p>
            Esto vuelve a cargar los datos del archivo en Supabase. Escribí{" "}
            <strong className="text-[var(--foreground)]">RESTAURAR</strong> para
            confirmar.
          </p>
          {pendingMeta ? (
            <p className="rounded-xl bg-[var(--sage-soft)]/50 px-3 py-2 text-xs text-[var(--foreground)]">
              Archivo del {formatDateTime(pendingMeta.exported_at)}
              {" · "}
              {Object.entries(pendingMeta.counts)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${k}: ${n}`)
                .join(" · ") || "sin filas"}
            </p>
          ) : null}
          <input
            value={restoreConfirm}
            onChange={(e) => setRestoreConfirm(e.target.value)}
            placeholder="RESTAURAR"
            className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-[var(--foreground)] outline-none focus:border-[var(--pink)]"
            autoComplete="off"
          />
        </div>
      </Modal>
    </div>
  );
}
