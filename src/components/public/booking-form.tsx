"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MapPin,
  Clock3,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getAvailableSlots } from "@/lib/availability";
import { friendlyError } from "@/lib/errors";
import { formatDate, formatTime, todayISO } from "@/lib/utils";
import {
  publicBookingSchema,
  type PublicBookingValues,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/states";
import type {
  AppointmentBlock,
  Clinic,
  ClinicSchedule,
  SystemSettings,
  TimeSlot,
} from "@/types";

const STEPS = [
  { id: 1, label: "Consultorio", icon: MapPin },
  { id: 2, label: "Fecha", icon: CalendarDays },
  { id: 3, label: "Horario", icon: Clock3 },
  { id: 4, label: "Datos", icon: UserRound },
  { id: 5, label: "Confirmar", icon: CheckCircle2 },
] as const;

type Step = (typeof STEPS)[number]["id"];

interface BookingFormProps {
  clinics: Clinic[];
  settings: SystemSettings | null;
}

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

export function BookingForm({ clinics, settings }: BookingFormProps) {
  const timezone = settings?.timezone || "America/Argentina/Buenos_Aires";
  const minAdvanceHours = settings?.min_advance_hours ?? 0;
  const maxAdvanceDays = settings?.max_advance_days ?? 60;
  const defaultDuration = settings?.appointment_duration_minutes ?? 40;

  const minDate = todayISO(timezone);
  const maxDate = format(addDays(parseISO(minDate), maxAdvanceDays), "yyyy-MM-dd");

  const [step, setStep] = useState<Step>(1);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);

  const form = useForm<PublicBookingValues>({
    resolver: zodResolver(publicBookingSchema),
    defaultValues: {
      clinic_id: clinics[0]?.id ?? "",
      appointment_date: "",
      start_time: "",
      end_time: "",
      first_name: "",
      last_name: "",
      dni: "",
      phone: "",
      email: "",
      reason: "",
      notes: "",
    },
    mode: "onTouched",
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    trigger,
    formState: { errors },
    getValues,
  } = form;

  const clinicId = watch("clinic_id");
  const appointmentDate = watch("appointment_date");
  const startTime = watch("start_time");
  const endTime = watch("end_time");

  const selectedClinic = useMemo(
    () => clinics.find((c) => c.id === clinicId) ?? null,
    [clinics, clinicId]
  );

  const durationMinutes =
    selectedClinic?.appointment_duration_minutes || defaultDuration;

  const loadSlots = useCallback(
    async (cid: string, date: string) => {
      if (!cid || !date) {
        setSlots([]);
        return;
      }

      setLoadingSlots(true);
      setSlots([]);
      setValue("start_time", "");
      setValue("end_time", "");

      try {
        const supabase = createClient();
        const clinic = clinics.find((c) => c.id === cid);
        const duration =
          clinic?.appointment_duration_minutes || defaultDuration;

        const [schedulesRes, blocksRes, occupiedRes] = await Promise.all([
          supabase
            .from("clinic_schedules")
            .select("*")
            .eq("clinic_id", cid)
            .eq("is_active", true),
          supabase
            .from("appointment_blocks")
            .select("*")
            .eq("block_date", date)
            .or(`clinic_id.eq.${cid},clinic_id.is.null`),
          supabase.rpc("get_occupied_slots", {
            p_clinic_id: cid,
            p_date: date,
          }),
        ]);

        if (schedulesRes.error) throw schedulesRes.error;
        if (blocksRes.error) throw blocksRes.error;
        if (occupiedRes.error) throw occupiedRes.error;

        const schedules = (schedulesRes.data ?? []) as ClinicSchedule[];
        const blocks = (blocksRes.data ?? []) as AppointmentBlock[];
        const occupiedRaw = (occupiedRes.data ?? []) as {
          start_time: string;
          end_time: string;
        }[];
        const occupied: TimeSlot[] = occupiedRaw.map((row) => ({
          start: normalizeTime(String(row.start_time)),
          end: normalizeTime(String(row.end_time)),
        }));

        const available = getAvailableSlots({
          date,
          schedules,
          occupied,
          blocks,
          durationMinutes: duration,
          minAdvanceHours,
          clinicId: cid,
          timezone,
        });

        setSlots(available);
      } catch (error) {
        toast.error(friendlyError(error, "No se pudieron cargar los horarios."));
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [clinics, defaultDuration, minAdvanceHours, setValue, timezone]
  );

  useEffect(() => {
    if (clinicId && appointmentDate) {
      void loadSlots(clinicId, appointmentDate);
    }
  }, [clinicId, appointmentDate, loadSlots]);

  const selectSlot = (slot: TimeSlot) => {
    setValue("start_time", slot.start, { shouldValidate: true });
    setValue("end_time", slot.end, { shouldValidate: true });
  };

  const goNext = async () => {
    if (step === 1) {
      const ok = await trigger("clinic_id");
      if (!ok || !clinicId) {
        toast.error("Seleccioná un consultorio para continuar.");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      const ok = await trigger("appointment_date");
      if (!ok || !appointmentDate) {
        toast.error("Seleccioná una fecha para continuar.");
        return;
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      const ok = await trigger(["start_time", "end_time"]);
      if (!ok || !startTime) {
        toast.error("Seleccioná un horario disponible.");
        return;
      }
      setStep(4);
      return;
    }

    if (step === 4) {
      const ok = await trigger([
        "first_name",
        "last_name",
        "dni",
        "phone",
        "email",
        "reason",
        "notes",
      ]);
      if (!ok) {
        toast.error("Revisá tus datos antes de continuar.");
        return;
      }
      setStep(5);
    }
  };

  const goBack = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const onSubmit = async (values: PublicBookingValues) => {
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("create_public_appointment", {
        p_clinic_id: values.clinic_id,
        p_date: values.appointment_date,
        p_start_time: values.start_time,
        p_end_time: values.end_time,
        p_first_name: values.first_name.trim(),
        p_last_name: values.last_name.trim(),
        p_dni: values.dni.trim(),
        p_phone: values.phone.trim(),
        p_email: values.email?.trim() || null,
        p_reason: values.reason.trim(),
        p_notes: values.notes?.trim() || null,
      });

      if (error) throw error;

      setConfirmationId(typeof data === "string" ? data : String(data));
      setConfirmed(true);
      toast.success("Solicitud enviada correctamente.");
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo reservar el turno."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!clinics.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-stone-600">
            No hay consultorios disponibles para reserva en este momento.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (confirmed) {
    const values = getValues();
    return (
      <Card>
        <CardContent className="space-y-6 py-10 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand-soft)]">
            <CheckCircle2 className="h-8 w-8 text-[var(--brand-primary)]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[var(--brand-accent)]">
              ¡Solicitud recibida!
            </h2>
            <p className="mt-2 text-stone-600">
              Tu turno quedó registrado como pendiente. Te contactaremos para
              confirmarlo.
            </p>
          </div>
          <div className="mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-5 text-left text-sm">
            <p>
              <span className="text-stone-500">Consultorio:</span>{" "}
              <strong>{selectedClinic?.name}</strong>
            </p>
            <p className="mt-2">
              <span className="text-stone-500">Fecha:</span>{" "}
              <strong>{formatDate(values.appointment_date)}</strong>
            </p>
            <p className="mt-2">
              <span className="text-stone-500">Horario:</span>{" "}
              <strong>
                {formatTime(values.start_time)} – {formatTime(values.end_time)}
              </strong>
            </p>
            <p className="mt-2">
              <span className="text-stone-500">Paciente:</span>{" "}
              <strong>
                {values.last_name}, {values.first_name}
              </strong>
            </p>
            {confirmationId ? (
              <p className="mt-2 break-all text-xs text-stone-400">
                Ref: {confirmationId}
              </p>
            ) : null}
          </div>
          {settings?.booking_policy_text ? (
            <p className="mx-auto max-w-md whitespace-pre-line text-xs text-stone-500">
              {settings.booking_policy_text}
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfirmed(false);
              setConfirmationId(null);
              setStep(1);
              setSlots([]);
              form.reset({
                clinic_id: clinics[0]?.id ?? "",
                appointment_date: "",
                start_time: "",
                end_time: "",
                first_name: "",
                last_name: "",
                dni: "",
                phone: "",
                email: "",
                reason: "",
                notes: "",
              });
            }}
          >
            Reservar otro turno
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5 sm:p-8">
        <ol className="mb-8 flex flex-wrap gap-2">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = step === s.id;
            const done = step > s.id;
            return (
              <li
                key={s.id}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium sm:text-sm ${
                  active
                    ? "bg-[var(--brand-primary)] text-white"
                    : done
                      ? "bg-[var(--brand-soft)] text-[var(--brand-accent)]"
                      : "bg-[var(--surface-muted)] text-stone-500"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{s.label}</span>
                <span className="sm:hidden">{s.id}</span>
              </li>
            );
          })}
        </ol>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {step === 1 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--brand-accent)]">
                Elegí el consultorio
              </h2>
              <Select
                label="Consultorio"
                required
                placeholder="Seleccioná un consultorio"
                options={clinics.map((c) => ({ value: c.id, label: c.name }))}
                error={errors.clinic_id?.message}
                {...register("clinic_id", {
                  onChange: () => {
                    setValue("appointment_date", "");
                    setValue("start_time", "");
                    setValue("end_time", "");
                    setSlots([]);
                  },
                })}
              />
              {selectedClinic ? (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm">
                  {selectedClinic.address ? (
                    <p className="text-stone-600">{selectedClinic.address}</p>
                  ) : null}
                  {selectedClinic.phone ? (
                    <p className="mt-1 text-stone-500">{selectedClinic.phone}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-stone-400">
                    Duración del turno:{" "}
                    {selectedClinic.appointment_duration_minutes || defaultDuration}{" "}
                    min
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--brand-accent)]">
                Seleccioná la fecha
              </h2>
              <p className="text-sm text-stone-500">
                Consultorio: <strong>{selectedClinic?.name}</strong>
              </p>
              <Input
                type="date"
                label="Fecha del turno"
                min={minDate}
                max={maxDate}
                required
                error={errors.appointment_date?.message}
                {...register("appointment_date")}
              />
              <p className="text-xs text-stone-400">
                Podés reservar hasta {maxAdvanceDays} días adelante
                {minAdvanceHours > 0
                  ? ` · Anticipación mínima: ${minAdvanceHours} h`
                  : ""}
                .
              </p>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--brand-accent)]">
                Horarios disponibles
              </h2>
              <p className="text-sm text-stone-500">
                {selectedClinic?.name} ·{" "}
                {appointmentDate
                  ? format(parseISO(appointmentDate), "EEEE d 'de' MMMM", {
                      locale: es,
                    })
                  : ""}
              </p>

              {loadingSlots ? (
                <div className="flex items-center justify-center gap-2 py-10 text-stone-500">
                  <Spinner />
                  <span className="text-sm">Buscando horarios…</span>
                </div>
              ) : slots.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-muted)] px-4 py-10 text-center">
                  <p className="text-sm text-stone-600">
                    No hay horarios disponibles para esta fecha. Probá con otro
                    día.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {slots.map((slot) => {
                    const selected = startTime === slot.start;
                    return (
                      <button
                        key={`${slot.start}-${slot.end}`}
                        type="button"
                        onClick={() => selectSlot(slot)}
                        className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                          selected
                            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white"
                            : "border-[var(--border)] bg-white text-[var(--brand-accent)] hover:border-[var(--brand-primary)]"
                        }`}
                      >
                        {formatTime(slot.start)}
                      </button>
                    );
                  })}
                </div>
              )}

              <input type="hidden" {...register("start_time")} />
              <input type="hidden" {...register("end_time")} />
              {errors.start_time ? (
                <p className="text-sm text-red-600">{errors.start_time.message}</p>
              ) : null}
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--brand-accent)]">
                Tus datos
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Nombre"
                  required
                  autoComplete="given-name"
                  error={errors.first_name?.message}
                  {...register("first_name")}
                />
                <Input
                  label="Apellido"
                  required
                  autoComplete="family-name"
                  error={errors.last_name?.message}
                  {...register("last_name")}
                />
                <Input
                  label="DNI"
                  required
                  inputMode="numeric"
                  error={errors.dni?.message}
                  {...register("dni")}
                />
                <Input
                  label="Teléfono"
                  required
                  type="tel"
                  autoComplete="tel"
                  error={errors.phone?.message}
                  {...register("phone")}
                />
                <div className="sm:col-span-2">
                  <Input
                    label="Email"
                    type="email"
                    autoComplete="email"
                    hint="Opcional"
                    error={errors.email?.message}
                    {...register("email")}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Textarea
                    label="Motivo de consulta"
                    required
                    error={errors.reason?.message}
                    {...register("reason")}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Textarea
                    label="Notas adicionales"
                    error={errors.notes?.message}
                    {...register("notes")}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--brand-accent)]">
                Confirmá tu solicitud
              </h2>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-5 text-sm space-y-2">
                <p>
                  <span className="text-stone-500">Consultorio:</span>{" "}
                  <strong>{selectedClinic?.name}</strong>
                </p>
                <p>
                  <span className="text-stone-500">Fecha:</span>{" "}
                  <strong>
                    {appointmentDate ? formatDate(appointmentDate) : "—"}
                  </strong>
                </p>
                <p>
                  <span className="text-stone-500">Horario:</span>{" "}
                  <strong>
                    {startTime ? formatTime(startTime) : "—"}
                    {endTime ? ` – ${formatTime(endTime)}` : ""}
                  </strong>
                  <span className="text-stone-400"> ({durationMinutes} min)</span>
                </p>
                <p>
                  <span className="text-stone-500">Paciente:</span>{" "}
                  <strong>
                    {watch("last_name")}, {watch("first_name")}
                  </strong>
                </p>
                <p>
                  <span className="text-stone-500">DNI:</span> {watch("dni")}
                </p>
                <p>
                  <span className="text-stone-500">Teléfono:</span> {watch("phone")}
                </p>
                {watch("email") ? (
                  <p>
                    <span className="text-stone-500">Email:</span> {watch("email")}
                  </p>
                ) : null}
                <p>
                  <span className="text-stone-500">Motivo:</span> {watch("reason")}
                </p>
              </div>
              {settings?.booking_policy_text ? (
                <p className="whitespace-pre-line text-xs text-stone-500">
                  {settings.booking_policy_text}
                </p>
              ) : (
                <p className="text-xs text-stone-500">
                  Al confirmar, enviás una solicitud de turno pendiente de
                  confirmación por el profesional.
                </p>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={step === 1 || submitting}
            >
              <ChevronLeft className="h-4 w-4" />
              Atrás
            </Button>

            {step < 5 ? (
              <Button type="button" onClick={goNext}>
                Siguiente
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" loading={submitting}>
                Confirmar turno
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
