"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, Eye, FileImage, FileSpreadsheet, FileText, Plus, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/states";
import { PatientSearchSelect } from "@/components/admin/patient-search-select";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { cn, formatDate, formatFileSize, fullName } from "@/lib/utils";
import { validateUploadFile } from "@/lib/validations";
import {
  deleteFileRecord,
  getSignedFileUrl,
  listFiles,
  uploadPatientFile,
} from "@/services/clinical";
import type { FileCategory, PatientFile } from "@/types";
import { FILE_CATEGORY_LABELS } from "@/types";

const PAGE_SIZE = 20;

const CATEGORY_OPTIONS = Object.entries(FILE_CATEGORY_LABELS)
  .filter(([value]) => value !== "plan_alimentario")
  .map(([value, label]) => ({ value, label }));

const CATEGORY_ICON_BG: Record<FileCategory, string> = {
  antropometria: "bg-[var(--sky-soft)] text-[#4d6b76]",
  analisis: "bg-[var(--rose-soft)] text-[#9a6b74]",
  estudios: "bg-[var(--cream)] text-[#8a7355]",
  fotos: "bg-[var(--sage-soft)] text-[var(--sage-deep)]",
  plan_alimentario: "bg-[var(--sage-soft)] text-[var(--sage-deep)]",
  otros: "bg-[#f3f4f6] text-[var(--muted)]",
};

function fileTypeIcon(file: PatientFile) {
  const name = file.file_name.toLowerCase();
  const mime = (file.mime_type || "").toLowerCase();
  if (
    mime.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|heic)$/.test(name) ||
    file.category === "fotos"
  ) {
    return FileImage;
  }
  if (
    mime.includes("sheet") ||
    mime.includes("excel") ||
    mime.includes("csv") ||
    /\.(xlsx?|csv)$/.test(name)
  ) {
    return FileSpreadsheet;
  }
  return FileText;
}

export function FilesManager() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<FileCategory | "">("");
  const [page, setPage] = useState(1);
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PatientFile | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [uploadPatientId, setUploadPatientId] = useState("");
  const [uploadCategory, setUploadCategory] =
    useState<FileCategory>("otros");
  const [uploadDate, setUploadDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    const cacheKey = `files:${search}:${category}:${page}`;
    const cached = getCached<{ data: PatientFile[]; count: number }>(cacheKey);
    if (cached) {
      setFiles(cached.data);
      setCount(cached.count);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const supabase = createClient();
      const res = await listFiles(supabase, {
        page,
        pageSize: PAGE_SIZE,
        category: category || undefined,
        patientSearch: search || undefined,
      });
      setFiles(res.data);
      setCount(res.count);
      setCached(cacheKey, { data: res.data, count: res.count });
    } catch (err) {
      setError(friendlyError(err, "No se pudieron cargar los archivos."));
    } finally {
      setLoading(false);
    }
  }, [page, category, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const openUpload = () => {
    setUploadPatientId("");
    setUploadCategory("otros");
    setUploadDate(new Date().toISOString().slice(0, 10));
    setUploadNotes("");
    setUploadFile(null);
    setUploadOpen(true);
  };

  const submitUpload = async () => {
    if (!uploadPatientId) {
      toast.error("Seleccioná un paciente.");
      return;
    }
    if (!uploadFile) {
      toast.error("Seleccioná un archivo.");
      return;
    }
    const validation = validateUploadFile(uploadFile);
    if (validation) {
      toast.error(validation);
      return;
    }

    setSaving(true);
    try {
      const supabase = createClient();
      await uploadPatientFile(supabase, {
        patientId: uploadPatientId,
        category: uploadCategory,
        file: uploadFile,
        fileDate: uploadDate,
        notes: uploadNotes || null,
      });
      toast.success("Archivo subido");
      setUploadOpen(false);
      setPage(1);
      invalidateCache("files");
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo subir el archivo."));
    } finally {
      setSaving(false);
    }
  };

  const viewFile = async (file: PatientFile) => {
    setBusyId(file.id);
    try {
      const supabase = createClient();
      const url = await getSignedFileUrl(supabase, file.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo generar el enlace."));
    } finally {
      setBusyId(null);
    }
  };

  const downloadFile = async (file: PatientFile) => {
    setBusyId(file.id);
    try {
      const supabase = createClient();
      const url = await getSignedFileUrl(supabase, file.storage_path, 120);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Error al descargar");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = file.file_name;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo descargar el archivo."));
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const supabase = createClient();
      await deleteFileRecord(
        supabase,
        deleteTarget.id,
        deleteTarget.storage_path
      );
      toast.success("Archivo eliminado");
      setDeleteTarget(null);
      invalidateCache("files");
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo eliminar el archivo."));
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Archivos"
        description="Documentos privados por paciente (acceso solo con URL firmada)."
        actions={
          <Button onClick={openUpload}>
            <Upload className="h-4 w-4" />
            Subir archivo
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              className="pl-9"
              placeholder="Buscar por paciente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  setSearch(query);
                }
              }}
            />
          </div>
          <Select
            options={[{ value: "", label: "Todas las categorías" }, ...CATEGORY_OPTIONS]}
            value={category}
            onChange={(e) => {
              setPage(1);
              setCategory(e.target.value as FileCategory | "");
            }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              setPage(1);
              setSearch(query);
            }}
          >
            Filtrar
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="Error al cargar"
          description={error}
          action={
            <Button variant="outline" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      ) : files.length === 0 ? (
        <EmptyState
          title="Sin archivos"
          description="No hay archivos con los filtros actuales."
          action={
            <Button onClick={openUpload}>
              <Plus className="h-4 w-4" />
              Subir archivo
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {files.map((f) => {
              const Icon = fileTypeIcon(f);
              return (
              <div
                key={f.id}
                className="glass-card hover-lift flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                      CATEGORY_ICON_BG[f.category]
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--foreground)]">
                      {f.file_name}
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--muted)]">
                      {f.patient
                        ? fullName(f.patient.first_name, f.patient.last_name)
                        : "—"}
                      {" · "}
                      {formatDate(f.file_date)}
                      {" · "}
                      {formatFileSize(f.file_size)}
                    </p>
                    {f.notes ? (
                      <p className="mt-1 text-xs text-[var(--muted)]">{f.notes}</p>
                    ) : null}
                    <div className="mt-2">
                      <Badge tone="soft">
                        {FILE_CATEGORY_LABELS[f.category]}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 justify-end gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Ver"
                    loading={busyId === f.id}
                    onClick={() => void viewFile(f)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Descargar"
                    onClick={() => void downloadFile(f)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label="Eliminar"
                    onClick={() => setDeleteTarget(f)}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
            <span>
              {count} archivo{count === 1 ? "" : "s"} · Página {page} de{" "}
              {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}

      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Subir archivo"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void submitUpload()}>
              Subir
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <PatientSearchSelect
            required
            value={uploadPatientId}
            onChange={(id) => setUploadPatientId(id)}
          />
          <Select
            label="Categoría"
            required
            options={CATEGORY_OPTIONS}
            value={uploadCategory}
            onChange={(e) =>
              setUploadCategory(e.target.value as FileCategory)
            }
          />
          <Input
            label="Fecha del documento"
            type="date"
            value={uploadDate}
            onChange={(e) => setUploadDate(e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              Archivo <span className="text-red-600">*</span>
            </label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx"
              className="block w-full text-sm"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-[var(--muted)]">
              PDF (5 MB), JPG/PNG (3 MB), XLSX (2 MB). Bucket privado.
            </p>
          </div>
          <Textarea
            label="Notas"
            value={uploadNotes}
            onChange={(e) => setUploadNotes(e.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar archivo"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={saving}
              onClick={() => void confirmDelete()}
            >
              Eliminar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--muted)]">
          ¿Eliminar <strong className="text-[var(--foreground)]">{deleteTarget?.file_name}</strong>? Se borrará del
          almacenamiento y de la base de datos.
        </p>
      </Modal>
    </div>
  );
}
