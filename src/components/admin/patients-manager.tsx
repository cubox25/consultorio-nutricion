"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useForm, type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Plus, Search, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/states";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { formatDate, fullName } from "@/lib/utils";
import {
  createPatient,
  getPatientsActivityHints,
  searchPatients,
  softDeletePatient,
  updatePatient,
} from "@/services/patients";
import {
  patientSchema,
  type PatientFormValues,
} from "@/lib/validations";
import { emptyToNull } from "@/components/admin/patient-search-select";
import type { Patient, PatientActivityHints, Sex } from "@/types";
import { SEX_LABELS } from "@/types";

const PAGE_SIZE = 20;

const defaultValues: PatientFormValues = {
  first_name: "",
  last_name: "",
  dni: "",
  birth_date: "",
  sex: "no_especificado",
  phone: "",
  email: "",
  address: "",
  occupation: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
  photo_url: "",
  clinical_history_number: "",
  health_insurance: "",
  marital_status: "",
  clinical_alerts: "",
  communication_consent: false,
};

function alertsToFormValue(alerts?: string[] | null) {
  return (alerts ?? []).filter(Boolean).join(", ");
}

export function patientFormToPayload(values: PatientFormValues): Partial<Patient> {
  const { clinical_alerts: alertsText, photo_url: _omitPhoto, ...rest } = values;
  void _omitPhoto;
  const base = emptyToNull(rest) as Partial<Patient>;
  const clinical_alerts = String(alertsText ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { ...base, clinical_alerts };
}

export function PatientsManager() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hints, setHints] = useState<Record<string, PatientActivityHints>>({});
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [saving, setSaving] = useState(false);

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema) as Resolver<PatientFormValues>,
    defaultValues,
  });

  const load = useCallback(async () => {
    const cacheKey = `patients:${search}:${page}`;
    const cached = getCached<{ data: Patient[]; count: number }>(cacheKey);
    if (cached) {
      setPatients(cached.data);
      setCount(cached.count);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const supabase = createClient();
      const { data, count: total } = await searchPatients(
        supabase,
        search,
        page,
        PAGE_SIZE
      );
      setPatients(data);
      setCount(total);
      setCached(cacheKey, { data, count: total });
      setLoading(false);
      const activity = await getPatientsActivityHints(
        supabase,
        data.map((p) => p.id)
      );
      setHints(activity);
    } catch (err) {
      setError(friendlyError(err, "No se pudieron cargar los pacientes."));
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.reset(defaultValues);
    setModalOpen(true);
  };

  const openEdit = (patient: Patient) => {
    setEditing(patient);
    form.reset({
      first_name: patient.first_name,
      last_name: patient.last_name,
      dni: patient.dni ?? "",
      birth_date: patient.birth_date ?? "",
      sex: patient.sex ?? "no_especificado",
      phone: patient.phone ?? "",
      email: patient.email ?? "",
      address: patient.address ?? "",
      occupation: patient.occupation ?? "",
      emergency_contact_name: patient.emergency_contact_name ?? "",
      emergency_contact_phone: patient.emergency_contact_phone ?? "",
      notes: patient.notes ?? "",
      photo_url: patient.photo_url ?? "",
      clinical_history_number: patient.clinical_history_number ?? "",
      health_insurance: patient.health_insurance ?? "",
      marital_status: patient.marital_status ?? "",
      clinical_alerts: alertsToFormValue(patient.clinical_alerts),
      communication_consent: patient.communication_consent,
    });
    setModalOpen(true);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = patientFormToPayload(values);
      if (editing) {
        await updatePatient(supabase, editing.id, payload);
        toast.success("Paciente actualizado");
      } else {
        await createPatient(supabase, { ...payload, is_active: true });
        toast.success("Paciente creado");
      }
      setModalOpen(false);
      invalidateCache("patients");
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo guardar el paciente."));
    } finally {
      setSaving(false);
    }
  });

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const supabase = createClient();
      await softDeletePatient(supabase, deleteTarget.id);
      toast.success("Paciente archivado");
      setDeleteTarget(null);
      invalidateCache("patients");
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo archivar el paciente."));
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Gestioná la información de tus pacientes."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo paciente
          </Button>
        }
      />

      <Card className="mb-4 shadow-[var(--shadow-soft)]">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre, apellido, DNI o teléfono…"
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
            Buscar
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
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
      ) : patients.length === 0 ? (
        <EmptyState
          title="Sin pacientes"
          description={
            search
              ? "No hay resultados para esa búsqueda."
              : "Todavía no hay pacientes activos. Creá el primero."
          }
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nuevo paciente
            </Button>
          }
        />
      ) : (
        <>
          {/* Mobile soft cards */}
          <div className="space-y-3 md:hidden">
            {patients.map((p) => {
              const hint = hints[p.id];
              return (
                <div
                  key={p.id}
                  className="glass-card hover-lift p-5"
                >
                  <Link
                    href={`/admin/pacientes/${p.id}`}
                    className="font-medium text-[var(--sage-deep)] hover:underline"
                  >
                    {fullName(p.first_name, p.last_name)}
                  </Link>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {p.dni ? `DNI ${p.dni}` : "Sin DNI"}
                    {p.sex ? ` · ${SEX_LABELS[p.sex as Sex]}` : ""}
                  </p>
                  <div className="mt-3 grid gap-1 text-sm text-[var(--muted)]">
                    <span>{p.phone || "—"} · {p.email || "—"}</span>
                    <span>
                      Última consulta:{" "}
                      {hint?.lastConsultation
                        ? formatDate(hint.lastConsultation)
                        : "—"}
                    </span>
                    <span>
                      Próximo turno:{" "}
                      {hint?.nextAppointment
                        ? (() => {
                            const [d, t] = hint.nextAppointment.split(" ");
                            return `${formatDate(d)}${t ? ` ${t}` : ""}`;
                          })()
                        : "—"}
                    </span>
                  </div>
                  <div className="mt-3 flex justify-end gap-1">
                    <Link href={`/admin/pacientes/${p.id}`}>
                      <Button variant="ghost" size="sm" aria-label="Ver ficha">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Editar"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Archivar"
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="glass-card hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white/40 text-left text-xs uppercase tracking-[0.06em] text-[var(--muted)]">
                  <tr>
                    <th className="px-5 py-4 font-medium">Paciente</th>
                    <th className="px-5 py-4 font-medium">Contacto</th>
                    <th className="px-5 py-4 font-medium">Última consulta</th>
                    <th className="px-5 py-4 font-medium">Próximo turno</th>
                    <th className="px-5 py-4 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => {
                    const hint = hints[p.id];
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-[var(--border-line)] transition-colors hover:bg-white/40"
                      >
                        <td className="px-5 py-4">
                          <Link
                            href={`/admin/pacientes/${p.id}`}
                            className="font-medium text-[var(--sage-deep)] hover:underline"
                          >
                            {fullName(p.first_name, p.last_name)}
                          </Link>
                          <p className="text-xs text-[var(--muted)]">
                            {p.dni ? `DNI ${p.dni}` : "Sin DNI"}
                            {p.sex ? ` · ${SEX_LABELS[p.sex as Sex]}` : ""}
                          </p>
                        </td>
                        <td className="px-5 py-4 text-[var(--muted)]">
                          <div>{p.phone || "—"}</div>
                          <div className="text-xs">{p.email || "—"}</div>
                        </td>
                        <td className="px-5 py-4 text-[var(--muted)]">
                          {hint?.lastConsultation
                            ? formatDate(hint.lastConsultation)
                            : "—"}
                        </td>
                        <td className="px-5 py-4 text-[var(--muted)]">
                          {hint?.nextAppointment
                            ? (() => {
                                const [d, t] = hint.nextAppointment.split(" ");
                                return `${formatDate(d)}${t ? ` ${t}` : ""}`;
                              })()
                            : "—"}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            <Link href={`/admin/pacientes/${p.id}`}>
                              <Button variant="ghost" size="sm" aria-label="Ver ficha">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Editar"
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label="Archivar"
                              onClick={() => setDeleteTarget(p)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
            <span>
              {count} paciente{count === 1 ? "" : "s"} · Página {page} de{" "}
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
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar paciente" : "Nuevo paciente"}
        className="sm:max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void onSubmit()}>
              Guardar
            </Button>
          </div>
        }
      >
        <PatientFormFields form={form} />
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Archivar paciente"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={saving} onClick={() => void confirmDelete()}>
              Archivar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--muted)]">
          ¿Archivar a{" "}
          <strong className="text-[var(--foreground)]">
            {deleteTarget
              ? fullName(deleteTarget.first_name, deleteTarget.last_name)
              : ""}
          </strong>
          ? La ficha dejará de aparecer en listados activos (baja lógica).
        </p>
      </Modal>
    </div>
  );
}

export function PatientFormFields({
  form,
}: {
  form: UseFormReturn<PatientFormValues>;
}) {
  const {
    register,
    formState: { errors },
    watch,
    setValue,
  } = form;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Input
        label="Nombre"
        required
        error={errors.first_name?.message}
        {...register("first_name")}
      />
      <Input
        label="Apellido"
        required
        error={errors.last_name?.message}
        {...register("last_name")}
      />
      <Input label="DNI" error={errors.dni?.message} {...register("dni")} />
      <Input
        label="Fecha de nacimiento"
        type="date"
        error={errors.birth_date?.message}
        {...register("birth_date")}
      />
      <Select
        label="Sexo"
        options={Object.entries(SEX_LABELS).map(([value, label]) => ({
          value,
          label,
        }))}
        error={errors.sex?.message}
        {...register("sex")}
      />
      <Input
        label="Teléfono"
        error={errors.phone?.message}
        {...register("phone")}
      />
      <Input
        label="Email"
        type="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <Input
        label="Ocupación"
        error={errors.occupation?.message}
        {...register("occupation")}
      />
      <div className="sm:col-span-2">
        <Input
          label="Dirección"
          error={errors.address?.message}
          {...register("address")}
        />
      </div>
      <Input
        label="N° historia clínica (HC)"
        error={errors.clinical_history_number?.message}
        {...register("clinical_history_number")}
      />
      <Input
        label="Cobertura / obra social"
        error={errors.health_insurance?.message}
        {...register("health_insurance")}
      />
      <Input
        label="Estado civil"
        error={errors.marital_status?.message}
        {...register("marital_status")}
      />
      <div className="sm:col-span-2">
        <Input
          label="Alertas clínicas"
          hint="Separadas por comas. Ej: Diabetes Tipo 2, Sobrepeso, Obesidad"
          error={errors.clinical_alerts?.message}
          {...register("clinical_alerts")}
        />
      </div>
      <Input
        label="Contacto de emergencia"
        error={errors.emergency_contact_name?.message}
        {...register("emergency_contact_name")}
      />
      <Input
        label="Tel. emergencia"
        error={errors.emergency_contact_phone?.message}
        {...register("emergency_contact_phone")}
      />
      <div className="sm:col-span-2">
        <Textarea
          label="Notas"
          error={errors.notes?.message}
          {...register("notes")}
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-[var(--border)]"
          checked={!!watch("communication_consent")}
          onChange={(e) => setValue("communication_consent", e.target.checked)}
        />
        Consentimiento para comunicaciones
      </label>
    </div>
  );
}
