import type { SupabaseClient } from "@supabase/supabase-js";
import { downloadBlob } from "@/lib/utils";

export const BACKUP_FORMAT = "consultorio-backup-v1" as const;

/** Orden de restauración respetando FKs. */
export const BACKUP_TABLES = [
  "clinics",
  "clinic_schedules",
  "appointment_blocks",
  "patients",
  "appointments",
  "clinical_records",
  "anthropometric_records",
  "anthropometry_documents",
  "nutrition_plans",
  "files",
  "system_settings",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export type FullBackupPayload = {
  format: typeof BACKUP_FORMAT;
  exported_at: string;
  timezone: string;
  note: string;
  record_counts: Record<string, number>;
  data: Partial<Record<BackupTable, Record<string, unknown>[]>>;
};

async function fetchAllRows(
  supabase: SupabaseClient,
  table: string
): Promise<Record<string, unknown>[]> {
  const pageSize = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as Record<string, unknown>[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function buildFullBackup(
  supabase: SupabaseClient
): Promise<FullBackupPayload> {
  const entries = await Promise.all(
    BACKUP_TABLES.map(async (table) => {
      const rows = await fetchAllRows(supabase, table);
      return [table, rows] as const;
    })
  );

  const data = Object.fromEntries(entries) as FullBackupPayload["data"];
  const record_counts = Object.fromEntries(
    entries.map(([table, rows]) => [table, rows.length])
  );

  return {
    format: BACKUP_FORMAT,
    exported_at: new Date().toISOString(),
    timezone: "America/Argentina/Buenos_Aires",
    note:
      "Copia de seguridad del consultorio. Guardala en tu computadora o celular. Las fotos/archivos de Storage se referencian por URL o storage_path.",
    record_counts,
    data,
  };
}

export function backupFileName(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, "-");
  return `respaldo-consultorio-${stamp}.json`;
}

export function downloadFullBackup(payload: FullBackupPayload, fileName?: string) {
  downloadBlob(
    JSON.stringify(payload, null, 2),
    fileName ?? backupFileName(),
    "application/json;charset=utf-8"
  );
}

/** Genera y descarga el respaldo completo. Devuelve metadatos para el log. */
export async function createAndDownloadFullBackup(supabase: SupabaseClient) {
  const fileName = backupFileName();
  const payload = await buildFullBackup(supabase);
  downloadFullBackup(payload, fileName);
  return { fileName, record_counts: payload.record_counts, payload };
}

export function isFullBackupPayload(value: unknown): value is FullBackupPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.format !== BACKUP_FORMAT && !v.data) return false;
  if (!v.data || typeof v.data !== "object") return false;
  return true;
}

/** Acepta formato nuevo o el JSON anterior del panel. */
export function normalizeBackupPayload(raw: unknown): FullBackupPayload {
  if (!raw || typeof raw !== "object") {
    throw new Error("El archivo no es un respaldo válido.");
  }
  const v = raw as Record<string, unknown>;
  const data = (v.data ?? {}) as FullBackupPayload["data"];
  if (typeof data !== "object" || data === null) {
    throw new Error("El respaldo no tiene datos.");
  }

  // Formato viejo sin `format`
  const hasAnyTable = BACKUP_TABLES.some(
    (t) => Array.isArray((data as Record<string, unknown>)[t])
  );
  if (!hasAnyTable && v.format !== BACKUP_FORMAT) {
    throw new Error(
      "No reconocemos este archivo. Usá un respaldo generado desde este panel."
    );
  }

  return {
    format: BACKUP_FORMAT,
    exported_at:
      typeof v.exported_at === "string"
        ? v.exported_at
        : new Date().toISOString(),
    timezone:
      typeof v.timezone === "string"
        ? v.timezone
        : "America/Argentina/Buenos_Aires",
    note: typeof v.note === "string" ? v.note : "",
    record_counts:
      v.record_counts && typeof v.record_counts === "object"
        ? (v.record_counts as Record<string, number>)
        : {},
    data,
  };
}
