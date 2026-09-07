"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isBefore,
  parseISO,
  startOfMonth,
} from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock3,
  UserRound,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  bookingServiceLabel,
  bookingServicePrice,
  consultationPrice,
  anthropometryPrice,
} from "@/lib/booking";
import { friendlyError } from "@/lib/errors";
import { formatARS, formatDate, formatTime, todayISO } from "@/lib/utils";
import {
  publicBookingSchema,
  type PublicBookingValues,
} from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/states";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type {
  BookingServiceType,
  Clinic,
  SystemSettings,
  TimeSlot,
} from "@/types";

const STEPS = [
  { id: 1, label: "Valores", icon: Sparkles },
  { id: 2, label: "Día", icon: CalendarDays },
  { id: 3, label: "Horario", icon: Clock3 },
  { id: 4, label: "Datos", icon: UserRound },
  { id: 5, label: "Confirmar", icon: CheckCircle2 },
] as const;

type Step = (typeof STEPS)[number]["id"];

interface BookingFormProps {
  clinics: Clinic[];
  settings: SystemSettings | null;
}

const WEEKDAYS_MON_FIRST = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_SHORT = ["L", "M", "M", "J", "V", "S", "D"];

export function BookingForm({ clinics, settings }: BookingFormProps) {
  const timezone = settings?.timezone || "America/Argentina/Buenos_Aires";
  const maxAdvanceDays = settings?.max_advance_days ?? 60;
  const defaultDuration = settings?.appointment_duration_minutes ?? 40;

  const minDate = todayISO(timezone);
  const maxDate = format(addDays(parseISO(minDate), maxAdvanceDays), "yyyy-MM-dd");
  const consulta = consultationPrice(settings);
  const anthro = anthropometryPrice(settings);

  const [step, setStep] = useState<Step>(1);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [confirmedPatientName, setConfirmedPatientName] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(parseISO(minDate)));
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [loadingDates, setLoadingDates] = useState(false);

  const form = useForm<PublicBookingValues>({
    resolver: zodResolver(publicBookingSchema),
    defaultValues: {
      clinic_id: clinics[0]?.id ?? "",
      service_type: "consulta",
      appointment_date: "",
      start_time: "",
      end_time: "",
      first_name: "",
      last_name: "",
      dni: "",
      phone: "",
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
  const serviceType = watch("service_type") as BookingServiceType;
  const appointmentDate = watch("appointment_date");
  const startTime = watch("start_time");

  const selectedClinic = useMemo(
    () => clinics.find((c) => c.id === clinicId) ?? null,
    [clinics, clinicId]
  );

  const durationMinutes =
    selectedClinic?.appointment_duration_minutes || defaultDuration;

  const totalPrice = bookingServicePrice(settings, serviceType);

  const loadMonthDates = useCallback(
    async (cid: string, month: Date) => {
      if (!cid) {
        setAvailableDates(new Set());
        return;
      }
      const from = format(startOfMonth(month), "yyyy-MM-dd");
      const to = format(endOfMonth(month), "yyyy-MM-dd");
      setLoadingDates(true);
      try {
        const res = await fetch(
          `/api/availability?clinicId=${encodeURIComponent(cid)}&from=${from}&to=${to}`
        );
        const json = (await res.json()) as { dates?: string[]; error?: string };
        if (!res.ok) throw new Error(json.error || "No se pudo cargar el calendario.");
        setAvailableDates(new Set(json.dates ?? []));
      } catch (error) {
        toast.error(friendlyError(error, "No se pudieron cargar los días disponibles."));
        setAvailableDates(new Set());
      } finally {
        setLoadingDates(false);
      }
    },
    []
  );

  useEffect(() => {
    if (clinicId) void loadMonthDates(clinicId, monthCursor);
  }, [clinicId, monthCursor, loadMonthDates]);

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
        const res = await fetch(
          `/api/availability?clinicId=${encodeURIComponent(cid)}&date=${encodeURIComponent(date)}`
        );
        const json = (await res.json()) as {
          slots?: TimeSlot[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error || "No se pudieron cargar los horarios.");
        }
        setSlots(json.slots ?? []);
      } catch (error) {
        toast.error(friendlyError(error, "No se pudieron cargar los horarios."));
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    },
    [setValue]
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

  const selectDay = (iso: string) => {
    if (!availableDates.has(iso)) return;
    setValue("appointment_date", iso, { shouldValidate: true });
    setValue("start_time", "");
    setValue("end_time", "");
  };

  const goNext = async () => {
    if (step === 1) {
      const ok = await trigger(["clinic_id", "service_type"]);
      if (!ok || !clinicId) {
        toast.error("Elegí el servicio para continuar.");
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      const ok = await trigger("appointment_date");
      if (!ok || !appointmentDate || !availableDates.has(appointmentDate)) {
        toast.error("Seleccioná un día con horarios disponibles.");
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
      const ok = await trigger(["first_name", "last_name", "dni", "phone"]);
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
        p_email: null,
        p_reason: bookingServiceLabel(values.service_type),
        p_notes: null,
      });

      if (error) throw error;

      const fallbackName =
        `${values.first_name.trim()} ${values.last_name.trim()}`.trim();
      let appointmentId = "";
      let resolvedName = fallbackName;

      if (data && typeof data === "object" && "id" in data) {
        const result = data as {
          id: string;
          first_name?: string | null;
          last_name?: string | null;
        };
        appointmentId = result.id;
        resolvedName =
          [result.first_name, result.last_name].filter(Boolean).join(" ").trim() ||
          fallbackName;
      } else {
        appointmentId = typeof data === "string" ? data : String(data ?? "");
      }

      setConfirmationId(appointmentId);
      setConfirmedPatientName(resolvedName);
      setConfirmed(true);
      toast.success("Turno confirmado");
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo reservar el turno."));
    } finally {
      setSubmitting(false);
    }
  };

  const calendarCells = useMemo(() => {
    const start = startOfMonth(monthCursor);
    const end = endOfMonth(monthCursor);
    const startWeekday = (start.getDay() + 6) % 7;
    const daysInMonth = end.getDate();
    const cells: { iso: string | null; day: number | null }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ iso: null, day: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = format(new Date(start.getFullYear(), start.getMonth(), d), "yyyy-MM-dd");
      cells.push({ iso, day: d });
    }
    return cells;
  }, [monthCursor]);

  const canPrevMonth = !isBefore(addMonths(monthCursor, -1), startOfMonth(parseISO(minDate)));
  const canNextMonth = format(startOfMonth(monthCursor), "yyyy-MM") < format(startOfMonth(parseISO(maxDate)), "yyyy-MM")
    || format(monthCursor, "yyyy-MM") < format(parseISO(maxDate), "yyyy-MM");

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
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[var(--sage-soft)]">
            <CheckCircle2 className="h-8 w-8 text-[var(--green)]" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-[var(--foreground)]">
              Turno confirmado
            </h2>
            <p className="mt-2 text-stone-600">
              Tu consulta quedó reservada. Te esperamos en el día y horario elegidos.
            </p>
          </div>
          <div className="mx-auto max-w-md space-y-2 rounded-2xl border border-[var(--border)] bg-white p-5 text-left text-sm">
            <p>
              <span className="text-stone-500">Paciente:</span>{" "}
              <strong>
                {confirmedPatientName ||
                  `${values.first_name} ${values.last_name}`.trim()}
              </strong>
            </p>
            <p>
              <span className="text-stone-500">Servicio:</span>{" "}
              <strong>{bookingServiceLabel(values.service_type)}</strong>
            </p>
            <p>
              <span className="text-stone-500">Fecha:</span>{" "}
              <strong>{formatDate(values.appointment_date)}</strong>
            </p>
            <p>
              <span className="text-stone-500">Hora:</span>{" "}
              <strong>{formatTime(values.start_time)}</strong>
            </p>
            <p>
              <span className="text-stone-500">Consultorio:</span>{" "}
              <strong>{selectedClinic?.name}</strong>
            </p>
            <p>
              <span className="text-stone-500">Precio:</span>{" "}
              <strong>{formatARS(bookingServicePrice(settings, values.service_type))}</strong>
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
              setConfirmedPatientName(null);
              setStep(1);
              setSlots([]);
              form.reset({
                clinic_id: clinics[0]?.id ?? "",
                service_type: "consulta",
                appointment_date: "",
                start_time: "",
                end_time: "",
                first_name: "",
                last_name: "",
                dni: "",
                phone: "",
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
                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium sm:text-sm ${
                  active
                    ? "bg-[var(--green)] text-white"
                    : done
                      ? "bg-[var(--sage-soft)] text-[var(--green)]"
                      : "bg-[var(--background)] text-[var(--muted)]"
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
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Reservá tu turno
              </h2>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pink)]">
                  Valores de la consulta
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <p className="text-[var(--foreground)]">
                    Consulta nutricional{" "}
                    <strong>{formatARS(consulta)}</strong>
                  </p>
                  <p className="text-[var(--foreground)]">
                    Antropometría <strong>{formatARS(anthro)}</strong>
                  </p>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                  Los valores informados corresponden a los precios vigentes de la
                  consulta y antropometría.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  ¿Qué servicio necesitás?
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      ["consulta", "Consulta nutricional", consulta],
                      [
                        "consulta_antropometria",
                        "Consulta + antropometría",
                        consulta + anthro,
                      ],
                    ] as const
                  ).map(([value, label, price]) => {
                    const selected = serviceType === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setValue("service_type", value, { shouldValidate: true })
                        }
                        className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                          selected
                            ? "border-[var(--green)] bg-[var(--sage-soft)]"
                            : "border-[var(--border)] bg-white hover:border-[var(--pink)]"
                        }`}
                      >
                        <span className="text-sm font-medium text-[var(--foreground)]">
                          {label}
                        </span>
                        <span className="text-sm font-semibold text-[var(--pink)]">
                          {formatARS(price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <input type="hidden" {...register("service_type")} />
              </div>

              {clinics.length > 1 ? (
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
              ) : (
                <input type="hidden" {...register("clinic_id")} />
              )}

              {selectedClinic?.address ? (
                <p className="text-sm text-[var(--muted)]">{selectedClinic.address}</p>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Elegí el día
              </h2>
              <p className="text-sm text-stone-500">
                Solo se pueden elegir los días en los que hay atención y horarios
                libres.
              </p>

              <div className="rounded-[1.5rem] border border-[var(--border)] bg-white p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-40"
                    disabled={!canPrevMonth}
                    onClick={() => setMonthCursor((m) => addMonths(m, -1))}
                    aria-label="Mes anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <p className="text-sm font-semibold capitalize text-[var(--foreground)]">
                    {format(monthCursor, "MMMM yyyy", { locale: es })}
                  </p>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-40"
                    disabled={!canNextMonth}
                    onClick={() => setMonthCursor((m) => addMonths(m, 1))}
                    aria-label="Mes siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-[var(--muted)]">
                  {WEEKDAY_SHORT.map((d, i) => (
                    <div key={`${d}-${WEEKDAYS_MON_FIRST[i]}`} className="py-1">
                      {d}
                    </div>
                  ))}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {calendarCells.map((cell, idx) => {
                    if (!cell.iso || cell.day == null) {
                      return <div key={`e-${idx}`} className="h-10" />;
                    }
                    const available = availableDates.has(cell.iso);
                    const selected = appointmentDate === cell.iso;
                    const past = cell.iso < minDate;
                    const afterMax = cell.iso > maxDate;
                    const disabled = !available || past || afterMax;
                    return (
                      <button
                        key={cell.iso}
                        type="button"
                        disabled={disabled}
                        onClick={() => selectDay(cell.iso!)}
                        className={`h-10 rounded-full text-sm font-medium transition ${
                          selected
                            ? "bg-[var(--green)] text-white"
                            : disabled
                              ? "cursor-not-allowed text-[var(--muted)]/40"
                              : "text-[var(--foreground)] hover:bg-[var(--pink-mist)] hover:text-[var(--pink)]"
                        }`}
                      >
                        {cell.day}
                      </button>
                    );
                  })}
                </div>
                {loadingDates ? (
                  <p className="mt-3 flex items-center justify-center gap-2 text-xs text-[var(--muted)]">
                    <Spinner /> Buscando días con turnos…
                  </p>
                ) : availableDates.size === 0 ? (
                  <p className="mt-3 text-center text-xs text-[var(--muted)]">
                    No hay días con horarios libres en este mes. Probá el mes
                    siguiente o revisá los horarios del consultorio en
                    Administración.
                  </p>
                ) : null}
              </div>
              <input type="hidden" {...register("appointment_date")} />
              {errors.appointment_date ? (
                <p className="text-sm text-red-600">{errors.appointment_date.message}</p>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Elegí el horario
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
                    No hay horarios disponibles para este día. Probá con otro.
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
                        className={`rounded-full border px-3 py-3 text-sm font-medium transition ${
                          selected
                            ? "border-[var(--green)] bg-[var(--green)] text-white"
                            : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--pink)] hover:text-[var(--pink)]"
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
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
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
                  hint="El DNI identifica tu ficha. Si ya estás registrado, el turno se agenda a tu nombre guardado."
                  error={errors.dni?.message}
                  {...register("dni")}
                />
                <Input
                  label="Teléfono"
                  required
                  type="tel"
                  autoComplete="tel"
                  labelAddon={
                    <InfoTooltip text="Lo usamos para enviarte la confirmación del turno por WhatsApp." />
                  }
                  error={errors.phone?.message}
                  {...register("phone")}
                />
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-[var(--foreground)]">
                Confirmá tu turno
              </h2>
              <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-5 text-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--pink)]">
                  Resumen de tu turno
                </p>
                <p>
                  <span className="text-stone-500">Paciente:</span>{" "}
                  <strong>
                    {watch("first_name")} {watch("last_name")}
                  </strong>
                </p>
                <p>
                  <span className="text-stone-500">Servicio:</span>{" "}
                  <strong>{bookingServiceLabel(serviceType)}</strong>
                </p>
                <p>
                  <span className="text-stone-500">Fecha:</span>{" "}
                  <strong>
                    {appointmentDate ? formatDate(appointmentDate) : "—"}
                  </strong>
                </p>
                <p>
                  <span className="text-stone-500">Hora:</span>{" "}
                  <strong>{startTime ? formatTime(startTime) : "—"}</strong>
                  <span className="text-stone-400"> ({durationMinutes} min)</span>
                </p>
                <p>
                  <span className="text-stone-500">Consultorio:</span>{" "}
                  <strong>{selectedClinic?.name}</strong>
                </p>
                <p>
                  <span className="text-stone-500">Precio:</span>{" "}
                  <strong>{formatARS(totalPrice)}</strong>
                </p>
              </div>
              {settings?.booking_policy_text ? (
                <p className="whitespace-pre-line text-xs text-stone-500">
                  {settings.booking_policy_text}
                </p>
              ) : (
                <p className="text-xs text-stone-500">
                  Al confirmar, tu turno queda reservado.
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
