"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Bell, Clock3, Palette, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { settingsSchema, type SettingsFormValues } from "@/lib/validations";
import { getSystemSettings, updateSystemSettings } from "@/services/settings";
import type { SystemSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Skeleton } from "@/components/ui/states";
import { ProfileAvatarEditor } from "@/components/admin/profile-avatar";

type Section = "perfil" | "horarios" | "notificaciones" | "sistema";

const SECTIONS: { id: Section; label: string; icon: typeof UserRound }[] = [
  { id: "perfil", label: "Perfil", icon: UserRound },
  { id: "horarios", label: "Horarios / Turnos", icon: Clock3 },
  { id: "notificaciones", label: "Notificaciones", icon: Bell },
  { id: "sistema", label: "Sistema", icon: Palette },
];

function settingsToForm(data: SystemSettings): SettingsFormValues {
  return {
    site_name: data.site_name,
    professional_name: data.professional_name,
    description: data.description ?? "",
    phone: data.phone ?? "",
    whatsapp: data.whatsapp ?? "",
    email: data.email ?? "",
    address: data.address ?? "",
    social_instagram: data.social_instagram ?? "",
    social_facebook: data.social_facebook ?? "",
    social_tiktok: data.social_tiktok ?? "",
    primary_color: data.primary_color ?? "#2D6A4F",
    secondary_color: data.secondary_color ?? "#95D5B2",
    accent_color: data.accent_color ?? "#1B4332",
    timezone: data.timezone || "America/Argentina/Buenos_Aires",
    appointment_duration_minutes: data.appointment_duration_minutes,
    min_advance_hours: data.min_advance_hours,
    max_advance_days: data.max_advance_days,
    auto_create_patient_on_booking: data.auto_create_patient_on_booking,
    reminder_enabled: data.reminder_enabled,
    reminder_hours_before: data.reminder_hours_before,
    reminder_day_of_appointment: data.reminder_day_of_appointment,
    booking_policy_text: data.booking_policy_text ?? "",
    about_text: data.about_text ?? "",
    how_to_book_text: data.how_to_book_text ?? "",
    footer_text: data.footer_text ?? "",
  };
}

export function SettingsManager() {
  const supabase = useMemo(() => createClient(), []);
  const [section, setSection] = useState<Section>("perfil");
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema) as Resolver<SettingsFormValues>,
    defaultValues: {
      site_name: "",
      professional_name: "",
      description: "",
      phone: "",
      whatsapp: "",
      email: "",
      address: "",
      social_instagram: "",
      social_facebook: "",
      social_tiktok: "",
      primary_color: "#2D6A4F",
      secondary_color: "#95D5B2",
      accent_color: "#1B4332",
      timezone: "America/Argentina/Buenos_Aires",
      appointment_duration_minutes: 40,
      min_advance_hours: 2,
      max_advance_days: 60,
      auto_create_patient_on_booking: true,
      reminder_enabled: false,
      reminder_hours_before: 24,
      reminder_day_of_appointment: true,
      booking_policy_text: "",
      about_text: "",
      how_to_book_text: "",
      footer_text: "",
    },
  });

  const { reset } = form;

  const load = useCallback(async () => {
    const cached = getCached<SystemSettings>("settings");
    if (cached) {
      setSettings(cached);
      reset(settingsToForm(cached));
      setLoading(false);
    } else {
      setLoading(true);
    }
    try {
      const data = await getSystemSettings(supabase);
      if (!data) {
        toast.error("No se encontraron ajustes del sistema.");
        return;
      }
      setSettings(data);
      reset(settingsToForm(data));
      setCached("settings", data);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo cargar la configuración."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depend on reset only, not entire form
  }, [supabase, reset]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(values: SettingsFormValues) {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await updateSystemSettings(supabase, settings.id, {
        site_name: values.site_name,
        professional_name: values.professional_name,
        description: values.description || null,
        phone: values.phone || null,
        whatsapp: values.whatsapp || null,
        email: values.email || null,
        address: values.address || null,
        social_instagram: values.social_instagram || null,
        social_facebook: values.social_facebook || null,
        social_tiktok: values.social_tiktok || null,
        primary_color: values.primary_color || null,
        secondary_color: values.secondary_color || null,
        accent_color: values.accent_color || null,
        timezone: values.timezone || "America/Argentina/Buenos_Aires",
        appointment_duration_minutes: values.appointment_duration_minutes,
        min_advance_hours: values.min_advance_hours,
        max_advance_days: values.max_advance_days,
        auto_create_patient_on_booking: values.auto_create_patient_on_booking,
        reminder_enabled: values.reminder_enabled,
        reminder_hours_before: values.reminder_hours_before,
        reminder_day_of_appointment: values.reminder_day_of_appointment,
        booking_policy_text: values.booking_policy_text || null,
        about_text: values.about_text || null,
        how_to_book_text: values.how_to_book_text || null,
        footer_text: values.footer_text || null,
      });
      setSettings(updated);
      invalidateCache("settings");
      setCached("settings", updated);
      toast.success("Configuración guardada");
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo guardar la configuración."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Configuración"
        description="Perfil profesional, políticas de turnos, recordatorios y apariencia."
        actions={
          <Button
            loading={saving}
            disabled={loading || !settings}
            onClick={form.handleSubmit(onSubmit)}
          >
            Guardar cambios
          </Button>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-56 lg:flex-col">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                section === id
                  ? "bg-[var(--pink)] text-white"
                  : "bg-white text-stone-600 hover:bg-[var(--pink-mist)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        <Card className="min-w-0 flex-1">
          <CardHeader>
            <CardTitle>
              {SECTIONS.find((s) => s.id === section)?.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-10 w-full max-w-md" />
              </div>
            ) : (
              <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
                {section === "perfil" ? (
                  <div className="space-y-6">
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                      <ProfileAvatarEditor />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Nombre del sitio"
                      required
                      error={form.formState.errors.site_name?.message}
                      {...form.register("site_name")}
                    />
                    <Input
                      label="Nombre profesional"
                      required
                      error={form.formState.errors.professional_name?.message}
                      {...form.register("professional_name")}
                    />
                    <Textarea
                      label="Descripción"
                      className="sm:col-span-2"
                      {...form.register("description")}
                    />
                    <Input label="Teléfono" {...form.register("phone")} />
                    <Input
                      label="Email"
                      error={form.formState.errors.email?.message}
                      {...form.register("email")}
                    />
                    <Input
                      label="Dirección"
                      className="sm:col-span-2"
                      {...form.register("address")}
                    />
                    <Input label="Instagram" {...form.register("social_instagram")} />
                    <Input label="Facebook" {...form.register("social_facebook")} />
                    <Input label="TikTok" {...form.register("social_tiktok")} />
                    <Textarea
                      label="Texto sobre mí / el consultorio"
                      className="sm:col-span-2"
                      {...form.register("about_text")}
                    />
                    </div>
                  </div>
                ) : null}

                {section === "horarios" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      type="number"
                      label="Duración por defecto (min)"
                      min={10}
                      max={180}
                      error={form.formState.errors.appointment_duration_minutes?.message}
                      {...form.register("appointment_duration_minutes")}
                    />
                    <Input
                      type="number"
                      label="Anticipación mínima (horas)"
                      min={0}
                      max={168}
                      error={form.formState.errors.min_advance_hours?.message}
                      {...form.register("min_advance_hours")}
                    />
                    <Input
                      type="number"
                      label="Reserva máxima (días)"
                      min={1}
                      max={365}
                      error={form.formState.errors.max_advance_days?.message}
                      {...form.register("max_advance_days")}
                    />
                    <label className="flex items-center gap-2 self-end pb-2 text-sm sm:col-span-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded"
                        {...form.register("auto_create_patient_on_booking")}
                      />
                      Crear paciente automáticamente al reservar online
                    </label>
                    <Textarea
                      label="Política de turnos / cancelaciones"
                      className="sm:col-span-2"
                      {...form.register("booking_policy_text")}
                    />
                    <Textarea
                      label="Cómo reservar (texto público)"
                      className="sm:col-span-2"
                      {...form.register("how_to_book_text")}
                    />
                  </div>
                ) : null}

                {section === "notificaciones" ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      Los recordatorios están preparados para una futura integración con{" "}
                      <strong>WhatsApp Business API</strong> oficial. No se usa ni se
                      integrará ninguna API no oficial de WhatsApp.
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Input
                        label="WhatsApp (número comercial)"
                        hint="Solo se guarda el número; el envío automático requiere WhatsApp Business API."
                        {...form.register("whatsapp")}
                      />
                      <Input
                        type="number"
                        label="Horas antes del recordatorio"
                        min={1}
                        max={72}
                        error={form.formState.errors.reminder_hours_before?.message}
                        {...form.register("reminder_hours_before")}
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded"
                          {...form.register("reminder_enabled")}
                        />
                        Habilitar recordatorios (cuando esté la API oficial)
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded"
                          {...form.register("reminder_day_of_appointment")}
                        />
                        Recordatorio el día del turno
                      </label>
                    </div>
                  </div>
                ) : null}

                {section === "sistema" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Color primario"
                      type="color"
                      className="h-11 py-1"
                      {...form.register("primary_color")}
                    />
                    <Input
                      label="Color secundario"
                      type="color"
                      className="h-11 py-1"
                      {...form.register("secondary_color")}
                    />
                    <Input
                      label="Color acento"
                      type="color"
                      className="h-11 py-1"
                      {...form.register("accent_color")}
                    />
                    <Input
                      label="Zona horaria"
                      hint="Por defecto America/Argentina/Buenos_Aires"
                      {...form.register("timezone")}
                    />
                    <Textarea
                      label="Texto del pie de página"
                      className="sm:col-span-2"
                      {...form.register("footer_text")}
                    />
                  </div>
                ) : null}

                <div className="flex justify-end pt-2">
                  <Button type="submit" loading={saving} disabled={!settings}>
                    Guardar sección
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
