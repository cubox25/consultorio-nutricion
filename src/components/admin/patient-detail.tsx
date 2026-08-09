"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, Skeleton, Spinner } from "@/components/ui/states";
import { PatientFormFields } from "@/components/admin/patients-manager";
import { emptyToNull } from "@/components/admin/patient-search-select";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import {
  calculateBmi,
  formatDate,
  formatFileSize,
  formatTime,
  fullName,
} from "@/lib/utils";
import { getPatient, updatePatient } from "@/services/patients";
import { listAppointments } from "@/services/appointments";
import {
  createAnthropometry,
  createClinicalRecord,
  createNutritionPlan,
  listAnthropometry,
  listClinicalRecords,
  listFiles,
  listNutritionPlans,
} from "@/services/clinical";
import {
  anthropometricSchema,
  clinicalRecordSchema,
  nutritionPlanSchema,
  patientSchema,
  type AnthropometricFormValues,
  type ClinicalRecordFormValues,
  type NutritionPlanFormValues,
  type PatientFormValues,
} from "@/lib/validations";
import type {
  AnthropometricRecord,
  Appointment,
  ClinicalRecord,
  NutritionPlan,
  Patient,
  PatientFile,
} from "@/types";
import {
  APPOINTMENT_STATUS_LABELS,
  FILE_CATEGORY_LABELS,
} from "@/types";

type TabId =
  | "datos"
  | "historial"
  | "turnos"
  | "planes"
  | "antropometria"
  | "archivos";

const TABS: { id: TabId; label: string }[] = [
  { id: "datos", label: "Resumen" },
  { id: "historial", label: "Historia clínica" },
  { id: "turnos", label: "Turnos" },
  { id: "antropometria", label: "Antropometría" },
  { id: "planes", label: "Planes alimentarios" },
  { id: "archivos", label: "Archivos" },
];

export function PatientDetail({ patientId }: { patientId: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("datos");
  const [records, setRecords] = useState<ClinicalRecord[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [plans, setPlans] = useState<NutritionPlan[]>([]);
  const [anthro, setAnthro] = useState<AnthropometricRecord[]>([]);
  const [files, setFiles] = useState<PatientFile[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [clinicalOpen, setClinicalOpen] = useState(false);
  const [anthroOpen, setAnthroOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);

  const patientForm = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema) as Resolver<PatientFormValues>,
  });

  const clinicalForm = useForm<ClinicalRecordFormValues>({
    resolver: zodResolver(clinicalRecordSchema) as Resolver<ClinicalRecordFormValues>,
  });

  const anthroForm = useForm<AnthropometricFormValues>({
    resolver: zodResolver(anthropometricSchema) as Resolver<AnthropometricFormValues>,
  });

  const planForm = useForm<NutritionPlanFormValues>({
    resolver: zodResolver(nutritionPlanSchema) as Resolver<NutritionPlanFormValues>,
  });

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
      } else if (tab === "planes") {
        const res = await listNutritionPlans(supabase, {
          patientId,
          pageSize: 50,
        });
        setPlans(res.data);
      } else if (tab === "antropometria") {
        setAnthro(await listAnthropometry(supabase, patientId));
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
    if (tab !== "datos") void loadTabData();
  }, [tab, loadTabData]);

  const savePatient = patientForm.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const updated = await updatePatient(
        supabase,
        patientId,
        emptyToNull(values) as Partial<Patient>
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
    clinicalForm.reset({
      patient_id: patientId,
      appointment_id: null,
      record_date: new Date().toISOString().slice(0, 10),
      reason: "",
      evolution: "",
      observations: "",
      objectives: "",
      recommendations: "",
      professional_notes: "",
    });
    setClinicalOpen(true);
  };

  const openAnthro = () => {
    anthroForm.reset({
      patient_id: patientId,
      measured_at: new Date().toISOString().slice(0, 10),
      weight_kg: null,
      height_cm: null,
      waist_cm: null,
      hip_cm: null,
      arm_cm: null,
      thigh_cm: null,
      neck_cm: null,
      body_fat_percent: null,
      muscle_mass_kg: null,
      fat_mass_kg: null,
      body_water_percent: null,
      basal_metabolism_kcal: null,
      notes: "",
    });
    setAnthroOpen(true);
  };

  const openPlan = () => {
    planForm.reset({
      patient_id: patientId,
      title: "Plan alimentario",
      plan_date: new Date().toISOString().slice(0, 10),
      objective: "",
      description: "",
      breakfast: "",
      mid_morning: "",
      lunch: "",
      snack: "",
      dinner: "",
      extras: "",
      recommendations: "",
      observations: "",
    });
    setPlanOpen(true);
  };

  const submitClinical = clinicalForm.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const supabase = createClient();
      await createClinicalRecord(supabase, emptyToNull(values) as Partial<ClinicalRecord>);
      toast.success("Evolución registrada");
      setClinicalOpen(false);
      setTab("historial");
      await loadTabData();
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo guardar la evolución."));
    } finally {
      setSaving(false);
    }
  });

  const submitAnthro = anthroForm.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const supabase = createClient();
      await createAnthropometry(
        supabase,
        emptyToNull(values) as Partial<AnthropometricRecord>
      );
      toast.success("Medición registrada");
      setAnthroOpen(false);
      setTab("antropometria");
      await loadTabData();
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo guardar la medición."));
    } finally {
      setSaving(false);
    }
  });

  const submitPlan = planForm.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const supabase = createClient();
      await createNutritionPlan(
        supabase,
        emptyToNull(values) as Partial<NutritionPlan>
      );
      toast.success("Plan creado");
      setPlanOpen(false);
      setTab("planes");
      await loadTabData();
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo guardar el plan."));
    } finally {
      setSaving(false);
    }
  });

  const weight = anthroForm.watch("weight_kg");
  const height = anthroForm.watch("height_cm");
  const previewBmi = calculateBmi(
    typeof weight === "number" ? weight : Number(weight),
    typeof height === "number" ? height : Number(height)
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

      <div className="glass-card mb-8 p-6 sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Ficha del paciente
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--foreground)]">
              {fullName(patient.first_name, patient.last_name)}
            </h1>
            {!patient.is_active ? (
              <p className="mt-2 text-sm text-[#9a6b74]">Paciente archivado</p>
            ) : null}
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                { label: "DNI", value: patient.dni || "—" },
                { label: "Teléfono", value: patient.phone || "—" },
                {
                  label: "Email",
                  value: patient.email || "—",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1rem] border border-white/60 bg-white/45 px-4 py-3"
                >
                  <p className="text-xs text-[var(--muted)]">{item.label}</p>
                  <p className="mt-1 truncate text-sm font-medium tracking-tight">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={openClinical}>
              <Plus className="h-4 w-4" />
              Evolución
            </Button>
            <Button size="sm" variant="secondary" onClick={openAnthro}>
              <Plus className="h-4 w-4" />
              Antropometría
            </Button>
            <Button size="sm" variant="secondary" onClick={openPlan}>
              <Plus className="h-4 w-4" />
              Plan
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
      ) : tab === "planes" ? (
        plans.length === 0 ? (
          <EmptyState
            title="Sin planes"
            description="No hay planes alimentarios para este paciente."
            action={
              <Button onClick={openPlan}>
                <Plus className="h-4 w-4" />
                Nuevo plan
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {plans.map((p) => (
              <Card key={p.id} className="shadow-[var(--shadow-soft)]">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--foreground)]">{p.title}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {formatDate(p.plan_date)}
                      </p>
                    </div>
                    <Link href="/admin/planes">
                      <Button size="sm" variant="outline">
                        Ver en planes
                      </Button>
                    </Link>
                  </div>
                  {p.objective ? (
                    <p className="mt-2 text-sm text-[var(--muted)]">{p.objective}</p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : tab === "antropometria" ? (
        anthro.length === 0 ? (
          <EmptyState
            title="Sin mediciones"
            description="Todavía no hay registros antropométricos."
            action={
              <Button onClick={openAnthro}>
                <Plus className="h-4 w-4" />
                Registrar medición
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white shadow-[var(--shadow-soft)]">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--sage-soft)]/50 text-left text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Peso</th>
                  <th className="px-4 py-3">Altura</th>
                  <th className="px-4 py-3">IMC</th>
                  <th className="px-4 py-3">% Grasa</th>
                </tr>
              </thead>
              <tbody>
                {[...anthro].reverse().map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">{formatDate(r.measured_at)}</td>
                    <td className="px-4 py-3">
                      {r.weight_kg != null ? `${r.weight_kg} kg` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {r.height_cm != null ? `${r.height_cm} cm` : "—"}
                    </td>
                    <td className="px-4 py-3">{r.bmi ?? "—"}</td>
                    <td className="px-4 py-3">
                      {r.body_fat_percent != null
                        ? `${r.body_fat_percent}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
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
        <div className="grid gap-3">
          <Input
            label="Fecha"
            type="date"
            required
            error={clinicalForm.formState.errors.record_date?.message}
            {...clinicalForm.register("record_date")}
          />
          <Input
            label="Motivo"
            error={clinicalForm.formState.errors.reason?.message}
            {...clinicalForm.register("reason")}
          />
          <Textarea
            label="Evolución"
            error={clinicalForm.formState.errors.evolution?.message}
            {...clinicalForm.register("evolution")}
          />
          <Textarea
            label="Observaciones"
            {...clinicalForm.register("observations")}
          />
          <Textarea
            label="Objetivos"
            {...clinicalForm.register("objectives")}
          />
          <Textarea
            label="Recomendaciones"
            {...clinicalForm.register("recommendations")}
          />
          <Textarea
            label="Notas profesionales"
            {...clinicalForm.register("professional_notes")}
          />
        </div>
      </Modal>

      <Modal
        open={anthroOpen}
        onClose={() => setAnthroOpen(false)}
        title="Nueva medición"
        className="sm:max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAnthroOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void submitAnthro()}>
              Guardar
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Fecha"
            type="date"
            required
            {...anthroForm.register("measured_at")}
          />
          <div className="flex items-end text-sm text-[var(--muted)]">
            IMC estimado:{" "}
            <strong className="ml-1 text-[var(--foreground)]">{previewBmi ?? "—"}</strong>
          </div>
          <Input
            label="Peso (kg)"
            type="number"
            step="0.1"
            {...anthroForm.register("weight_kg")}
          />
          <Input
            label="Altura (cm)"
            type="number"
            step="0.1"
            {...anthroForm.register("height_cm")}
          />
          <Input
            label="Cintura (cm)"
            type="number"
            step="0.1"
            {...anthroForm.register("waist_cm")}
          />
          <Input
            label="Cadera (cm)"
            type="number"
            step="0.1"
            {...anthroForm.register("hip_cm")}
          />
          <Input
            label="% Grasa"
            type="number"
            step="0.1"
            {...anthroForm.register("body_fat_percent")}
          />
          <Input
            label="Masa muscular (kg)"
            type="number"
            step="0.1"
            {...anthroForm.register("muscle_mass_kg")}
          />
          <div className="sm:col-span-2">
            <Textarea label="Notas" {...anthroForm.register("notes")} />
          </div>
        </div>
      </Modal>

      <Modal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title="Nuevo plan alimentario"
        className="sm:max-w-2xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPlanOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void submitPlan()}>
              Guardar plan
            </Button>
          </div>
        }
      >
        <div className="grid gap-3">
          <Input label="Título" required {...planForm.register("title")} />
          <Input
            label="Fecha"
            type="date"
            required
            {...planForm.register("plan_date")}
          />
          <Textarea label="Objetivo" {...planForm.register("objective")} />
          <Textarea label="Desayuno" {...planForm.register("breakfast")} />
          <Textarea label="Media mañana" {...planForm.register("mid_morning")} />
          <Textarea label="Almuerzo" {...planForm.register("lunch")} />
          <Textarea label="Merienda" {...planForm.register("snack")} />
          <Textarea label="Cena" {...planForm.register("dinner")} />
          <Textarea
            label="Recomendaciones"
            {...planForm.register("recommendations")}
          />
        </div>
      </Modal>
    </div>
  );
}
