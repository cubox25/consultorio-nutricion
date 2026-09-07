"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  Eye,
  FileUp,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, Spinner } from "@/components/ui/states";
import { friendlyError } from "@/lib/errors";
import { cn, formatDateTime, formatFileSize, fullName } from "@/lib/utils";
import { validateAnthropometryPdf } from "@/lib/validations";
import type { AnthropometryDocument } from "@/types";

type DocEntry = {
  document: AnthropometryDocument;
  signedUrl: string | null;
};

export function patientLabelFromDoc(doc: AnthropometryDocument) {
  if (doc.patient) {
    return fullName(doc.patient.first_name, doc.patient.last_name);
  }
  return "Paciente";
}

async function readApiError(res: Response) {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error || `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export function AnthropometryPdfPanel({
  patientId,
  patientName,
  onChanged,
}: {
  patientId: string;
  patientName?: string;
  onChanged?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [entries, setEntries] = useState<DocEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(true);
  const [replaceDocId, setReplaceDocId] = useState<string | null>(null);

  const selected = entries.find((e) => e.document.id === selectedId) ?? entries[0] ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/anthropometry?patientId=${encodeURIComponent(patientId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(await readApiError(res));
      const json = (await res.json()) as {
        documents?: DocEntry[];
        document: AnthropometryDocument | null;
        signedUrl: string | null;
      };

      const next =
        json.documents ??
        (json.document
          ? [{ document: json.document, signedUrl: json.signedUrl }]
          : []);

      setEntries(next);
      setSelectedId((prev) => {
        if (prev && next.some((e) => e.document.id === prev)) return prev;
        return next[0]?.document.id ?? null;
      });
      if (next.length) setViewerOpen(true);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo cargar la antropometría."));
      setEntries([]);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pickFile = (replaceId: string | null) => {
    setReplaceDocId(replaceId);
    inputRef.current?.click();
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const invalid = validateAnthropometryPdf(file);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setSaving(true);
    try {
      const body = new FormData();
      body.set("patientId", patientId);
      body.set("file", file, file.name || "antropometria.pdf");
      if (replaceDocId) body.set("documentId", replaceDocId);

      const res = await fetch("/api/admin/anthropometry", {
        method: "POST",
        body,
      });
      if (!res.ok) throw new Error(await readApiError(res));

      const json = (await res.json()) as {
        document: AnthropometryDocument;
        signedUrl: string | null;
      };

      toast.success(replaceDocId ? "PDF reemplazado" : "PDF subido");
      setSelectedId(json.document.id);
      setViewerOpen(true);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo guardar el PDF."));
    } finally {
      setSaving(false);
      setReplaceDocId(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const downloadPdf = async (doc: AnthropometryDocument) => {
    try {
      const res = await fetch(
        `/api/admin/anthropometry?patientId=${encodeURIComponent(patientId)}&documentId=${encodeURIComponent(doc.id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(await readApiError(res));
      const json = (await res.json()) as { signedUrl: string | null };
      if (!json.signedUrl) throw new Error("No hay URL de descarga.");
      const a = document.createElement("a");
      a.href = json.signedUrl;
      a.download = doc.file_name || "antropometria.pdf";
      a.target = "_blank";
      a.rel = "noreferrer";
      a.click();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo descargar el PDF."));
    }
  };

  const removePdf = async (doc: AnthropometryDocument) => {
    if (
      !window.confirm(
        "¿Eliminar este PDF de antropometría? Esta acción no se puede deshacer."
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/admin/anthropometry?patientId=${encodeURIComponent(patientId)}&documentId=${encodeURIComponent(doc.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error(await readApiError(res));
      toast.success("PDF eliminado");
      if (selectedId === doc.id) setSelectedId(null);
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo eliminar el PDF."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-[var(--muted)]">
        <Spinner />
        <span className="text-sm">Cargando antropometría…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {patientName ? (
          <p className="text-sm text-[var(--muted)]">
            Paciente:{" "}
            <strong className="text-[var(--foreground)]">{patientName}</strong>
          </p>
        ) : (
          <span />
        )}
        <Button loading={saving} onClick={() => pickFile(null)}>
          <Upload className="h-4 w-4" />
          {entries.length ? "Subir otra antropometría" : "Subir antropometría PDF"}
        </Button>
      </div>

      {!entries.length ? (
        <EmptyState
          title="No hay antropometría cargada"
          description="Subí el PDF del estudio. Podés cargar varios a lo largo del tiempo."
          action={
            <Button loading={saving} onClick={() => pickFile(null)}>
              <Upload className="h-4 w-4" />
              Subir antropometría PDF
            </Button>
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {entries.map(({ document: doc }) => {
              const isActive = selected?.document.id === doc.id;
              return (
                <Card
                  key={doc.id}
                  className={cn(
                    isActive && "ring-2 ring-[var(--sage)]/40"
                  )}
                >
                  <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => {
                        setSelectedId(doc.id);
                        setViewerOpen(true);
                      }}
                    >
                      <p className="truncate font-semibold text-[var(--foreground)]">
                        {doc.file_name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        Cargado el {formatDateTime(doc.updated_at || doc.created_at)}
                        {doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ""}
                      </p>
                    </button>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedId(doc.id);
                          setViewerOpen((v) => (isActive ? !v : true));
                        }}
                      >
                        <Eye className="h-4 w-4" />
                        {isActive && viewerOpen ? "Ocultar" : "Ver"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void downloadPdf(doc)}
                      >
                        <Download className="h-4 w-4" />
                        Descargar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={saving}
                        onClick={() => pickFile(doc.id)}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Reemplazar
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        loading={saving}
                        onClick={() => void removePdf(doc)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Eliminar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {viewerOpen && selected?.signedUrl ? (
            <Card>
              <CardContent className="p-2 sm:p-3">
                <p className="mb-2 truncate px-1 text-xs text-[var(--muted)]">
                  Vista previa: {selected.document.file_name}
                </p>
                <iframe
                  title={`Vista previa ${selected.document.file_name}`}
                  src={`${selected.signedUrl}#view=FitH`}
                  className="h-[70vh] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white"
                />
              </CardContent>
            </Card>
          ) : null}

          {viewerOpen && selected && !selected.signedUrl ? (
            <p className="text-sm text-[var(--muted)]">
              No se pudo generar la vista previa. Probá descargar el archivo.
            </p>
          ) : null}
        </>
      )}

      {!entries.length ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            loading={saving}
            onClick={() => pickFile(null)}
            className="sm:hidden"
          >
            <FileUp className="h-4 w-4" />
            Elegir PDF
          </Button>
        </div>
      ) : null}
    </div>
  );
}
