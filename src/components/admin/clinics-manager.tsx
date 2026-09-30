"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, Pencil, Plus, Power, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { clinicSchema, type ClinicFormValues } from "@/lib/validations";
import { formatTime, todayISO } from "@/lib/utils";
import {
  createClosedDate,
  deleteClosedDate,
  listClinicSchedules,
  listClinics,
  listClosedDates,
  replaceClinicSchedules,
  upsertClinic,
} from "@/services/settings";
import type { AppointmentBlock, Clinic, ClinicSchedule } from "@/types";
import { WEEKDAY_LABELS } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, Spinner } from "@/components/ui/states";

type ScheduleDraft = {
  weekday: number;
  start_time: string;
  end_time: string;
  break_start: string;
  break_end: string;
  is_active: boolean;
};

const EMPTY_SCHEDULES: ScheduleDraft[] = WEEKDAY_LABELS.map((_, weekday) => ({
  weekday,
  start_time: "09:00",
  end_time: "18:00",
  break_start: "13:00",
  break_end: "14:00",
  is_active: weekday >= 1 && weekday <= 5,
}));

function toDraft(schedules: ClinicSchedule[]): ScheduleDraft[] {
  return WEEKDAY_LABELS.map((_, weekday) => {
    const existing = schedules.find((s) => s.weekday === weekday);
    if (!existing) {
      return {
        weekday,
        start_time: "09:00",
        end_time: "18:00",
        break_start: "",
        break_end: "",
        is_active: false,
      };
    }
    return {
      weekday,
      start_time: formatTime(existing.start_time),
      end_time: formatTime(existing.end_time),
      break_start: existing.break_start ? formatTime(existing.break_start) : "",
      break_end: existing.break_end ? formatTime(existing.break_end) : "",
      is_active: existing.is_active,
    };
  });
}

function normalizeTime(value: string) {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

function formatClosedDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return format(new Date(year, month - 1, day), "EEEE d 'de' MMMM yyyy", {
    locale: es,
  });
}

export function ClinicsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clinicModal, setClinicModal] = useState(false);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [editing, setEditing] = useState<Clinic | null>(null);
  const [scheduleClinic, setScheduleClinic] = useState<Clinic | null>(null);
  const [schedules, setSchedules] = useState<ScheduleDraft[]>(EMPTY_SCHEDULES);
  const [closedDates, setClosedDates] = useState<AppointmentBlock[]>([]);
  const [closedDateInput, setClosedDateInput] = useState("");
  const [closedSaving, setClosedSaving] = useState(false);

  const form = useForm<ClinicFormValues>({
    resolver: zodResolver(clinicSchema) as Resolver<ClinicFormValues>,
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      google_maps_url: "",
      appointment_duration_minutes: 40,
      is_active: true,
      sort_order: 0,
      notes: "",
    },
  });

  const load = useCallback(async () => {
    const cached = getCached<Clinic[]>("clinics");
    if (cached) {
      setClinics(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await listClinics(supabase, false);
      setClinics(data);
      setCached("clinics", data);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudieron cargar los consultorios."));
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    form.reset({
      name: "",
      address: "",
      phone: "",
      google_maps_url: "",
      appointment_duration_minutes: 40,
      is_active: true,
      sort_order: clinics.length,
      notes: "",
    });
    setClinicModal(true);
  }

  function openEdit(clinic: Clinic) {
    setEditing(clinic);
    form.reset({
      name: clinic.name,
      address: clinic.address ?? "",
      phone: clinic.phone ?? "",
      google_maps_url: clinic.google_maps_url ?? "",
      appointment_duration_minutes: clinic.appointment_duration_minutes,
      is_active: clinic.is_active,
      sort_order: clinic.sort_order,
      notes: clinic.notes ?? "",
    });
    setClinicModal(true);
  }

  async function onSaveClinic(values: ClinicFormValues) {
    setSaving(true);
    try {
      await upsertClinic(supabase, {
        id: editing?.id,
        name: values.name,
        address: values.address || null,
        phone: values.phone || null,
        google_maps_url: values.google_maps_url || null,
        appointment_duration_minutes: values.appointment_duration_minutes,
        is_active: values.is_active,
        sort_order: values.sort_order,
        notes: values.notes || null,
      });
      toast.success(editing ? "Consultorio actualizado" : "Consultorio creado");
      setClinicModal(false);
      invalidateCache("clinics");
      await load();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo guardar el consultorio."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(clinic: Clinic) {
    try {
      await upsertClinic(supabase, {
        id: clinic.id,
        is_active: !clinic.is_active,
      });
      toast.success(
        clinic.is_active ? "Consultorio desactivado" : "Consultorio activado"
      );
      invalidateCache("clinics");
      await load();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo cambiar el estado."));
    }
  }

  async function openSchedules(clinic: Clinic) {
    setScheduleClinic(clinic);
    setClosedDateInput("");
    try {
      const [data, dates] = await Promise.all([
        listClinicSchedules(supabase, clinic.id, false),
        listClosedDates(supabase, clinic.id, todayISO()),
      ]);
      setSchedules(toDraft(data));
      setClosedDates(dates);
      setScheduleModal(true);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudieron cargar los horarios."));
    }
  }

  async function addClosedDate() {
    if (!scheduleClinic) return;
    const date = closedDateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      toast.error("Elegí una fecha.");
      return;
    }
    if (date < todayISO()) {
      toast.error("Elegí hoy o una fecha futura.");
      return;
    }
    if (closedDates.some((row) => row.block_date.slice(0, 10) === date)) {
      toast.error("Esa fecha ya está marcada como día sin atención.");
      return;
    }

    setClosedSaving(true);
    try {
      const created = await createClosedDate(supabase, scheduleClinic.id, date);
      setClosedDates((prev) =>
        [...prev, created].sort((a, b) => a.block_date.localeCompare(b.block_date))
      );
      setClosedDateInput("");
      toast.success("Ese día quedó sin turnos para reservar.");
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo guardar el día sin atención."));
    } finally {
      setClosedSaving(false);
    }
  }

  async function removeClosedDate(block: AppointmentBlock) {
    setClosedSaving(true);
    try {
      await deleteClosedDate(supabase, block.id);
      setClosedDates((prev) => prev.filter((row) => row.id !== block.id));
      toast.success("El día volvió a estar disponible.");
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo quitar el día sin atención."));
    } finally {
      setClosedSaving(false);
    }
  }

  function updateSchedule(weekday: number, patch: Partial<ScheduleDraft>) {
    setSchedules((prev) =>
      prev.map((row) => (row.weekday === weekday ? { ...row, ...patch } : row))
    );
  }

  async function saveSchedules() {
    if (!scheduleClinic) return;
    setSaving(true);
    try {
      const activeRows = schedules.filter((s) => s.is_active);
      for (const row of activeRows) {
        if (row.start_time >= row.end_time) {
          toast.error(
            `En ${WEEKDAY_LABELS[row.weekday]} el horario de inicio debe ser anterior al de fin.`
          );
          setSaving(false);
          return;
        }
        if ((row.break_start && !row.break_end) || (!row.break_start && row.break_end)) {
          toast.error(
            `En ${WEEKDAY_LABELS[row.weekday]} completá inicio y fin del descanso, o dejá ambos vacíos.`
          );
          setSaving(false);
          return;
        }
      }

      await replaceClinicSchedules(
        supabase,
        scheduleClinic.id,
        activeRows.map((s) => ({
          weekday: s.weekday,
          start_time: normalizeTime(s.start_time)!,
          end_time: normalizeTime(s.end_time)!,
          break_start: normalizeTime(s.break_start),
          break_end: normalizeTime(s.break_end),
          is_active: true,
        }))
      );
      toast.success("Horarios actualizados");
      setScheduleModal(false);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudieron guardar los horarios."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Consultorios"
        description="Editá nombre, dirección, teléfono, horarios y duración de turnos de cada sede."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo consultorio
          </Button>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : clinics.length === 0 ? (
        <EmptyState
          title="Todavía no hay consultorios"
          description="Creá el primero para empezar a recibir turnos."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nuevo consultorio
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {clinics.map((clinic) => (
            <Card key={clinic.id} className="hover-lift">
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-lg">{clinic.name}</CardTitle>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {clinic.address || "Sin dirección"}
                  </p>
                </div>
                <Badge tone={clinic.is_active ? "success" : "default"}>
                  {clinic.is_active ? "Activo" : "Inactivo"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-[var(--background)] px-3 py-2.5">
                    <dt className="text-xs text-[var(--muted)]">Duración</dt>
                    <dd className="mt-0.5 font-semibold">
                      {clinic.appointment_duration_minutes} min
                    </dd>
                  </div>
                  <div className="rounded-2xl bg-[var(--background)] px-3 py-2.5">
                    <dt className="text-xs text-[var(--muted)]">Teléfono</dt>
                    <dd className="mt-0.5 font-semibold">{clinic.phone || "—"}</dd>
                  </div>
                  {clinic.google_maps_url ? (
                    <div className="col-span-2 rounded-2xl bg-[var(--background)] px-3 py-2.5">
                      <dt className="text-xs text-[var(--muted)]">Maps</dt>
                      <dd className="mt-0.5 truncate text-sm font-medium text-[var(--pink)]">
                        <a
                          href={clinic.google_maps_url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          Ver ubicación
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  {clinic.notes ? (
                    <div className="col-span-2 rounded-2xl bg-[var(--pink-mist)] px-3 py-2.5">
                      <dt className="text-xs text-[var(--muted)]">
                        Texto público
                      </dt>
                      <dd className="mt-0.5 text-sm text-[var(--foreground)]">
                        {clinic.notes}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button variant="pink" size="sm" onClick={() => openEdit(clinic)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Editar datos
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void openSchedules(clinic)}>
                    <Clock className="h-3.5 w-3.5" />
                    Editar horarios
                  </Button>
                  <Button
                    variant={clinic.is_active ? "danger" : "primary"}
                    size="sm"
                    onClick={() => void toggleActive(clinic)}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {clinic.is_active ? "Desactivar" : "Activar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={clinicModal}
        onClose={() => setClinicModal(false)}
        title={editing ? "Editar consultorio" : "Nuevo consultorio"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setClinicModal(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={form.handleSubmit(onSaveClinic)}>
              Guardar
            </Button>
          </div>
        }
      >
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit(onSaveClinic)}>
          <Input
            label="Nombre"
            required
            className="sm:col-span-2"
            error={form.formState.errors.name?.message}
            {...form.register("name")}
          />
          <Input
            label="Dirección"
            className="sm:col-span-2"
            error={form.formState.errors.address?.message}
            {...form.register("address")}
          />
          <Input
            label="Teléfono"
            error={form.formState.errors.phone?.message}
            {...form.register("phone")}
          />
          <Input
            label="Duración del turno (min)"
            type="number"
            min={10}
            max={180}
            error={form.formState.errors.appointment_duration_minutes?.message}
            {...form.register("appointment_duration_minutes")}
          />
          <Input
            label="Google Maps URL"
            className="sm:col-span-2"
            error={form.formState.errors.google_maps_url?.message}
            {...form.register("google_maps_url")}
          />
          <Input
            label="Orden"
            type="number"
            error={form.formState.errors.sort_order?.message}
            {...form.register("sort_order")}
          />
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded" {...form.register("is_active")} />
            Consultorio activo
          </label>
          <Textarea
            label="Texto público (días / horarios)"
            hint="Se muestra en la web. Ej: Lunes, miércoles y viernes · 8 a 12 y 18 a 21 hs"
            className="sm:col-span-2"
            error={form.formState.errors.notes?.message}
            {...form.register("notes")}
          />
        </form>
      </Modal>

      <Modal
        open={scheduleModal}
        onClose={() => setScheduleModal(false)}
        title={`Horarios · ${scheduleClinic?.name ?? ""}`}
        className="sm:max-w-4xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setScheduleModal(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void saveSchedules()}>
              Guardar horarios
            </Button>
          </div>
        }
      >
        <p className="mb-4 text-sm text-stone-500">
          Activá los días de atención e indicá franja horaria y descanso (opcional).
          Eso define la semana habitual. Si un día puntual no vas a trabajar, marcalo abajo sin desactivar el día de la semana.
        </p>
        <div className="mb-5 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
          <div>
            <p className="text-sm font-medium">Días puntuales sin atención</p>
            <p className="mt-1 text-sm text-stone-500">
              Por ejemplo, el próximo lunes. Ese día no se va a poder reservar. El resto de los lunes sigue igual.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="sm:max-w-xs sm:flex-1">
              <Input
                type="date"
                label="Fecha"
                min={todayISO()}
                value={closedDateInput}
                onChange={(e) => setClosedDateInput(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              loading={closedSaving}
              onClick={() => void addClosedDate()}
            >
              <Plus className="h-4 w-4" />
              No trabajo este día
            </Button>
          </div>
          {closedDates.length === 0 ? (
            <p className="text-sm text-stone-500">No hay fechas marcadas.</p>
          ) : (
            <ul className="space-y-2">
              {closedDates.map((block) => (
                <li
                  key={block.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"
                >
                  <span className="text-sm font-medium capitalize">
                    {formatClosedDate(block.block_date)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={closedSaving}
                    onClick={() => void removeClosedDate(block)}
                  >
                    <X className="h-3.5 w-3.5" />
                    Quitar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3">
          {schedules.map((row) => (
            <div
              key={row.weekday}
              className="grid gap-2 rounded-xl border border-[var(--border)] p-3 sm:grid-cols-[120px_1fr]"
            >
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={row.is_active}
                  onChange={(e) =>
                    updateSchedule(row.weekday, { is_active: e.target.checked })
                  }
                />
                {WEEKDAY_LABELS[row.weekday]}
              </label>
              <div className="grid gap-2 sm:grid-cols-4">
                <Input
                  type="time"
                  label="Desde"
                  disabled={!row.is_active}
                  value={row.start_time}
                  onChange={(e) =>
                    updateSchedule(row.weekday, { start_time: e.target.value })
                  }
                />
                <Input
                  type="time"
                  label="Hasta"
                  disabled={!row.is_active}
                  value={row.end_time}
                  onChange={(e) =>
                    updateSchedule(row.weekday, { end_time: e.target.value })
                  }
                />
                <Input
                  type="time"
                  label="Descanso desde"
                  disabled={!row.is_active}
                  value={row.break_start}
                  onChange={(e) =>
                    updateSchedule(row.weekday, { break_start: e.target.value })
                  }
                />
                <Input
                  type="time"
                  label="Descanso hasta"
                  disabled={!row.is_active}
                  value={row.break_end}
                  onChange={(e) =>
                    updateSchedule(row.weekday, { break_end: e.target.value })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
