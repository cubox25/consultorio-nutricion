"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Clock3,
  Palette,
  UserRound,
  Banknote,
  LayoutTemplate,
  KeyRound,
  Plus,
  Trash2,
  Apple,
  Scale,
  Salad,
  HeartPulse,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { formatARS } from "@/lib/utils";
import { resolveSettingsPrices } from "@/lib/price-settings";
import {
  DEFAULT_LANDING_CONTENT,
  resolveLandingContent,
  withLandingContent,
  type LandingContent,
  type LandingServiceIcon,
} from "@/lib/landing-content";
import { settingsSchema, type SettingsFormValues } from "@/lib/validations";
import { getSystemSettings, updateSystemSettings } from "@/services/settings";
import type { SystemSettings } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Skeleton } from "@/components/ui/states";
import { ProfileAvatarEditor } from "@/components/admin/profile-avatar";
import { AccountSecurityEditor } from "@/components/admin/account-security-editor";
import { LogoEditor } from "@/components/admin/logo-editor";
import { LandingPhotoEditor } from "@/components/admin/landing-photo-editor";

type Section =
  | "perfil"
  | "cuenta"
  | "inicio"
  | "horarios"
  | "precios"
  | "sistema";

const SECTIONS: { id: Section; label: string; icon: typeof UserRound }[] = [
  { id: "perfil", label: "Perfil", icon: UserRound },
  { id: "cuenta", label: "Mi cuenta", icon: KeyRound },
  { id: "inicio", label: "Página de inicio", icon: LayoutTemplate },
  { id: "horarios", label: "Horarios / Turnos", icon: Clock3 },
  { id: "precios", label: "Precios de consultas", icon: Banknote },
  { id: "sistema", label: "Sistema", icon: Palette },
];

const ICON_OPTIONS: {
  value: LandingServiceIcon;
  label: string;
  Icon: LucideIcon;
}[] = [
  { value: "apple", label: "Manzana", Icon: Apple },
  { value: "scale", label: "Balanza", Icon: Scale },
  { value: "salad", label: "Ensalada", Icon: Salad },
  { value: "heart", label: "Corazón", Icon: HeartPulse },
  { value: "trending-down", label: "Descenso", Icon: TrendingDown },
  { value: "trending-up", label: "Ascenso", Icon: TrendingUp },
];

function landingToFormFields(landing: LandingContent) {
  return {
    hero_title: landing.hero_title,
    hero_card_eyebrow: landing.hero_card_eyebrow,
    hero_card_tagline: landing.hero_card_tagline,
    professional_title: landing.professional_title,
    about_section_label: landing.about_section_label,
    about_section_title: landing.about_section_title,
    about_section_body: landing.about_section_body,
    about_highlights_text: landing.about_highlights.join("\n"),
    services_section_label: landing.services_section_label,
    services_section_title: landing.services_section_title,
    clinics_section_label: landing.clinics_section_label,
    clinics_section_title: landing.clinics_section_title,
    cta_title: landing.cta_title,
    cta_subtitle: landing.cta_subtitle,
    landing_services: landing.services,
  };
}

function settingsToForm(data: SystemSettings): SettingsFormValues {
  const landing = resolveLandingContent({
    services_json: data.services_json,
    description: data.description,
  });
  return {
    site_name: data.site_name,
    professional_name: data.professional_name,
    description: data.description ?? landing.hero_subtitle,
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
    booking_cutoff_minutes: data.booking_cutoff_minutes ?? 30,
    max_advance_days: data.max_advance_days,
    auto_create_patient_on_booking: data.auto_create_patient_on_booking,
    reminder_enabled: data.reminder_enabled,
    reminder_hours_before: data.reminder_hours_before,
    reminder_day_of_appointment: data.reminder_day_of_appointment,
    booking_policy_text: data.booking_policy_text ?? "",
    about_text: data.about_text ?? "",
    how_to_book_text: data.how_to_book_text ?? "",
    footer_text: data.footer_text ?? "",
    consultation_price: resolveSettingsPrices(data).consultation_price,
    anthropometry_price: resolveSettingsPrices(data).anthropometry_price,
    ...landingToFormFields(landing),
  };
}

function formToLandingContent(values: SettingsFormValues): LandingContent {
  const highlights = (values.about_highlights_text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const services = (values.landing_services || [])
    .map((service) => ({
      title: service.title.trim(),
      description: (service.description || "").trim(),
      icon: service.icon,
    }))
    .filter((service) => service.title);

  return {
    hero_title: values.hero_title?.trim() || DEFAULT_LANDING_CONTENT.hero_title,
    hero_subtitle:
      values.description?.trim() || DEFAULT_LANDING_CONTENT.hero_subtitle,
    hero_card_eyebrow:
      values.hero_card_eyebrow?.trim() ||
      DEFAULT_LANDING_CONTENT.hero_card_eyebrow,
    hero_card_tagline:
      values.hero_card_tagline?.trim() ||
      DEFAULT_LANDING_CONTENT.hero_card_tagline,
    professional_title: values.professional_title?.trim() || "",
    about_section_label:
      values.about_section_label?.trim() ||
      DEFAULT_LANDING_CONTENT.about_section_label,
    about_section_title:
      values.about_section_title?.trim() ||
      DEFAULT_LANDING_CONTENT.about_section_title,
    about_section_body:
      values.about_section_body?.trim() ||
      DEFAULT_LANDING_CONTENT.about_section_body,
    about_highlights: highlights.length
      ? highlights
      : DEFAULT_LANDING_CONTENT.about_highlights,
    services_section_label:
      values.services_section_label?.trim() ||
      DEFAULT_LANDING_CONTENT.services_section_label,
    services_section_title:
      values.services_section_title?.trim() ||
      DEFAULT_LANDING_CONTENT.services_section_title,
    services: services.length ? services : DEFAULT_LANDING_CONTENT.services,
    clinics_section_label:
      values.clinics_section_label?.trim() ||
      DEFAULT_LANDING_CONTENT.clinics_section_label,
    clinics_section_title:
      values.clinics_section_title?.trim() ||
      DEFAULT_LANDING_CONTENT.clinics_section_title,
    cta_title: values.cta_title?.trim() || DEFAULT_LANDING_CONTENT.cta_title,
    cta_subtitle:
      values.cta_subtitle?.trim() || DEFAULT_LANDING_CONTENT.cta_subtitle,
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
      min_advance_hours: 0,
      booking_cutoff_minutes: 30,
      max_advance_days: 60,
      auto_create_patient_on_booking: true,
      reminder_enabled: false,
      reminder_hours_before: 24,
      reminder_day_of_appointment: true,
      booking_policy_text: "",
      about_text: "",
      how_to_book_text: "",
      footer_text: "",
      consultation_price: 0,
      anthropometry_price: 0,
      ...landingToFormFields(DEFAULT_LANDING_CONTENT),
    },
  });

  const { reset, control } = form;
  const servicesArray = useFieldArray({
    control,
    name: "landing_services",
  });

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
  }, [supabase, reset]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(values: SettingsFormValues) {
    if (!settings) return;
    setSaving(true);
    try {
      const landing = formToLandingContent(values);
      const services_json = withLandingContent(
        settings.services_json,
        landing
      );
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
        booking_cutoff_minutes: values.booking_cutoff_minutes,
        max_advance_days: values.max_advance_days,
        auto_create_patient_on_booking: values.auto_create_patient_on_booking,
        reminder_enabled: values.reminder_enabled,
        reminder_hours_before: values.reminder_hours_before,
        reminder_day_of_appointment: values.reminder_day_of_appointment,
        booking_policy_text: values.booking_policy_text || null,
        about_text: values.about_text || null,
        how_to_book_text: values.how_to_book_text || null,
        footer_text: values.footer_text || null,
        consultation_price: Number(values.consultation_price) || 0,
        anthropometry_price: Number(values.anthropometry_price) || 0,
        services_json,
      });
      setSettings(updated);
      invalidateCache("settings");
      setCached("settings", updated);
      toast.success("Configuración guardada. La página de inicio ya refleja los cambios.");
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
        description="Perfil profesional, mi cuenta, textos de la web, políticas de turnos y apariencia."
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
              <>
                <div className="space-y-4">
                  {section === "perfil" ? (
                    <>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                        <LogoEditor />
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                        <LandingPhotoEditor />
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                        <ProfileAvatarEditor />
                      </div>
                    </>
                  ) : null}

                  {section === "cuenta" ? (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
                      <AccountSecurityEditor />
                    </div>
                  ) : null}

                  {section !== "cuenta" ? (
                  <form
                    className="space-y-4"
                    onSubmit={form.handleSubmit(onSubmit)}
                  >
                    {section === "perfil" ? (
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
                          hint="Se muestra en Sobre mí (ej: Pamela Guerrero)."
                          error={form.formState.errors.professional_name?.message}
                          {...form.register("professional_name")}
                        />
                        <Input
                          label="Título profesional"
                          hint="Opcional. Dejalo vacío si no querés mostrar título."
                          className="sm:col-span-2"
                          {...form.register("professional_title")}
                        />
                        <Input label="Teléfono" {...form.register("phone")} />
                        <Input
                          label="WhatsApp (botón del sitio)"
                          hint="Número que se usa en los botones de contacto del sitio público."
                          {...form.register("whatsapp")}
                        />
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
                        <Input
                          label="Instagram"
                          {...form.register("social_instagram")}
                        />
                        <Input
                          label="Facebook"
                          {...form.register("social_facebook")}
                        />
                        <Input
                          label="TikTok"
                          {...form.register("social_tiktok")}
                        />
                        <Textarea
                          label="Texto sobre mí / el consultorio"
                          hint="Biografía de la tarjeta Sobre mí."
                          className="sm:col-span-2"
                          {...form.register("about_text")}
                        />
                      </div>
                    ) : null}

                    {section === "inicio" ? (
                      <div className="space-y-8">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <p className="text-sm font-semibold text-[var(--foreground)] sm:col-span-2">
                            Hero (primera sección)
                          </p>
                          <Textarea
                            label="Título principal"
                            className="sm:col-span-2"
                            {...form.register("hero_title")}
                          />
                          <Textarea
                            label="Subtítulo / descripción"
                            hint="También se usa como descripción general del sitio."
                            className="sm:col-span-2"
                            {...form.register("description")}
                          />
                          <Input
                            label="Etiqueta de la tarjeta"
                            {...form.register("hero_card_eyebrow")}
                          />
                          <Input
                            label="Frase de la tarjeta"
                            {...form.register("hero_card_tagline")}
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <p className="text-sm font-semibold text-[var(--foreground)] sm:col-span-2">
                            Sección Sobre mí
                          </p>
                          <Input
                            label="Etiqueta"
                            {...form.register("about_section_label")}
                          />
                          <Input
                            label="Título"
                            className="sm:col-span-2"
                            {...form.register("about_section_title")}
                          />
                          <Textarea
                            label="Párrafo"
                            className="sm:col-span-2"
                            {...form.register("about_section_body")}
                          />
                          <Textarea
                            label="Destacados (uno por línea)"
                            className="sm:col-span-2"
                            {...form.register("about_highlights_text")}
                          />
                        </div>

                        <div className="space-y-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <p className="text-sm font-semibold text-[var(--foreground)] sm:col-span-2">
                              Servicios
                            </p>
                            <Input
                              label="Etiqueta"
                              {...form.register("services_section_label")}
                            />
                            <Input
                              label="Título de sección"
                              className="sm:col-span-2"
                              {...form.register("services_section_title")}
                            />
                          </div>

                          <div className="space-y-3">
                            {servicesArray.fields.map((field, index) => (
                              <div
                                key={field.id}
                                className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4"
                              >
                                <div className="mb-3 flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium">
                                    Servicio {index + 1}
                                  </p>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="h-9 px-3"
                                    onClick={() => servicesArray.remove(index)}
                                    disabled={servicesArray.fields.length <= 1}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <Input
                                    label="Título"
                                    {...form.register(
                                      `landing_services.${index}.title`
                                    )}
                                  />
                                  <div className="space-y-1.5 sm:col-span-2">
                                    <p className="text-sm font-medium text-[var(--foreground)]">
                                      Ícono
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {ICON_OPTIONS.map(
                                        ({ value, label, Icon }) => {
                                          const selected =
                                            form.watch(
                                              `landing_services.${index}.icon`
                                            ) === value;
                                          return (
                                            <button
                                              key={value}
                                              type="button"
                                              title={label}
                                              aria-label={label}
                                              aria-pressed={selected}
                                              onClick={() =>
                                                form.setValue(
                                                  `landing_services.${index}.icon`,
                                                  value,
                                                  {
                                                    shouldDirty: true,
                                                    shouldValidate: true,
                                                  }
                                                )
                                              }
                                              className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition ${
                                                selected
                                                  ? "border-[var(--pink)] bg-[var(--pink-mist)] text-[var(--pink)] ring-2 ring-[var(--pink)]/30"
                                                  : "border-[var(--border)] bg-white text-[var(--green)] hover:border-[var(--pink-soft)] hover:bg-[var(--pink-mist)]/60"
                                              }`}
                                            >
                                              <Icon className="h-5 w-5" />
                                            </button>
                                          );
                                        }
                                      )}
                                    </div>
                                    <input
                                      type="hidden"
                                      {...form.register(
                                        `landing_services.${index}.icon`
                                      )}
                                    />
                                  </div>
                                  <Textarea
                                    label="Descripción"
                                    className="sm:col-span-2"
                                    {...form.register(
                                      `landing_services.${index}.description`
                                    )}
                                  />
                                </div>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() =>
                                servicesArray.append({
                                  title: "Nuevo servicio",
                                  description: "",
                                  icon: "apple",
                                })
                              }
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Agregar servicio
                            </Button>
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <p className="text-sm font-semibold text-[var(--foreground)] sm:col-span-2">
                            Consultorios (textos de sección)
                          </p>
                          <Input
                            label="Etiqueta"
                            {...form.register("clinics_section_label")}
                          />
                          <Input
                            label="Título"
                            className="sm:col-span-2"
                            {...form.register("clinics_section_title")}
                          />
                          <p className="text-sm text-[var(--muted)] sm:col-span-2">
                            Nombre, dirección y horarios de cada sede se editan en
                            Admin → Consultorios (campo “Texto público”).
                          </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <p className="text-sm font-semibold text-[var(--foreground)] sm:col-span-2">
                            Llamado a la acción (contacto)
                          </p>
                          <Input
                            label="Título"
                            className="sm:col-span-2"
                            {...form.register("cta_title")}
                          />
                          <Textarea
                            label="Subtítulo"
                            className="sm:col-span-2"
                            {...form.register("cta_subtitle")}
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
                          error={
                            form.formState.errors.appointment_duration_minutes
                              ?.message
                          }
                          {...form.register("appointment_duration_minutes")}
                        />
                        <Input
                          type="number"
                          label="Ocultar turnos (minutos antes)"
                          hint="Los horarios sin reservar dejan de mostrarse esta cantidad de minutos antes de empezar. Por defecto: 30."
                          min={0}
                          max={1440}
                          error={
                            form.formState.errors.booking_cutoff_minutes?.message
                          }
                          {...form.register("booking_cutoff_minutes")}
                        />
                        <Input
                          type="number"
                          label="Anticipación mínima adicional (horas)"
                          hint="Se suma a los minutos de arriba. Podés dejarlo en 0."
                          min={0}
                          max={168}
                          error={
                            form.formState.errors.min_advance_hours?.message
                          }
                          {...form.register("min_advance_hours")}
                        />
                        <Input
                          type="number"
                          label="Reserva máxima (días)"
                          min={1}
                          max={365}
                          error={
                            form.formState.errors.max_advance_days?.message
                          }
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

                    {section === "precios" ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Input
                          type="number"
                          min={0}
                          step={100}
                          inputMode="numeric"
                          label="Precio consulta"
                          hint={`Se va a mostrar como ${formatARS(Number(form.watch("consultation_price")) || 0)}`}
                          error={
                            form.formState.errors.consultation_price?.message
                          }
                          {...form.register("consultation_price", {
                            valueAsNumber: true,
                          })}
                        />
                        <Input
                          type="number"
                          min={0}
                          step={100}
                          inputMode="numeric"
                          label="Precio antropometría"
                          hint={`Se va a mostrar como ${formatARS(Number(form.watch("anthropometry_price")) || 0)}`}
                          error={
                            form.formState.errors.anthropometry_price?.message
                          }
                          {...form.register("anthropometry_price", {
                            valueAsNumber: true,
                          })}
                        />
                        <p className="text-sm text-[var(--muted)] sm:col-span-2">
                          Escribí el importe en pesos, sin puntos ni símbolo $.
                          Ejemplo: 25000. Estos valores se ven en la reserva
                          pública; el paciente no puede cambiarlos.
                        </p>
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
                      <Button
                        type="submit"
                        loading={saving}
                        disabled={!settings}
                      >
                        Guardar sección
                      </Button>
                    </div>
                  </form>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
