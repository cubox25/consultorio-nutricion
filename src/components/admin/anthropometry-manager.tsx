"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/states";
import { PatientSearchSelect } from "@/components/admin/patient-search-select";
import {
  AnthropometryPdfPanel,
  patientLabelFromDoc,
} from "@/components/admin/anthropometry-pdf-panel";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { formatDateTime, fullName } from "@/lib/utils";
import { listAnthropometryDocuments } from "@/services/clinical";
import type { AnthropometryDocument } from "@/types";

export function AnthropometryManager() {
  const [patientId, setPatientId] = useState("");
  const [patientName, setPatientName] = useState("");
  const [docs, setDocs] = useState<AnthropometryDocument[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const supabase = createClient();
      const res = await listAnthropometryDocuments(supabase, { pageSize: 40 });
      setDocs(res.data);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudieron cargar los PDFs."));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Antropometría"
        description="Subí uno o varios PDFs de antropometría por paciente. Se pueden ver, descargar, reemplazar o eliminar."
      />

      <Card>
        <CardContent className="space-y-4 p-5 sm:p-6">
          <PatientSearchSelect
            label="Paciente"
            value={patientId}
            onChange={(id, patient) => {
              setPatientId(id);
              setPatientName(
                patient ? fullName(patient.first_name, patient.last_name) : ""
              );
            }}
          />
          {patientId ? (
            <AnthropometryPdfPanel
              patientId={patientId}
              patientName={patientName || undefined}
              onChanged={() => void loadList()}
            />
          ) : (
            <EmptyState
              title="Elegí un paciente"
              description="Seleccioná a quién corresponde el PDF para subirlo o verlo."
            />
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-base font-semibold text-[var(--foreground)]">
          PDFs cargados
        </h2>
        {loadingList ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Todavía no hay antropometrías en PDF.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-soft)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--sage-soft)]/50 text-left text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Paciente</th>
                  <th className="px-4 py-3">Archivo</th>
                  <th className="px-4 py-3">Fecha de carga</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 font-medium">
                      {patientLabelFromDoc(doc)}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {doc.file_name}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {formatDateTime(doc.updated_at || doc.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPatientId(doc.patient_id);
                          setPatientName(patientLabelFromDoc(doc));
                        }}
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
