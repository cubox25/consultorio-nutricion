"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Database,
  Download,
  FileJson,
  HardDrive,
  History,
  Shield,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { downloadBlob, formatDateTime, toCSV } from "@/lib/utils";
import type { BackupLog } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/states";

type EntityKey =
  | "patients"
  | "appointments"
  | "clinical_records"
  | "anthropometric_records"
  | "nutrition_plans"
  | "files";

const ENTITY_LABELS: Record<EntityKey, string> = {
  patients: "Pacientes",
  appointments: "Turnos",
  clinical_records: "Historias clínicas",
  anthropometric_records: "Antropometría",
  nutrition_plans: "Histórico interno",
  files: "Archivos (metadatos)",
};

const EXPORT_API_MAP: Partial<Record<EntityKey, string>> = {
  patients: "patients",
  appointments: "appointments",
  clinical_records: "clinical",
  anthropometric_records: "anthropometry",
  nutrition_plans: "plans",
};

async function fetchAll(
  supabase: ReturnType<typeof createClient>,
  table: string
) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw error;
  return data ?? [];
}

export function BackupsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState<BackupLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

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
        .limit(30);
      if (error) throw error;
      const rows = (data ?? []) as BackupLog[];
      setLogs(rows);
      setCached("backups", rows);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudieron cargar los logs de backup."));
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

  async function createFullBackup(alsoCsv = false) {
    setWorking(alsoCsv ? "full-csv" : "full");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `respaldo-completo-${stamp}.json`;

    try {
      await logBackup({
        backup_type: "completo",
        status: "en_proceso",
        file_name: fileName,
        notes: "Generando respaldo completo…",
      });

      const [
        patients,
        appointments,
        clinical_records,
        anthropometric_records,
        anthropometry_documents,
        nutrition_plans,
        files,
      ] = await Promise.all([
        fetchAll(supabase, "patients"),
        fetchAll(supabase, "appointments"),
        fetchAll(supabase, "clinical_records"),
        fetchAll(supabase, "anthropometric_records"),
        fetchAll(supabase, "anthropometry_documents"),
        fetchAll(supabase, "nutrition_plans"),
        fetchAll(supabase, "files"),
      ]);

      const record_counts = {
        patients: patients.length,
        appointments: appointments.length,
        clinical_records: clinical_records.length,
        anthropometric_records: anthropometric_records.length,
        anthropometry_documents: anthropometry_documents.length,
        nutrition_plans: nutrition_plans.length,
        files: files.length,
      };

      const payload = {
        exported_at: new Date().toISOString(),
        timezone: "America/Argentina/Buenos_Aires",
        note:
          "Supabase es el sistema principal. Este archivo es una copia externa de respaldo. Los archivos de Storage se referencian por storage_path; descargalos por separado si necesitás una copia física.",
        record_counts,
        data: {
          patients,
          appointments,
          clinical_records,
          anthropometric_records,
          anthropometry_documents,
          nutrition_plans,
          files,
        },
      };

      downloadBlob(
        JSON.stringify(payload, null, 2),
        fileName,
        "application/json;charset=utf-8"
      );

      if (alsoCsv) {
        downloadBlob(
          toCSV(patients as Record<string, unknown>[]),
          `pacientes-${stamp}.csv`,
          "text/csv;charset=utf-8"
        );
        downloadBlob(
          toCSV(appointments as Record<string, unknown>[]),
          `turnos-${stamp}.csv`,
          "text/csv;charset=utf-8"
        );
      }

      await logBackup({
        backup_type: "completo",
        status: "completado",
        file_name: fileName,
        record_counts,
        notes: alsoCsv
          ? "Respaldo JSON + CSV de pacientes y turnos descargado."
          : "Respaldo JSON completo descargado.",
      });

      toast.success("Respaldo creado y descargado");
      invalidateCache("backups");
      await loadLogs();
    } catch (error) {
      try {
        await logBackup({
          backup_type: "completo",
          status: "fallido",
          file_name: fileName,
          notes: friendlyError(error),
        });
      } catch {
        // ignore secondary log failure
      }
      toast.error(friendlyError(error, "No se pudo crear el respaldo."));
      invalidateCache("backups");
      await loadLogs();
    } finally {
      setWorking(null);
    }
  }

  async function exportEntity(entity: EntityKey, format: "json" | "csv") {
    setWorking(`${entity}-${format}`);
    const stamp = new Date().toISOString().slice(0, 10);
    const label = ENTITY_LABELS[entity];

    try {
      if (format === "csv" && EXPORT_API_MAP[entity]) {
        const res = await fetch(`/api/export/${EXPORT_API_MAP[entity]}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Error al exportar");
        }
        const blob = await res.blob();
        const fileName = `${entity}-${stamp}.csv`;
        downloadBlob(blob, fileName, "text/csv;charset=utf-8");
        await logBackup({
          backup_type: entity,
          status: "completado",
          file_name: fileName,
          notes: `Exportación CSV de ${label} vía API autenticada.`,
        });
      } else {
        const rows = await fetchAll(supabase, entity);
        const fileName = `${entity}-${stamp}.${format}`;
        if (format === "json") {
          downloadBlob(
            JSON.stringify(
              {
                exported_at: new Date().toISOString(),
                entity,
                count: rows.length,
                data: rows,
              },
              null,
              2
            ),
            fileName,
            "application/json;charset=utf-8"
          );
        } else {
          downloadBlob(
            toCSV(rows as Record<string, unknown>[]),
            fileName,
            "text/csv;charset=utf-8"
          );
        }
        await logBackup({
          backup_type: entity,
          status: "completado",
          file_name: fileName,
          record_counts: { [entity]: rows.length },
          notes: `Exportación ${format.toUpperCase()} de ${label}.`,
        });
      }
      toast.success(`${label} exportado`);
      invalidateCache("backups");
      await loadLogs();
    } catch (error) {
      toast.error(friendlyError(error, `No se pudo exportar ${label}.`));
    } finally {
      setWorking(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Backups"
        description="Los backups permiten recuperar la información ante errores o problemas técnicos."
        actions={
          <>
            <Button
              variant="outline"
              loading={working === "full-csv"}
              disabled={!!working}
              onClick={() => void createFullBackup(true)}
            >
              <Download className="h-4 w-4" />
              JSON + CSV
            </Button>
            <Button
              loading={working === "full"}
              disabled={!!working}
              onClick={() => void createFullBackup(false)}
            >
              <FileJson className="h-4 w-4" />
              Crear respaldo
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[var(--brand-primary)]" />
              Sistema principal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-stone-600">
            <p>
              <strong>Supabase</strong> es el sistema principal donde viven pacientes,
              turnos, historias clínicas y el resto de la información operativa.
            </p>
            <p>
              Un backup externo es una <strong>copia</strong> de esos datos para
              guardarla fuera de la plataforma (disco, nube personal, etc.).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-[var(--brand-primary)]" />
              Archivos en Storage
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-stone-600">
            <p>
              El respaldo incluye la <strong>metadata</strong> de archivos (nombre,
              categoría, fechas) y el campo <code className="rounded bg-stone-100 px-1">storage_path</code>.
            </p>
            <p>
              Los binarios en Storage no se empaquetan en el JSON: usá esas rutas
              para una copia externa de los archivos si la necesitás.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[var(--brand-primary)]" />
            Exportar por entidad
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(ENTITY_LABELS) as EntityKey[]).map((entity) => (
              <div
                key={entity}
                className="rounded-xl border border-[var(--border)] p-4"
              >
                <p className="mb-3 font-medium">{ENTITY_LABELS[entity]}</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!working}
                    loading={working === `${entity}-json`}
                    onClick={() => void exportEntity(entity, "json")}
                  >
                    JSON
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!!working}
                    loading={working === `${entity}-csv`}
                    onClick={() => void exportEntity(entity, "csv")}
                  >
                    CSV
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--brand-primary)]" />
            Historial de respaldos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="Sin respaldos registrados"
              description="Cuando creés un respaldo, quedará registrado aquí."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium capitalize">{log.backup_type}</span>
                      <Badge
                        tone={
                          log.status === "completado"
                            ? "success"
                            : log.status === "fallido"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {log.status === "en_proceso"
                          ? "En proceso"
                          : log.status === "completado"
                            ? "Completado"
                            : "Fallido"}
                      </Badge>
                    </div>
                    <p className="text-sm text-stone-500">
                      {formatDateTime(log.created_at)}
                      {log.file_name ? ` · ${log.file_name}` : ""}
                    </p>
                    {log.notes ? (
                      <p className="mt-1 text-sm text-stone-600">{log.notes}</p>
                    ) : null}
                  </div>
                  {log.record_counts ? (
                    <p className="text-xs text-stone-500">
                      {Object.entries(log.record_counts)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(" · ")}
                    </p>
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
