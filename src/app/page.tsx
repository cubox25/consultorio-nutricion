import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  PublicHeader,
  PublicFooter,
  WhatsAppFab,
  WHATSAPP_DEFAULT,
} from "@/components/public/site-chrome";
import { BrandAvatar, BrandLogo } from "@/components/brand/logo";
import { WhatsAppIcon } from "@/components/ui/whatsapp-icon";
import { whatsappLink } from "@/lib/utils";
import {
  getLandingPhotoPublicUrl,
  getLandingPhotoVersion,
} from "@/lib/landing-photo.server";
import { extractLandingPhoto } from "@/lib/landing-photo-settings";
import {
  resolveLandingContent,
  splitProfessionalName,
  type LandingServiceIcon,
} from "@/lib/landing-content";
import type { Clinic, SystemSettings } from "@/types";
import {
  ArrowRight,
  Apple,
  Scale,
  Salad,
  HeartPulse,
  TrendingDown,
  TrendingUp,
  MapPin,
  Clock3,
  CalendarDays,
  Leaf,
} from "lucide-react";

export const dynamic = "force-dynamic";

const SERVICE_ICONS: Record<
  LandingServiceIcon,
  typeof Apple
> = {
  apple: Apple,
  scale: Scale,
  salad: Salad,
  heart: HeartPulse,
  "trending-down": TrendingDown,
  "trending-up": TrendingUp,
};

function clinicPublicLines(clinic: Clinic) {
  const notes = (clinic.notes || "").trim();
  if (notes) {
    const parts = notes
      .split(/\n|·/)
      .map((part) => part.trim())
      .filter(Boolean);
    return {
      days: parts[0] || notes,
      hours:
        parts.slice(1).join(" · ") ||
        (clinic.phone ? `Tel: ${clinic.phone}` : "Consultá horarios al reservar"),
    };
  }
  return {
    days: "Consultá disponibilidad al reservar online",
    hours: clinic.phone
      ? `Tel: ${clinic.phone}`
      : `Turnos de ${clinic.appointment_duration_minutes} min`,
  };
}

async function loadHome() {
  try {
    const supabase = await createClient();
    const [settingsRes, clinicsRes, photoVersion] = await Promise.all([
      supabase
        .from("system_settings")
        .select(
          "professional_name, description, phone, whatsapp, email, address, logo_url, landing_photo_url, about_text, services_json, footer_text"
        )
        .limit(1)
        .maybeSingle(),
      supabase
        .from("clinics")
        .select(
          "id, name, address, phone, google_maps_url, appointment_duration_minutes, is_active, sort_order, notes"
        )
        .eq("is_active", true)
        .order("sort_order"),
      getLandingPhotoVersion(),
    ]);
    const settings = (settingsRes.data as SystemSettings | null) ?? null;
    const fromColumn = settings?.landing_photo_url?.trim() || null;
    const fromSettings = extractLandingPhoto(settings?.services_json);
    const fromStorage = photoVersion
      ? getLandingPhotoPublicUrl(photoVersion)
      : null;
    const embeddedHttp =
      fromSettings && !fromSettings.startsWith("data:") ? fromSettings : null;
    return {
      settings,
      clinics: (clinicsRes.data as Clinic[]) ?? [],
      landingPhotoUrl:
        (fromColumn && !fromColumn.startsWith("data:") ? fromColumn : null) ||
        fromStorage ||
        embeddedHttp ||
        fromColumn ||
        fromSettings,
      landing: resolveLandingContent({
        services_json: settings?.services_json,
        description: settings?.description,
      }),
    };
  } catch {
    return {
      settings: null,
      clinics: [] as Clinic[],
      landingPhotoUrl: null as string | null,
      landing: resolveLandingContent({}),
    };
  }
}

export default async function HomePage() {
  const { settings, clinics, landingPhotoUrl, landing } = await loadHome();
  const phone = settings?.whatsapp || settings?.phone || WHATSAPP_DEFAULT;
  const wa = whatsappLink(phone, "Hola Pamela, quisiera consultar por un turno.");
  const { first, rest } = splitProfessionalName(settings?.professional_name);

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <PublicHeader settings={settings} />
      <main>
        <section id="inicio" className="public-hero relative overflow-hidden">
          <div
            className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-[var(--pink-soft)]/40 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-[var(--sage)]/30 blur-3xl"
            aria-hidden
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-24">
            <div>
              <BrandLogo
                src={settings?.logo_url}
                className="mb-6 h-[6.5rem] w-auto sm:h-32"
              />
              <h1 className="mt-4 max-w-xl text-4xl font-bold leading-tight text-[var(--foreground)] sm:text-5xl lg:text-[3.25rem]">
                {landing.hero_title}
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--muted)] sm:text-lg">
                {landing.hero_subtitle}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/turnos"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--green)] px-7 text-sm font-semibold text-white shadow-[var(--shadow-soft)] transition hover:bg-[var(--green-deep)]"
                >
                  Solicitar turno
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#servicios"
                  className="inline-flex h-12 items-center rounded-full border border-[var(--border-strong)] bg-white px-7 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--pink)] hover:text-[var(--pink)]"
                >
                  Conocer mis servicios
                </a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-md">
              <div className="organic-blob absolute inset-4 bg-[var(--pink-soft)]/50" aria-hidden />
              <div className="relative overflow-hidden rounded-[2rem] border-[3px] border-[var(--pink)] bg-white p-6 shadow-[var(--shadow-lift)] sm:p-8">
                <div className="flex flex-col items-center text-center">
                  <div className="mb-5 h-44 w-44 overflow-hidden rounded-full bg-gradient-to-br from-[var(--sage-soft)] via-white to-[var(--pink-mist)] ring-4 ring-white sm:h-52 sm:w-52">
                    {landingPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={landingPhotoUrl}
                        alt={settings?.professional_name || "Pamela Guerrero"}
                        className="h-full w-full object-cover object-center"
                      />
                    ) : (
                      <BrandAvatar
                        size={208}
                        className="h-full w-full rounded-full ring-0"
                      />
                    )}
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {landing.hero_card_eyebrow}
                  </p>
                  <p className="mt-3 text-lg font-semibold text-[var(--foreground)]">
                    {landing.hero_card_tagline}
                  </p>
                  {wa ? (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-white transition hover:opacity-95"
                    >
                      <WhatsAppIcon className="h-4 w-4" />
                      Consultar por WhatsApp
                    </a>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="sobre-mi" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="relative">
              <div className="absolute -inset-3 rounded-[2rem] bg-[var(--sage-soft)]" aria-hidden />
              <div className="relative rounded-[1.75rem] border border-[var(--border)] bg-white p-8 shadow-[var(--shadow-soft)] sm:p-10">
                <Leaf className="h-8 w-8 text-[var(--green)]" />
                <h2 className="mt-4 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
                  <span className="text-[var(--green)]">{first}</span>
                  {rest ? (
                    <>
                      {" "}
                      <span className="text-[var(--pink)]">{rest}</span>
                    </>
                  ) : null}
                </h2>
                {landing.professional_title ? (
                  <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                    {landing.professional_title}
                  </p>
                ) : null}
                <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-[var(--muted)]">
                  {settings?.about_text ||
                    "Acompaño a mis pacientes con un enfoque integral, cercano y profesional. Mi objetivo es que cada propuesta sea realista, sostenible y pensada para tu vida cotidiana."}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pink)]">
                {landing.about_section_label}
              </p>
              <h2 className="mt-3 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
                {landing.about_section_title}
              </h2>
              <p className="mt-5 text-base leading-relaxed text-[var(--muted)]">
                {landing.about_section_body}
              </p>
              <ul className="mt-8 space-y-3">
                {landing.about_highlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-center gap-3 text-sm font-medium text-[var(--foreground)]"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--sage-soft)] text-[var(--green)]">
                      <Leaf className="h-4 w-4" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="servicios" className="bg-white py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pink)]">
              {landing.services_section_label}
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
              {landing.services_section_title}
            </h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {landing.services.map((service) => {
                const Icon = SERVICE_ICONS[service.icon] || Apple;
                return (
                  <article
                    key={service.title}
                    className="group rounded-[1.5rem] border border-[var(--border)] bg-[var(--background)] p-6 transition duration-200 hover:-translate-y-1 hover:border-[var(--pink-soft)] hover:bg-white hover:shadow-[var(--shadow-lift)]"
                  >
                    <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sage-soft)] text-[var(--green)] transition group-hover:bg-[var(--pink-mist)] group-hover:text-[var(--pink)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-5 text-lg font-semibold text-[var(--foreground)]">
                      {service.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                      {service.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="consultorios" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pink)]">
            {landing.clinics_section_label}
          </p>
          <h2 className="mt-3 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
            {landing.clinics_section_title}
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {clinics.length ? (
              clinics.map((clinic, index) => {
                const lines = clinicPublicLines(clinic);
                const isGreen = index % 2 === 0;
                return (
                  <article
                    key={clinic.id}
                    className={`rounded-[1.75rem] border-2 bg-white p-7 shadow-[var(--shadow-soft)] ${
                      isGreen ? "border-[var(--green)]/35" : "border-[var(--pink)]/35"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                          isGreen
                            ? "bg-[var(--sage-soft)] text-[var(--green)]"
                            : "bg-[var(--pink-mist)] text-[var(--pink)]"
                        }`}
                      >
                        <MapPin className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="text-xl font-bold text-[var(--foreground)]">
                          {clinic.name}
                        </h3>
                        <p
                          className={`mt-1 text-sm font-medium ${
                            isGreen ? "text-[var(--green)]" : "text-[var(--pink)]"
                          }`}
                        >
                          {clinic.address || "Dirección a confirmar"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-6 space-y-3">
                      <p className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                        <CalendarDays className="h-4 w-4 text-[var(--muted)]" />
                        <span className="font-semibold">{lines.days}</span>
                      </p>
                      <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
                        <Clock3 className="h-4 w-4" />
                        {lines.hours}
                      </p>
                      {clinic.google_maps_url ? (
                        <a
                          href={clinic.google_maps_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block text-sm font-medium text-[var(--pink)] hover:underline"
                        >
                          Ver en Google Maps
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="text-sm text-[var(--muted)] md:col-span-2">
                Todavía no hay consultorios activos. Cargalos desde Admin →
                Consultorios.
              </p>
            )}
          </div>
        </section>

        <section id="contacto" className="bg-[var(--pink-mist)] py-20">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
              {landing.cta_title}
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[var(--muted)]">
              {landing.cta_subtitle}
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/turnos"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--green)] px-7 text-sm font-semibold text-white transition hover:bg-[var(--green-deep)]"
              >
                Solicitar turno
                <ArrowRight className="h-4 w-4" />
              </Link>
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-[#25D366] px-7 text-sm font-semibold text-white transition hover:opacity-95"
                >
                  <WhatsAppIcon className="h-4 w-4" />
                  Consultar por WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter settings={settings} />
      <WhatsAppFab phone={phone} />
    </div>
  );
}
