"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  addDays,
  endOfWeek,
  format,
  parseISO,
} from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  UserRound,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  bookingServiceLabel,
  bookingServicePrice,
  bookingShowCombined,
  consultationPrice,
  anthropometryPrice,
} from "@/lib/booking";
import { resolveSettingsPrices } from "@/lib/price-settings";
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
  { id: 1, label: "Servicio", icon: Sparkles },
  { id: 2, label: "Día y hora", icon: CalendarDays },
  { id: 3, label: "Datos", icon: UserRound },
  { id: 4, label: "Confirmar", icon: CheckCircle2 },
] as const;

type Step = (typeof STEPS)[number]["id"];

interface BookingFormProps {
  clinics: Clinic[];
  settings: SystemSettings | null;
}

/** Domingo de la semana (lun–dom) de una fecha ISO. */
function endOfWeekISO(iso: string) {
  return format(endOfWeek(parseISO(iso), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

function clampISO(iso: string, max: string) {
  return iso > max ? max : iso;
}

export function BookingForm({ clinics, settings }: BookingFormProps) {
  const timezone = settings?.timezone || "America/Argentina/Buenos_Aires";
  const maxAdvanceDays = settings?.max_advance_days ?? 60;
  const defaultDuration = settings?.appointment_duration_minutes ?? 40;

  const minDate = todayISO(timezone);
  const maxDate = format(addDays(parseISO(minDate), maxAdvanceDays), "yyyy-MM-dd");
  const consulta = consultationPrice(settings);
  const anthro = anthropometryPrice(settings);
  const priceMeta = resolveSettingsPrices(settings);
  const showCombined = bookingShowCombined(settings);

  const [step, setStep] = useState<Step>(1);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmationId, setConfirmationId] = useState<string | null>(null);
  const [confirmedPatientName, setConfirmedPatientName] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState(() =>
    clampISO(endOfWeekISO(minDate), maxDate)
  );
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

  useEffect(() => {
    if (!showCombined && serviceType === "consulta_antropometria") {
      setValue("service_type", "consulta", { shouldValidate: true });
    }
  }, [showCombined, serviceType, setValue]);

  const selectedClinic = useMemo(
    () => clinics.find((c) => c.id === clinicId) ?? null,
    [clinics, clinicId]
  );

  const durationMinutes =
    selectedClinic?.appointment_duration_minutes || defaultDuration;

  const totalPrice = bookingServicePrice(settings, serviceType);

  const loadDateRange = useCallback(
    async (cid: string, from: string, to: string) => {
      if (!cid) {
        setAvailableDates(new Set());
        return;
      }
      const cappedTo = to > maxDate ? maxDate : to;
      const cappedFrom = from < minDate ? minDate : from;
      if (cappedFrom > cappedTo) {
        setAvailableDates(new Set());
        return;
      }
      setLoadingDates(true);
      try {
        const res = await fetch(
          `/api/availability?clinicId=${encodeURIComponent(cid)}&from=${cappedFrom}&to=${cappedTo}`
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
    [maxDate, minDate]
  );

  useEffect(() => {
    if (clinicId) void loadDateRange(clinicId, minDate, rangeEnd);
  }, [clinicId, minDate, rangeEnd, loadDateRange]);

  const upcomingDays = useMemo(() => {
    return Array.from(availableDates)
      .filter((d) => d >= minDate && d <= maxDate)
      .sort();
  }, [availableDates, minDate, maxDate]);

  const canExtendRange = rangeEnd < maxDate;

  const extendRange = () => {
    setRangeEnd((prev) => {
      // Siguiente semana completa a partir del día siguiente al rango actual
      const nextWeekEnd = endOfWeekISO(
        format(addDays(parseISO(prev), 1), "yyyy-MM-dd")
      );
      return clampISO(nextWeekEnd, maxDate);
    });
  };

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
      const okDate = await trigger("appointment_date");
      const okTime = await trigger(["start_time", "end_time"]);
      if (!okDate || !appointmentDate || !availableDates.has(appointmentDate)) {
        toast.error("Elegí un día disponible.");
        return;
      }
      if (!okTime || !startTime) {
        toast.error("Elegí un horario disponible.");
        return;
      }
      setStep(3);
      return;
    }

    if (step === 3) {
      const ok = await trigger(["first_name", "last_name", "dni", "phone"]);
      if (!ok) {
        toast.error("Revisá tus datos antes de continuar.");
        return;
      }
      setStep(4);
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
        p_reason: bookingServiceLabel(values.service_type, settings),
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

      // Cloud API: confirmación al instante (sin botón ni PC)
      if (appointmentId) {
        try {
          await fetch("/api/whatsapp/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ appointmentId }),
          });
        } catch {
          /* el cron reintenta */
        }
      }
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
              <strong>{bookingServiceLabel(values.service_type, settings)}</strong>
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
                  Valores
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <p className="text-[var(--foreground)]">
                    {priceMeta.consultation_label}{" "}
                    <strong>{formatARS(consulta)}</strong>
                  </p>
                  <p className="text-[var(--foreground)]">
                    {priceMeta.anthropometry_label}{" "}
                    <strong>{formatARS(anthro)}</strong>
                  </p>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                  Los valores informados corresponden a los precios vigentes.
                </p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  ¿Qué servicio necesitás?
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(
                    (
                      [
                        ["consulta", priceMeta.consultation_label, consulta],
                        ["antropometria", priceMeta.anthropometry_label, anthro],
                        ...(showCombined
                          ? ([
                              [
                                "consulta_antropometria",
                                priceMeta.combo_label,
                                consulta + anthro,
                              ],
                            ] as const)
                          : []),
                      ] as const
                    ) as ReadonlyArray<
                      readonly [BookingServiceType, string, number]
                    >
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
                  options={clinics.map((c) => ({ value: c.id, label: c.name }))}
                  error={errors.clinic_id?.message}
                  {...register("clinic_id", {
                    onChange: () => {
                      setValue("appointment_date", "");
                      setValue("start_time", "");
                      setValue("end_time", "");
                      setSlots([]);
                      setRangeEnd(clampISO(endOfWeekISO(minDate), maxDate));
                    },
                  })}
                  value={clinicId}
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
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold text-[var(--foreground)]">
                  Elegí día y horario
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Primero ves los días libres de esta semana. Si necesitás otra
                  fecha, tocá “Ver más días”.
                </p>
              </div>

              {loadingDates && upcomingDays.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-10 text-[var(--muted)]">
                  <Spinner />
                  <span className="text-sm">Buscando días disponibles…</span>
                </div>
              ) : upcomingDays.length === 0 ? (
                <div className="space-y-3 rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center">
                  <p className="text-sm text-[var(--muted)]">
                    No hay días libres esta semana.
                  </p>
                  {canExtendRange ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={loadingDates}
                      onClick={extendRange}
                    >
                      Ver más días
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Día
                  </p>
                  <div className="flex flex-col gap-2">
                    {upcomingDays.map((iso) => {
                      const selected = appointmentDate === iso;
                      const label = format(
                        parseISO(iso),
                        "EEEE d 'de' MMMM",
                        { locale: es }
                      );
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => selectDay(iso)}
                          className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium capitalize transition ${
                            selected
                              ? "border-[var(--green)] bg-[var(--sage-soft)] text-[var(--green)]"
                              : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--pink)]"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {canExtendRange ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      loading={loadingDates}
                      onClick={extendRange}
                    >
                      Ver más días
                    </Button>
                  ) : null}
                </div>
              )}

              <input type="hidden" {...register("appointment_date")} />
              {errors.appointment_date ? (
                <p className="text-sm text-red-600">
                  {errors.appointment_date.message}
                </p>
              ) : null}

              {appointmentDate ? (
                <div className="space-y-3 border-t border-[var(--border)] pt-5">
                  <p className="text-sm font-medium text-[var(--foreground)]">
                    Horario
                    <span className="ml-1 font-normal capitalize text-[var(--muted)]">
                      ·{" "}
                      {format(parseISO(appointmentDate), "EEEE d/MM", {
                        locale: es,
                      })}
                    </span>
                  </p>
                  {loadingSlots ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-[var(--muted)]">
                      <Spinner />
                      <span className="text-sm">Buscando horarios…</span>
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--muted)]">
                      No quedaron horarios libres ese día. Elegí otro.
                    </p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {slots.map((slot) => {
                        const selected = startTime === slot.start;
                        return (
                          <button
                            key={`${slot.start}-${slot.end}`}
                            type="button"
                            onClick={() => selectSlot(slot)}
                            className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                              selected
                                ? "border-[var(--green)] bg-[var(--green)] text-white"
                                : "border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--pink)]"
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
                    <p className="text-sm text-red-600">
                      {errors.start_time.message}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
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

          {step === 4 ? (
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
                  <strong>{bookingServiceLabel(serviceType, settings)}</strong>
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

            {step < 4 ? (
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
