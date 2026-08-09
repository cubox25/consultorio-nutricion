"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  UserX,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import {
  appointmentSchema,
  type AppointmentFormValues,
} from "@/lib/validations";
import {
  displayPatientName,
  formatTime,
  minutesToTime,
  timeToMinutes,
  todayISO,
} from "@/lib/utils";
import {
  createAppointment,
  listAppointments,
  updateAppointment,
  updateAppointmentStatus,
} from "@/services/appointments";
import { listClinics } from "@/services/settings";
import type { Appointment, AppointmentStatus, Clinic } from "@/types";
import { APPOINTMENT_STATUS_LABELS } from "@/types";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/states";
import { PatientSearchSelect } from "@/components/admin/patient-search-select";

type ViewMode = "dia" | "semana" | "mes";

const STATUS_OPTIONS = Object.entries(APPOINTMENT_STATUS_LABELS).map(
  ([value, label]) => ({ value, label })
);

function defaultEndTime(start: string, durationMinutes: number) {
  return minutesToTime(timeToMinutes(start) + durationMinutes);
}

function appointmentMatchesSearch(appt: Appointment, term: string) {
  if (!term.trim()) return true;
  const q = term.trim().toLowerCase();
  const name = displayPatientName(appt).toLowerCase();
  const dni =
    appt.patient?.dni?.toLowerCase() ||
    appt.guest_dni?.toLowerCase() ||
    "";
  const phone =
    appt.patient?.phone?.toLowerCase() ||
    appt.guest_phone?.toLowerCase() ||
    "";
  return name.includes(q) || dni.includes(q) || phone.includes(q);
}

export function AgendaManager() {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<ViewMode>("semana");
  const [anchorDate, setAnchorDate] = useState(() => todayISO());
  const [clinicFilter, setClinicFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "">("");
  const [patientSearch, setPatientSearch] = useState("");
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentSchema) as Resolver<AppointmentFormValues>,
    defaultValues: {
      clinic_id: "",
      patient_id: null,
      appointment_date: todayISO(),
      start_time: "09:00",
      end_time: "09:40",
      status: "pendiente",
      reason: "",
      notes: "",
      guest_first_name: "",
      guest_last_name: "",
      guest_dni: "",
      guest_phone: "",
      guest_email: "",
    },
  });

  const watchClinicId = form.watch("clinic_id");
  const watchStart = form.watch("start_time");

  useEffect(() => {
    const clinic = clinics.find((c) => c.id === watchClinicId);
    if (!clinic || !watchStart) return;
    const end = defaultEndTime(watchStart, clinic.appointment_duration_minutes);
    if (form.getValues("end_time") !== end) {
      form.setValue("end_time", end);
    }
  }, [watchClinicId, watchStart, clinics, form]);

  const range = useMemo(() => {
    const base = parseISO(anchorDate);
    if (view === "dia") {
      return { from: anchorDate, to: anchorDate, days: [base] };
    }
    if (view === "semana") {
      const start = startOfWeek(base, { weekStartsOn: 1 });
      const end = endOfWeek(base, { weekStartsOn: 1 });
      return {
        from: format(start, "yyyy-MM-dd"),
        to: format(end, "yyyy-MM-dd"),
        days: eachDayOfInterval({ start, end }),
      };
    }
    const start = startOfMonth(base);
    const end = endOfMonth(base);
    const gridStart = startOfWeek(start, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(end, { weekStartsOn: 1 });
    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
      days: eachDayOfInterval({ start: gridStart, end: gridEnd }),
    };
  }, [anchorDate, view]);

  const loadMeta = useCallback(async () => {
    try {
      const clinicList = await listClinics(supabase, false);
      setClinics(clinicList);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudieron cargar consultorios."));
    }
  }, [supabase]);

  const loadAppointments = useCallback(async () => {
    const cacheKey = `appointments:${range.from}:${range.to}:${clinicFilter}:${statusFilter}`;
    const cached = getCached<Appointment[]>(cacheKey);
    if (cached) {
      setAppointments(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await listAppointments(supabase, {
        from: range.from,
        to: range.to,
        clinicId: clinicFilter || undefined,
        status: statusFilter || undefined,
      });
      setAppointments(data);
      setCached(cacheKey, data);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudieron cargar los turnos."));
    } finally {
      setLoading(false);
    }
  }, [supabase, range.from, range.to, clinicFilter, statusFilter]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  const filtered = useMemo(
    () => appointments.filter((a) => appointmentMatchesSearch(a, patientSearch)),
    [appointments, patientSearch]
  );

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of filtered) {
      const list = map.get(appt.appointment_date) ?? [];
      list.push(appt);
      map.set(appt.appointment_date, list);
    }
    return map;
  }, [filtered]);

  function openCreate(date?: string) {
    setEditing(null);
    const clinicId = clinicFilter || clinics.find((c) => c.is_active)?.id || clinics[0]?.id || "";
    const duration =
      clinics.find((c) => c.id === clinicId)?.appointment_duration_minutes ?? 40;
    form.reset({
      clinic_id: clinicId,
      patient_id: null,
      appointment_date: date || anchorDate,
      start_time: "09:00",
      end_time: defaultEndTime("09:00", duration),
      status: "pendiente",
      reason: "",
      notes: "",
      guest_first_name: "",
      guest_last_name: "",
      guest_dni: "",
      guest_phone: "",
      guest_email: "",
    });
    setModalOpen(true);
  }

  function openEdit(appt: Appointment) {
    setEditing(appt);
    form.reset({
      clinic_id: appt.clinic_id,
      patient_id: appt.patient_id,
      appointment_date: appt.appointment_date,
      start_time: formatTime(appt.start_time),
      end_time: formatTime(appt.end_time),
      status: appt.status,
      reason: appt.reason ?? "",
      notes: appt.notes ?? "",
      guest_first_name: appt.guest_first_name ?? "",
      guest_last_name: appt.guest_last_name ?? "",
      guest_dni: appt.guest_dni ?? "",
      guest_phone: appt.guest_phone ?? "",
      guest_email: appt.guest_email ?? "",
    });
    setModalOpen(true);
  }

  async function onSubmit(values: AppointmentFormValues) {
    setSaving(true);
    try {
      const payload = {
        clinic_id: values.clinic_id,
        patient_id: values.patient_id || null,
        appointment_date: values.appointment_date,
        start_time: values.start_time.length === 5 ? `${values.start_time}:00` : values.start_time,
        end_time: values.end_time.length === 5 ? `${values.end_time}:00` : values.end_time,
        status: values.status,
        reason: values.reason || null,
        notes: values.notes || null,
        guest_first_name: values.guest_first_name || null,
        guest_last_name: values.guest_last_name || null,
        guest_dni: values.guest_dni || null,
        guest_phone: values.guest_phone || null,
        guest_email: values.guest_email || null,
      };

      if (editing) {
        await updateAppointment(supabase, editing.id, payload);
        toast.success("Turno actualizado");
      } else {
        await createAppointment(supabase, payload);
        toast.success("Turno creado");
      }
      setModalOpen(false);
      invalidateCache("appointments");
      await loadAppointments();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo guardar el turno."));
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(
    appt: Appointment,
    status: AppointmentStatus,
    reason?: string
  ) {
    try {
      await updateAppointmentStatus(supabase, appt.id, status, reason);
      toast.success(`Turno marcado como ${APPOINTMENT_STATUS_LABELS[status].toLowerCase()}`);
      invalidateCache("appointments");
      await loadAppointments();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo actualizar el estado."));
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      await updateAppointmentStatus(
        supabase,
        cancelTarget.id,
        "cancelado",
        cancelReason.trim() || undefined
      );
      toast.success("Turno cancelado");
      setCancelTarget(null);
      setCancelReason("");
      invalidateCache("appointments");
      await loadAppointments();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo cancelar el turno."));
    } finally {
      setSaving(false);
    }
  }

  function navigate(dir: -1 | 1) {
    const base = parseISO(anchorDate);
    if (view === "dia") {
      setAnchorDate(format(addDays(base, dir), "yyyy-MM-dd"));
    } else if (view === "semana") {
      setAnchorDate(format(addDays(base, dir * 7), "yyyy-MM-dd"));
    } else {
      setAnchorDate(format(dir === 1 ? addMonths(base, 1) : subMonths(base, 1), "yyyy-MM-dd"));
    }
  }

  const titleLabel = useMemo(() => {
    const base = parseISO(anchorDate);
    if (view === "dia") return format(base, "EEEE d 'de' MMMM yyyy", { locale: es });
    if (view === "semana") {
      const start = startOfWeek(base, { weekStartsOn: 1 });
      const end = endOfWeek(base, { weekStartsOn: 1 });
      return `${format(start, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`;
    }
    return format(base, "MMMM yyyy", { locale: es });
  }, [anchorDate, view]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agenda"
        description="Administrá turnos por día, semana o mes."
        actions={
          <Button onClick={() => openCreate()}>
            <Plus className="h-4 w-4" />
            Nuevo turno
          </Button>
        }
      />

      <Card>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--cream)]/60 p-1">
              {(
                [
                  ["dia", "Día"],
                  ["semana", "Semana"],
                  ["mes", "Mes"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setView(key)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    view === key
                      ? "bg-white text-[var(--sage-deep)] shadow-[var(--shadow-soft)]"
                      : "text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate(-1)} aria-label="Anterior">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAnchorDate(todayISO())}
              >
                Hoy
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate(1)} aria-label="Siguiente">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="ml-1 min-w-0 capitalize text-sm font-medium text-[var(--foreground)]">
                {titleLabel}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              type="date"
              label="Fecha"
              value={anchorDate}
              onChange={(e) => setAnchorDate(e.target.value)}
            />
            <Select
              label="Consultorio"
              placeholder="Todos"
              value={clinicFilter}
              onChange={(e) => setClinicFilter(e.target.value)}
              options={clinics.map((c) => ({
                value: c.id,
                label: c.is_active ? c.name : `${c.name} (inactivo)`,
              }))}
            />
            <Select
              label="Estado"
              placeholder="Todos"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter((e.target.value || "") as AppointmentStatus | "")
              }
              options={STATUS_OPTIONS}
            />
            <Input
              label="Buscar paciente"
              placeholder="Nombre, DNI o teléfono"
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : filtered.length === 0 && view !== "mes" ? (
        <EmptyState
          title="Sin turnos en este período"
          description="Creá un nuevo turno o cambiá los filtros."
          action={
            <Button onClick={() => openCreate()}>
              <Plus className="h-4 w-4" />
              Nuevo turno
            </Button>
          }
        />
      ) : view === "mes" ? (
        <MonthGrid
          days={range.days}
          anchor={parseISO(anchorDate)}
          appointmentsByDate={appointmentsByDate}
          onSelectDay={(d) => {
            setAnchorDate(format(d, "yyyy-MM-dd"));
            setView("dia");
          }}
          onCreate={(d) => openCreate(format(d, "yyyy-MM-dd"))}
          onEdit={openEdit}
        />
      ) : (
        <div className="space-y-4">
          {range.days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayAppts = appointmentsByDate.get(key) ?? [];
            if (view === "semana" && dayAppts.length === 0) {
              return (
                <Card key={key}>
                  <CardContent className="flex items-center justify-between gap-3 py-4">
                    <div>
                      <p className="font-medium capitalize">
                        {format(day, "EEEE d/MM", { locale: es })}
                      </p>
                      <p className="text-sm text-[var(--muted)]">Sin turnos</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openCreate(key)}>
                      <Plus className="h-4 w-4" />
                      Agregar
                    </Button>
                  </CardContent>
                </Card>
              );
            }
            if (view === "dia" || dayAppts.length > 0) {
              return (
                <DaySection
                  key={key}
                  date={day}
                  appointments={dayAppts}
                  onEdit={openEdit}
                  onConfirm={(a) => changeStatus(a, "confirmado")}
                  onAttend={(a) => changeStatus(a, "atendido")}
                  onNoShow={(a) => changeStatus(a, "no_asistio")}
                  onCancel={(a) => {
                    setCancelTarget(a);
                    setCancelReason("");
                  }}
                  onCreate={() => openCreate(key)}
                />
              );
            }
            return null;
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar turno" : "Nuevo turno"}
        className="sm:max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={form.handleSubmit(onSubmit)}>
              {editing ? "Guardar cambios" : "Crear turno"}
            </Button>
          </div>
        }
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
          <Select
            label="Consultorio"
            required
            options={clinics.filter((c) => c.is_active || c.id === editing?.clinic_id).map((c) => ({
              value: c.id,
              label: c.name,
            }))}
            error={form.formState.errors.clinic_id?.message}
            {...form.register("clinic_id")}
          />
          <div className="space-y-1.5">
            <PatientSearchSelect
              label="Paciente"
              value={form.watch("patient_id") ?? ""}
              onChange={(id) =>
                form.setValue("patient_id", id || null, { shouldValidate: true })
              }
              error={form.formState.errors.patient_id?.message}
            />
            {form.watch("patient_id") ? (
              <button
                type="button"
                className="text-xs text-[var(--muted)] hover:text-[var(--sage-deep)] hover:underline"
                onClick={() =>
                  form.setValue("patient_id", null, { shouldValidate: true })
                }
              >
                Quitar paciente (usar datos de invitado)
              </button>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Sin paciente / usar datos de invitado
              </p>
            )}
          </div>
          <Input
            type="date"
            label="Fecha"
            required
            error={form.formState.errors.appointment_date?.message}
            {...form.register("appointment_date")}
          />
          <Select
            label="Estado"
            options={STATUS_OPTIONS}
            error={form.formState.errors.status?.message}
            {...form.register("status")}
          />
          <Input
            type="time"
            label="Inicio"
            required
            error={form.formState.errors.start_time?.message}
            {...form.register("start_time")}
          />
          <Input
            type="time"
            label="Fin"
            required
            error={form.formState.errors.end_time?.message}
            {...form.register("end_time")}
          />
          <Input
            label="Motivo"
            className="sm:col-span-2"
            error={form.formState.errors.reason?.message}
            {...form.register("reason")}
          />
          <Textarea
            label="Notas"
            className="sm:col-span-2"
            error={form.formState.errors.notes?.message}
            {...form.register("notes")}
          />
          <div className="sm:col-span-2">
            <p className="mb-3 text-sm font-medium text-[var(--muted)]">
              Datos de invitado (si no hay paciente seleccionado)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Nombre" {...form.register("guest_first_name")} />
              <Input label="Apellido" {...form.register("guest_last_name")} />
              <Input label="DNI" {...form.register("guest_dni")} />
              <Input label="Teléfono" {...form.register("guest_phone")} />
              <Input
                label="Email"
                className="sm:col-span-2"
                error={form.formState.errors.guest_email?.message}
                {...form.register("guest_email")}
              />
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancelar turno"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Volver
            </Button>
            <Button variant="danger" loading={saving} onClick={() => void confirmCancel()}>
              Confirmar cancelación
            </Button>
          </div>
        }
      >
        <p className="mb-4 text-sm text-[var(--muted)]">
          ¿Cancelar el turno de{" "}
          <strong className="text-[var(--foreground)]">{cancelTarget ? displayPatientName(cancelTarget) : ""}</strong>?
        </p>
        <Textarea
          label="Motivo de cancelación (opcional)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}

function DaySection({
  date,
  appointments,
  onEdit,
  onConfirm,
  onAttend,
  onNoShow,
  onCancel,
  onCreate,
}: {
  date: Date;
  appointments: Appointment[];
  onEdit: (a: Appointment) => void;
  onConfirm: (a: Appointment) => void;
  onAttend: (a: Appointment) => void;
  onNoShow: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
  onCreate: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold capitalize text-[var(--foreground)]">
            <CalendarDays className="h-4 w-4 text-[var(--sage-deep)]" />
            {format(date, "EEEE d 'de' MMMM", { locale: es })}
          </h2>
          <Button variant="outline" size="sm" onClick={onCreate}>
            <Plus className="h-4 w-4" />
            Nuevo
          </Button>
        </div>
        {appointments.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">No hay turnos para este día.</p>
        ) : (
          <ul className="space-y-2">
            {appointments.map((appt) => (
              <AppointmentRow
                key={appt.id}
                appt={appt}
                onEdit={onEdit}
                onConfirm={onConfirm}
                onAttend={onAttend}
                onNoShow={onNoShow}
                onCancel={onCancel}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AppointmentRow({
  appt,
  onEdit,
  onConfirm,
  onAttend,
  onNoShow,
  onCancel,
}: {
  appt: Appointment;
  onEdit: (a: Appointment) => void;
  onConfirm: (a: Appointment) => void;
  onAttend: (a: Appointment) => void;
  onNoShow: (a: Appointment) => void;
  onCancel: (a: Appointment) => void;
}) {
  const closed = appt.status === "cancelado" || appt.status === "atendido" || appt.status === "no_asistio";

  const statusTone: Record<string, string> = {
    pendiente: "border-l-[var(--cream-deep)] bg-[var(--cream)]/35",
    confirmado: "border-l-[var(--sage)] bg-[var(--sage-soft)]/40",
    atendido: "border-l-[var(--sky)] bg-[var(--sky-soft)]/50",
    cancelado: "border-l-[var(--rose)] bg-[var(--rose-soft)]/40",
    no_asistio: "border-l-[#d1d5db] bg-[#f9fafb]",
  };

  return (
    <li
      className={`flex flex-col gap-3 rounded-[var(--radius-sm)] border-l-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between ${statusTone[appt.status] ?? ""}`}
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold tabular-nums">
            {formatTime(appt.start_time)} – {formatTime(appt.end_time)}
          </span>
          <StatusBadge status={appt.status}>
            {APPOINTMENT_STATUS_LABELS[appt.status]}
          </StatusBadge>
        </div>
        <p className="truncate font-medium">{displayPatientName(appt)}</p>
        <p className="text-sm text-[var(--muted)]">
          {appt.clinic?.name ?? "Consultorio"}
          {appt.reason ? ` · ${appt.reason}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={() => onEdit(appt)} title="Editar">
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </Button>
        {!closed && appt.status === "pendiente" ? (
          <Button variant="secondary" size="sm" onClick={() => onConfirm(appt)}>
            <Check className="h-3.5 w-3.5" />
            Confirmar
          </Button>
        ) : null}
        {!closed && (appt.status === "pendiente" || appt.status === "confirmado") ? (
          <>
            <Button variant="primary" size="sm" onClick={() => onAttend(appt)}>
              Atendido
            </Button>
            <Button variant="outline" size="sm" onClick={() => onNoShow(appt)}>
              <UserX className="h-3.5 w-3.5" />
              No asistió
            </Button>
            <Button variant="danger" size="sm" onClick={() => onCancel(appt)}>
              <XCircle className="h-3.5 w-3.5" />
              Cancelar
            </Button>
          </>
        ) : null}
      </div>
    </li>
  );
}

function MonthGrid({
  days,
  anchor,
  appointmentsByDate,
  onSelectDay,
  onCreate,
  onEdit,
}: {
  days: Date[];
  anchor: Date;
  appointmentsByDate: Map<string, Appointment[]>;
  onSelectDay: (d: Date) => void;
  onCreate: (d: Date) => void;
  onEdit: (a: Appointment) => void;
}) {
  const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-[var(--muted)]">
          {weekdays.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const list = appointmentsByDate.get(key) ?? [];
            const inMonth = isSameMonth(day, anchor);
            const isToday = isSameDay(day, new Date());
            return (
              <div
                key={key}
                className={`min-h-24 rounded-xl border p-1.5 ${
                  inMonth
                    ? "border-[var(--border)] bg-white"
                    : "border-transparent bg-[var(--cream)]/50 text-[var(--muted)]"
                } ${isToday ? "bg-[var(--sage-soft)]/60 ring-2 ring-[var(--sage)]/40" : ""}`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <button
                    type="button"
                    className="text-xs font-semibold hover:underline"
                    onClick={() => onSelectDay(day)}
                  >
                    {format(day, "d")}
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-[var(--muted)] hover:bg-[var(--sage-soft)] hover:text-[var(--sage-deep)]"
                    onClick={() => onCreate(day)}
                    aria-label="Nuevo turno"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((appt) => (
                    <button
                      key={appt.id}
                      type="button"
                      onClick={() => onEdit(appt)}
                      className="block w-full truncate rounded-md bg-[var(--sage-soft)] px-1 py-0.5 text-left text-[10px] text-[var(--sage-deep)] hover:opacity-90"
                      title={displayPatientName(appt)}
                    >
                      {formatTime(appt.start_time)} {displayPatientName(appt)}
                    </button>
                  ))}
                  {list.length > 3 ? (
                    <button
                      type="button"
                      className="text-[10px] text-[var(--muted)] hover:underline"
                      onClick={() => onSelectDay(day)}
                    >
                      +{list.length - 3} más
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
