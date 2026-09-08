"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { invalidateCache } from "@/lib/query-cache";
import { refreshAdminNotifications } from "@/lib/admin-notifications-store";
import { minutesToTime, timeToMinutes } from "@/lib/utils";
import { createAppointment } from "@/services/appointments";
import { listClinics } from "@/services/settings";
import type { Clinic } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const rescheduleSchema = z.object({
  clinic_id: z.string().uuid("Seleccioná un consultorio"),
  appointment_date: z.string().min(1, "Seleccioná una fecha"),
  start_time: z.string().min(1, "Seleccioná un horario"),
  end_time: z.string().min(1),
  reason: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

type RescheduleFormValues = z.infer<typeof rescheduleSchema>;

function defaultEndTime(start: string, durationMinutes: number) {
  return minutesToTime(timeToMinutes(start) + durationMinutes);
}

type Props = {
  open: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  /** Motivo sugerido (ej. control / seguimiento). */
  suggestedReason?: string | null;
  onScheduled?: () => void;
};

export function RescheduleAfterEvolutionModal({
  open,
  onClose,
  patientId,
  patientName,
  suggestedReason,
  onScheduled,
}: Props) {
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<RescheduleFormValues>({
    resolver: zodResolver(rescheduleSchema) as Resolver<RescheduleFormValues>,
    defaultValues: {
      clinic_id: "",
      appointment_date: format(addDays(new Date(), 14), "yyyy-MM-dd"),
      start_time: "09:00",
      end_time: "09:40",
      reason: "",
      notes: "",
    },
  });

  const clinicId = form.watch("clinic_id");
  const startTime = form.watch("start_time");

  const duration = useMemo(() => {
    return (
      clinics.find((c) => c.id === clinicId)?.appointment_duration_minutes ?? 40
    );
  }, [clinics, clinicId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoadingClinics(true);
      try {
        const supabase = createClient();
        const rows = await listClinics(supabase, true);
        if (cancelled) return;
        setClinics(rows);
        const first = rows[0]?.id ?? "";
        const dur = rows[0]?.appointment_duration_minutes ?? 40;
        form.reset({
          clinic_id: first,
          appointment_date: format(addDays(new Date(), 14), "yyyy-MM-dd"),
          start_time: "09:00",
          end_time: defaultEndTime("09:00", dur),
          reason: suggestedReason?.trim() || "Control / seguimiento",
          notes: "",
        });
      } catch (error) {
        toast.error(
          friendlyError(error, "No se pudieron cargar los consultorios.")
        );
      } finally {
        if (!cancelled) setLoadingClinics(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Solo al abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, patientId, suggestedReason]);

  useEffect(() => {
    if (!open || !startTime) return;
    form.setValue("end_time", defaultEndTime(startTime, duration));
  }, [duration, startTime, open, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const supabase = createClient();
      await createAppointment(supabase, {
        clinic_id: values.clinic_id,
        patient_id: patientId,
        appointment_date: values.appointment_date,
        start_time:
          values.start_time.length === 5
            ? `${values.start_time}:00`
            : values.start_time,
        end_time:
          values.end_time.length === 5
            ? `${values.end_time}:00`
            : values.end_time,
        status: "confirmado",
        reason: values.reason || null,
        notes: values.notes || null,
        is_public_request: false,
      });
      toast.success(`Turno agendado para ${patientName}`);
      invalidateCache("appointments");
      void refreshAdminNotifications(true);
      onScheduled?.();
      onClose();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo agendar el turno."));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="¿Agendar próximo turno?"
      className="sm:max-w-lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Ahora no
          </Button>
          <Button
            type="button"
            loading={saving}
            disabled={loadingClinics || clinics.length === 0}
            onClick={() => void onSubmit()}
          >
            Agendar turno
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted)]">
          La evolución ya quedó guardada. Si querés, podés dejar un próximo
          turno para <span className="font-medium text-[var(--foreground)]">{patientName}</span>.
          No es obligatorio.
        </p>

        {clinics.length === 0 && !loadingClinics ? (
          <p className="text-sm text-[var(--pink)]">
            No hay consultorios activos. Cargalos en Admin → Consultorios.
          </p>
        ) : (
          <div className="grid gap-3">
            <Select
              label="Consultorio"
              required
              options={clinics.map((c) => ({ value: c.id, label: c.name }))}
              error={form.formState.errors.clinic_id?.message}
              {...form.register("clinic_id")}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Fecha"
                type="date"
                required
                className="sm:col-span-1"
                error={form.formState.errors.appointment_date?.message}
                {...form.register("appointment_date")}
              />
              <Input
                label="Inicio"
                type="time"
                required
                error={form.formState.errors.start_time?.message}
                {...form.register("start_time")}
              />
              <Input
                label="Fin"
                type="time"
                required
                error={form.formState.errors.end_time?.message}
                {...form.register("end_time")}
              />
            </div>
            <Input
              label="Motivo"
              placeholder="Control / seguimiento"
              {...form.register("reason")}
            />
            <Textarea
              label="Notas (opcional)"
              rows={2}
              {...form.register("notes")}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
