"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, Skeleton, Spinner } from "@/components/ui/states";
import {
  PatientFormFields,
  patientFormToPayload,
} from "@/components/admin/patients-manager";
import { AnthropometryPdfPanel } from "@/components/admin/anthropometry-pdf-panel";
import { PatientPhotoAvatar } from "@/components/admin/patient-photo-avatar";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import {
  ageFromBirthDate,
  bmiClassification,
  calculateBmi,
  clinicalHistoryLabel,
  formatDate,
  formatFileSize,
  formatTime,
  fullName,
} from "@/lib/utils";
import { getPatient, updatePatient } from "@/services/patients";
import { listAppointments } from "@/services/appointments";
import {
  createClinicalRecord,
  listClinicalRecords,
  listFiles,
} from "@/services/clinical";
import {
  clinicalRecordSchema,
  patientSchema,
  type ClinicalRecordFormValues,
  type PatientFormValues,
} from "@/lib/validations";
import type {
  Appointment,
  ClinicalRecord,
  Patient,
  PatientFile,
} from "@/types";
import {
  APPOINTMENT_STATUS_LABELS,
  FILE_CATEGORY_LABELS,
  SEX_LABELS,
} from "@/types";

type TabId =
  | "datos"
  | "historial"
  | "turnos"
  | "antropometria"
  | "archivos";

const TABS: { id: TabId; label: string }[] = [
  { id: "datos", label: "Resumen" },
  { id: "historial", label: "Historia clínica" },
  { id: "turnos", label: "Turnos" },
  { id: "antropometria", label: "Antropometría" },
  { id: "archivos", label: "Archivos" },
];

function alertsToFormValue(alerts?: string[] | null) {
  return (alerts ?? []).filter(Boolean).join(", ");
}

export function PatientDetail({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("datos");
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clinicalOpen, setClinicalOpen] = useState(false);

  const patientForm = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema) as Resolver<PatientFormValues>,
  });

  const clinicalForm = useForm<ClinicalRecordFormValues>({
    resolver: zodResolver(clinicalRecordSchema) as Resolver<ClinicalRecordFormValues>,
  });

  const watchWeight = clinicalForm.watch("weight_kg");
  const watchHeight = clinicalForm.watch("height_cm");
  const liveBmi = useMemo(
    () => calculateBmi(Number(watchWeight) || null, Number(watchHeight) || null),
    [watchWeight, watchHeight]
  );
  const liveBmiClass = useMemo(() => bmiClassification(liveBmi), [liveBmi]);

  const loadPatient = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const data = await getPatient(supabase, patientId);
      setPatient(data);
      patientForm.reset({
        first_name: data.first_name,
        last_name: data.last_name,
        dni: data.dni ?? "",
        birth_date: data.birth_date ?? "",
        sex: data.sex ?? "no_especificado",
        phone: data.phone ?? "",
        email: data.email ?? "",
        address: data.address ?? "",
        occupation: data.occupation ?? "",
        emergency_contact_name: data.emergency_contact_name ?? "",
        emergency_contact_phone: data.emergency_contact_phone ?? "",
        notes: data.notes ?? "",
        photo_url: data.photo_url ?? "",
        clinical_history_number: data.clinical_history_number ?? "",
        health_insurance: data.health_insurance ?? "",
        marital_status: data.marital_status ?? "",
        clinical_alerts: alertsToFormValue(data.clinical_alerts),
        communication_consent: data.communication_consent,
      });
    } catch (err) {
      setError(friendlyError(err, "No se pudo cargar la ficha."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on patientId change
  }, [patientId]);

  const loadTabData = useCallback(async () => {
    setTabLoading(true);
    try {
      const supabase = createClient();
      if (tab === "historial") {
        const res = await listClinicalRecords(supabase, {
          patientId,
          pageSize: 50,
        });
        setRecords(res.data);
      } else if (tab === "turnos") {
        setAppointments(await listAppointments(supabase, { patientId }));
      } else if (tab === "archivos") {
        const res = await listFiles(supabase, { patientId, pageSize: 50 });
        setFiles(res.data);
      }
    } catch (err) {
      toast.error(friendlyError(err, "No se pudieron cargar los datos."));
    } finally {
      setTabLoading(false);
    }
  }, [tab, patientId]);

  useEffect(() => {
    void loadPatient();
  }, [loadPatient]);

  useEffect(() => {
    if (tab !== "datos" && tab !== "antropometria") void loadTabData();
  }, [tab, loadTabData]);

  const savePatient = patientForm.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const updated = await updatePatient(
        supabase,
        patientId,
        patientFormToPayload(values)
      );
      setPatient(updated);
      toast.success("Datos actualizados");
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo guardar."));
    } finally {
      setSaving(false);
    }
  });

  const openClinical = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    clinicalForm.reset({
      patient_id: patientId,
      appointment_id: null,
      record_date: now.toISOString().slice(0, 10),
      record_time: `${hh}:${mm}`,
      reason: "",
      evolution: "",
      weight_kg: null,
      height_cm: null,
    });
    setClinicalOpen(true);
  };

  const submitClinical = clinicalForm.handleSubmit(
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
        setClinicalOpen(false);
        setTab("historial");
        await loadTabData();
      } catch (err) {
        console.error("[clinical] save", err);
        toast.error(friendlyError(err, "No se pudo guardar la evolución."));
      } finally {
        setSaving(false);
      }
    },
    () => {
      toast.error("Revisá fecha, peso o talla antes de guardar.");
    }
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <EmptyState
        title="Paciente no encontrado"
        description={error ?? "La ficha no existe o no tenés acceso."}
        action={
          <Link href="/admin/pacientes">
            <Button variant="outline">Volver al listado</Button>
          </Link>
        }
      />
    );
  }

  const age = ageFromBirthDate(patient.birth_date);
  const sexLabel =
    patient.sex && patient.sex !== "no_especificado"
      ? SEX_LABELS[patient.sex]
      : null;
  const ageSex = [age != null ? `${age} años` : null, sexLabel]
    .filter(Boolean)
    .join(" · ");
  const hc = clinicalHistoryLabel(patient.clinical_history_number, patient.id);
  const alerts = (patient.clinical_alerts ?? []).filter(Boolean);

  const headerFacts: { label: string; value: string }[] = [
    { label: "HC", value: hc },
    { label: "DNI", value: patient.dni || "—" },
    { label: "Edad / Sexo", value: ageSex || "—" },
    { label: "Teléfono", value: patient.phone || "—" },
  ];
  if (patient.address) {
    headerFacts.push({ label: "Domicilio", value: patient.address });
  }
  if (patient.health_insurance) {
    headerFacts.push({ label: "Cobertura", value: patient.health_insurance });
  }
  if (patient.marital_status) {
    headerFacts.push({ label: "Estado civil", value: patient.marital_status });
  }

  return (
    <div className="fade-in">
      <div className="mb-6">
        <Link
          href="/admin/pacientes"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--sage-deep)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a pacientes
        </Link>
      </div>

      <div className="mb-8 rounded-[var(--radius)] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-soft)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 flex-1 gap-4 sm:gap-5">
            <PatientPhotoAvatar
              patientId={patient.id}
              firstName={patient.first_name}
              lastName={patient.last_name}
              photoUrl={patient.photo_url}
              onUpdated={(updated) => {
                setPatient(updated);
                patientForm.setValue("photo_url", updated.photo_url ?? "");
              }}
            />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--pink)]">
                Ficha del paciente
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
                {fullName(patient.first_name, patient.last_name)}
              </h1>
              {!patient.is_active ? (
                <p className="mt-2 text-sm text-[var(--pink)]">Paciente archivado</p>
              ) : null}

              {alerts.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {alerts.map((alert) => (
                    <Badge key={alert} tone="brand">
                      {alert}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {headerFacts.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[1rem] border border-[var(--border)] bg-[var(--background)] px-4 py-3"
                  >
                    <p className="text-xs text-[var(--muted)]">{item.label}</p>
                    <p className="mt-1 break-words text-sm font-medium tracking-tight">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button size="sm" variant="secondary" onClick={openClinical}>
              <Plus className="h-4 w-4" />
              Evolución
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setTab("antropometria")}
            >
              <Plus className="h-4 w-4" />
              Antropometría
            </Button>
          </div>
        </div>
      </div>

      <Tabs
        className="mb-6"
        items={TABS.map((t) => ({ id: t.id, label: t.label }))}
        value={tab}
        onChange={(id) => setTab(id as TabId)}
      />

      {tab === "datos" ? (
        <Card>
          <CardHeader>
            <CardTitle>Resumen y datos personales</CardTitle>
          </CardHeader>
          <CardContent>
            <PatientFormFields form={patientForm} />
            <div className="mt-5 flex justify-end">
              <Button loading={saving} onClick={() => void savePatient()}>
                Guardar cambios
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : tabLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === "historial" ? (
        records.length === 0 ? (
          <EmptyState
            title="Sin evoluciones"
            description="Todavía no hay registros clínicos para este paciente."
            action={
              <Button onClick={openClinical}>
                <Plus className="h-4 w-4" />
                Nueva evolución
              </Button>
            }
          />
        ) : (
          <div className="relative ml-2 space-y-0 border-l-2 border-[var(--sage-soft)] pl-6">
            {records.map((r) => (
              <div key={r.id} className="relative pb-4 last:pb-0">
                <span
                  className="absolute -left-[1.9rem] top-5 h-3 w-3 rounded-full border-2 border-white bg-[var(--sage)]"
                  aria-hidden
                />
                <Card className="shadow-[var(--shadow-soft)]">
                  <CardContent className="p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-[var(--foreground)]">
                        {formatDate(r.record_date)}
                        {r.record_time
                          ? ` · ${String(r.record_time).slice(0, 5)}`
                          : ""}
                      </p>
                      {r.reason ? <Badge tone="brand">{r.reason}</Badge> : null}
                    </div>
                    {r.evolution ? (
                      <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">
                        {r.evolution}
                      </p>
                    ) : (
                      <p className="text-sm text-[var(--muted)]">Sin evolución escrita</p>
                    )}
                    {(r.weight_kg || r.height_cm || r.bmi) && (
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {[
                          r.weight_kg != null ? `Peso ${r.weight_kg} kg` : null,
                          r.height_cm != null ? `Talla ${r.height_cm} cm` : null,
                          r.bmi != null
                            ? `IMC ${r.bmi}${
                                r.bmi_classification
                                  ? ` (${r.bmi_classification})`
                                  : ""
                              }`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )
      ) : tab === "turnos" ? (
        appointments.length === 0 ? (
          <EmptyState
            title="Sin turnos"
            description="Este paciente no tiene turnos registrados."
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-soft)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--sage-soft)]/50 text-left text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Horario</th>
                  <th className="px-4 py-3">Consultorio</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {appointments.map((a) => (
                  <tr key={a.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">{formatDate(a.appointment_date)}</td>
                    <td className="px-4 py-3">
                      {formatTime(a.start_time)} – {formatTime(a.end_time)}
                    </td>
                    <td className="px-4 py-3">{a.clinic?.name ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status}>
                        {APPOINTMENT_STATUS_LABELS[a.status]}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{a.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : tab === "antropometria" ? (
        <AnthropometryPdfPanel
          patientId={patientId}
          patientName={fullName(patient.first_name, patient.last_name)}
        />
      ) : files.length === 0 ? (
        <EmptyState
          title="Sin archivos"
          description="No hay archivos asociados. Podés subirlos desde Archivos."
          action={
            <Link href="/admin/archivos">
              <Button variant="outline">Ir a archivos</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {files.map((f) => (
            <Card key={f.id} className="shadow-[var(--shadow-soft)]">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-medium text-[var(--foreground)]">{f.file_name}</p>
                  <p className="text-xs text-[var(--muted)]">
                    {FILE_CATEGORY_LABELS[f.category]} · {formatDate(f.file_date)}{" "}
                    · {formatFileSize(f.file_size)}
                  </p>
                </div>
                <Link href="/admin/archivos">
                  <Button size="sm" variant="outline">
                    Gestionar
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={clinicalOpen}
        onClose={() => setClinicalOpen(false)}
        title="Nueva evolución"
        className="sm:max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setClinicalOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void submitClinical()}>
              Guardar evolución
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Fecha"
              type="date"
              required
              error={clinicalForm.formState.errors.record_date?.message}
              {...clinicalForm.register("record_date")}
            />
            <Input
              label="Hora"
              type="time"
              hint="Opcional"
              error={clinicalForm.formState.errors.record_time?.message}
              {...clinicalForm.register("record_time")}
            />
          </div>

          <Input
            label="Problema / Motivo de consulta"
            placeholder="CONTROL POR NUTRICIÓN"
            error={clinicalForm.formState.errors.reason?.message}
            {...clinicalForm.register("reason")}
          />

          <Textarea
            label="Evolución"
            rows={6}
            error={clinicalForm.formState.errors.evolution?.message}
            {...clinicalForm.register("evolution")}
          />

          <div className="rounded-[1rem] border border-[var(--border)] bg-[var(--background)] p-4">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Datos antropométricos
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              El IMC y la clasificación se calculan solos al cargar peso y talla.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input
                label="Peso (kg)"
                type="number"
                step="0.1"
                inputMode="decimal"
                error={clinicalForm.formState.errors.weight_kg?.message}
                {...clinicalForm.register("weight_kg")}
              />
              <Input
                label="Talla (cm)"
                type="number"
                step="0.1"
                inputMode="decimal"
                error={clinicalForm.formState.errors.height_cm?.message}
                {...clinicalForm.register("height_cm")}
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
    </div>
  );
}
