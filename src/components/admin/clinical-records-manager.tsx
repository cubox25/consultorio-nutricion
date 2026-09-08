"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/states";
import {
  PatientSearchSelect,
} from "@/components/admin/patient-search-select";
import { RescheduleAfterEvolutionModal } from "@/components/admin/reschedule-after-evolution-modal";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import {
  bmiClassification,
  calculateBmi,
  formatDate,
  fullName,
} from "@/lib/utils";
import {
  createClinicalRecord,
  getClinicalRecord,
  listClinicalRecords,
} from "@/services/clinical";
import {
  clinicalRecordSchema,
  type ClinicalRecordFormValues,
} from "@/lib/validations";
import type { ClinicalRecord, Patient } from "@/types";
import { getPatient } from "@/services/patients";

const PAGE_SIZE = 20;

export function ClinicalRecordsManager() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<ClinicalRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [reschedulePatient, setReschedulePatient] = useState<{
    id: string;
    name: string;
    reason: string | null;
  } | null>(null);

  const form = useForm<ClinicalRecordFormValues>({
    resolver: zodResolver(clinicalRecordSchema) as Resolver<ClinicalRecordFormValues>,
    defaultValues: {
      patient_id: "",
      appointment_id: null,
      record_date: new Date().toISOString().slice(0, 10),
      record_time: "",
      reason: "",
      evolution: "",
      weight_kg: null,
      height_cm: null,
    },
  });

  const watchWeight = form.watch("weight_kg");
  const watchHeight = form.watch("height_cm");
  const liveBmi = useMemo(
    () => calculateBmi(Number(watchWeight) || null, Number(watchHeight) || null),
    [watchWeight, watchHeight]
  );
  const liveBmiClass = useMemo(() => bmiClassification(liveBmi), [liveBmi]);

  const load = useCallback(async () => {
    const cacheKey = `clinical:${search}:${page}`;
    const cached = getCached<{ data: ClinicalRecord[]; count: number }>(cacheKey);
    if (cached) {
      setRecords(cached.data);
      setCount(cached.count);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const supabase = createClient();
      const { data, count: total } = await listClinicalRecords(supabase, {
        patientSearch: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setRecords(data);
      setCount(total);
      setCached(cacheKey, { data, count: total });
    } catch (err) {
      setError(friendlyError(err, "No se pudieron cargar las historias."));
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    form.reset({
      patient_id: "",
      appointment_id: null,
      record_date: new Date().toISOString().slice(0, 10),
      record_time: "",
      reason: "",
      evolution: "",
      weight_kg: null,
      height_cm: null,
    });
    setCreateOpen(true);
  };

  const openDetail = async (record: ClinicalRecord) => {
    setBusyId(record.id);
    try {
      const supabase = createClient();
      const full = await getClinicalRecord(supabase, record.id);
      setDetail(full);
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo cargar el detalle."));
    } finally {
      setBusyId(null);
    }
  };

  const onSubmit = form.handleSubmit(
    async (values) => {
      setSaving(true);
      try {
        const supabase = createClient();
        const weight =
          values.weight_kg != null && Number.isFinite(Number(values.weight_kg))
            ? Number(values.weight_kg)
            : null;
        const height =
          values.height_cm != null && Number.isFinite(Number(values.height_cm))
            ? Number(values.height_cm)
            : null;
        const bmi = calculateBmi(weight, height);
        const classification = bmiClassification(bmi);

        await createClinicalRecord(supabase, {
          patient_id: values.patient_id,
          appointment_id: values.appointment_id ?? null,
          record_date: values.record_date,
          record_time: values.record_time || null,
          reason: values.reason || null,
          evolution: values.evolution || null,
          weight_kg: weight,
          height_cm: height,
          bmi,
          bmi_classification: classification,
        });
        toast.success("Evolución registrada");
        setCreateOpen(false);
        invalidateCache("clinical");
        await load();

        let name = "el paciente";
        try {
          const patient = (await getPatient(
            supabase,
            values.patient_id
          )) as Patient;
          name = fullName(patient.first_name, patient.last_name);
        } catch {
          // si falla el nombre, igual ofrecemos reagendar
        }
        setReschedulePatient({
          id: values.patient_id,
          name,
          reason: values.reason || "Control / seguimiento",
        });
        setRescheduleOpen(true);
      } catch (err) {
        toast.error(friendlyError(err, "No se pudo guardar la evolución."));
      } finally {
        setSaving(false);
      }
    },
    () => {
      toast.error("Revisá el paciente, la fecha y los datos antes de guardar.");
    }
  );

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Historias clínicas"
        description="Evoluciones clínicas. Cada registro se agrega como una nueva entrada."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nueva evolución
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              className="pl-9"
              placeholder="Filtrar por paciente (nombre, apellido o DNI)…"
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
        <div className="space-y-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--cream)]/40 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
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
      ) : records.length === 0 ? (
        <EmptyState
          title="Sin registros"
          description={
            search
              ? "No hay evoluciones para ese paciente."
              : "Todavía no hay historias clínicas cargadas."
          }
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nueva evolución
            </Button>
          }
        />
      ) : (
        <>
          <div className="relative ml-2 space-y-0 border-l-2 border-[var(--sage-soft)] pl-6">
            {records.map((r) => (
              <div key={r.id} className="relative pb-5 last:pb-0">
                <span
                  className="absolute -left-[1.9rem] top-5 h-3 w-3 rounded-full border-2 border-white bg-[var(--sage)] shadow-[var(--shadow-soft)]"
                  aria-hidden
                />
                <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-soft)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                        {formatDate(r.record_date)}
                      </p>
                      <p className="mt-1 font-medium text-[var(--foreground)]">
                        {r.patient
                          ? fullName(r.patient.first_name, r.patient.last_name)
                          : "—"}
                      </p>
                      <p className="mt-1 text-sm text-[var(--sage-deep)]">
                        {r.reason || "Sin motivo"}
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">
                        {r.evolution || "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void openDetail(r)}
                      loading={busyId === r.id}
                      aria-label="Ver detalle"
                    >
                      <Eye className="h-4 w-4" />
                      Ver
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
              <span>
                {count} registro{count === 1 ? "" : "s"} · Página {page} de{" "}
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
          ) : null}
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nueva evolución clínica"
        className="sm:max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void onSubmit()}>
              Guardar (nuevo registro)
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <PatientSearchSelect
            required
            value={form.watch("patient_id")}
            onChange={(id) =>
              form.setValue("patient_id", id, { shouldValidate: true })
            }
            error={form.formState.errors.patient_id?.message}
          />
          <Input
            label="Fecha"
            type="date"
            required
            error={form.formState.errors.record_date?.message}
            {...form.register("record_date")}
          />
          <Input
            label="Hora"
            type="time"
            hint="Opcional"
            error={form.formState.errors.record_time?.message}
            {...form.register("record_time")}
          />
          <Input label="Motivo" {...form.register("reason")} />
          <Textarea label="Evolución" {...form.register("evolution")} />
          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--background)] p-4">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Datos antropométricos
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label="Peso (kg)"
                type="number"
                step="0.1"
                inputMode="decimal"
                error={form.formState.errors.weight_kg?.message}
                {...form.register("weight_kg")}
              />
              <Input
                label="Talla (cm)"
                type="number"
                step="0.1"
                inputMode="decimal"
                error={form.formState.errors.height_cm?.message}
                {...form.register("height_cm")}
              />
              <Input
                label="IMC"
                value={liveBmi != null ? String(liveBmi) : "—"}
                readOnly
              />
              <Input
                label="Clasificación IMC"
                value={liveBmiClass ?? "—"}
                readOnly
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Detalle de evolución"
        className="sm:max-w-2xl"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setDetail(null)}>
              Cerrar
            </Button>
          </div>
        }
      >
        {detail ? (
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-[var(--muted)]">Paciente: </span>
              <strong className="text-[var(--foreground)]">
                {detail.patient
                  ? fullName(
                      detail.patient.first_name,
                      detail.patient.last_name
                    )
                  : "—"}
              </strong>
            </p>
            <p>
              <span className="text-[var(--muted)]">Fecha: </span>
              {formatDate(detail.record_date)}
            </p>
            {[
              ["Motivo", detail.reason],
              ["Evolución", detail.evolution],
            ].map(([label, value]) =>
              value ? (
                <div key={String(label)}>
                  <p className="font-medium text-[var(--foreground)]">{label}</p>
                  <p className="whitespace-pre-wrap text-[var(--muted)]">{value}</p>
                </div>
              ) : null
            )}
            {(detail.weight_kg || detail.height_cm || detail.bmi) && (
              <div>
                <p className="font-medium text-[var(--foreground)]">Antropometría</p>
                <p className="text-[var(--muted)]">
                  {[
                    detail.weight_kg != null ? `Peso ${detail.weight_kg} kg` : null,
                    detail.height_cm != null ? `Talla ${detail.height_cm} cm` : null,
                    detail.bmi != null ? `IMC ${detail.bmi}` : null,
                    detail.bmi_classification || null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {reschedulePatient ? (
        <RescheduleAfterEvolutionModal
          open={rescheduleOpen}
          onClose={() => {
            setRescheduleOpen(false);
            setReschedulePatient(null);
          }}
          patientId={reschedulePatient.id}
          patientName={reschedulePatient.name}
          suggestedReason={reschedulePatient.reason}
        />
      ) : null}
    </div>
  );
}
