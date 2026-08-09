import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  PublicHeader,
  PublicFooter,
  WhatsAppFab,
} from "@/components/public/site-chrome";
import type { Clinic, SystemSettings } from "@/types";
import {
  ArrowRight,
  Leaf,
  HeartPulse,
  Clock3,
  MapPin,
  Sparkles,
} from "lucide-react";

async function loadHome() {
  try {
    const supabase = await createClient();
    const [settingsRes, clinicsRes] = await Promise.all([
      supabase.from("system_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("clinics")
        .select("*")
        .eq("is_active", true)
        .order("name"),
    ]);
    return {
      settings: (settingsRes.data as SystemSettings | null) ?? null,
      clinics: (clinicsRes.data as Clinic[]) ?? [],
    };
  } catch {
    return { settings: null, clinics: [] as Clinic[] };
  }
}

const services = [
  {
    title: "Consulta nutricional",
    description:
      "Evaluación integral, objetivos claros y un plan adaptado a tu vida cotidiana.",
  },
  {
    title: "Seguimiento y evolución",
    description:
      "Control de avances, ajustes del plan y acompañamiento entre consultas.",
  },
  {
    title: "Antropometría",
    description:
      "Mediciones precisas para entender composición corporal y progreso real.",
  },
  {
    title: "Planes alimentarios",
    description:
      "Menús realistas, flexibles y sostenibles, pensados para vos.",
  },
];

export default async function HomePage() {
  const { settings, clinics } = await loadHome();

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <PublicHeader settings={settings} />
      <main>
        {/* Hero — composición limpia, marca primero */}
        <section id="inicio" className="public-hero leaf-pattern relative">
          <div className="mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-24 lg:pb-32 lg:pt-28">
            <div className="max-w-2xl">
              <div className="mb-8 inline-flex items-center gap-2 text-[var(--sage-deep)]">
                <Leaf className="h-5 w-5" />
                <span className="text-sm font-medium tracking-[0.04em]">
                  Nutrición · Salud · Bienestar
                </span>
              </div>
              <h1 className="text-[2.75rem] font-semibold leading-[1.08] tracking-tight text-[var(--sage-deep)] sm:text-6xl lg:text-[4.25rem]">
                {settings?.professional_name || "Consultorio de nutrición"}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--muted)] sm:text-xl">
                {settings?.description ||
                  "Acompañamiento nutricional calmado y profesional, con planes realistas y seguimiento cercano."}
              </p>
              <div className="mt-10 flex flex-wrap gap-3">
                <Link
                  href="/turnos"
                  className="inline-flex h-12 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--sage)] px-7 text-sm font-semibold text-[var(--sage-deep)] shadow-[var(--shadow-soft)] transition duration-200 hover:shadow-[var(--shadow-lift)]"
                >
                  Reservar turno
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#sobre-mi"
                  className="inline-flex h-12 items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-white/70 px-7 text-sm font-medium text-[var(--foreground)] backdrop-blur transition hover:bg-white"
                >
                  Conocer más
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Franja visual sutil */}
        <section className="border-y border-[var(--border)] bg-[var(--background-secondary)]">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-8 sm:px-6">
            {[
              "Atención personalizada",
              "Enfoque integral",
              "Hábitos sostenibles",
            ].map((label) => (
              <p
                key={label}
                className="flex items-center gap-2 text-sm font-medium text-[var(--sage-deep)]"
              >
                <Sparkles className="h-3.5 w-3.5 opacity-70" />
                {label}
              </p>
            ))}
          </div>
        </section>

        <section id="sobre-mi" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <div className="grid gap-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
                Sobre mí
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--sage-deep)] sm:text-4xl">
                Un espacio para cuidar tu relación con la alimentación
              </h2>
              <p className="mt-6 whitespace-pre-line text-base leading-relaxed text-[var(--muted)] sm:text-lg">
                {settings?.about_text ||
                  "Soy licenciada en nutrición y acompaño a mis pacientes con planes realistas, seguimiento cercano y un enfoque integral de la salud."}
              </p>
            </div>
            <div className="grid gap-5">
              {[
                {
                  icon: HeartPulse,
                  title: "Atención personalizada",
                  text: "Cada plan se adapta a tu rutina, preferencias y objetivos.",
                },
                {
                  icon: Clock3,
                  title: "Seguimiento continuo",
                  text: "Evolución, antropometría y ajustes en cada consulta.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-7 py-6 shadow-[var(--shadow-soft)]"
                >
                  <item.icon className="h-5 w-5 text-[var(--sage-deep)]" />
                  <h3 className="mt-4 text-lg font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="servicios"
          className="bg-[var(--background-secondary)] py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
              Servicios
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-[var(--sage-deep)] sm:text-4xl">
              Acompañamiento profesional en cada etapa
            </h2>
            <p className="mt-4 max-w-2xl text-[var(--muted)]">
              Herramientas claras para avanzar con tranquilidad y constancia.
            </p>
            <div className="mt-14 grid gap-6 md:grid-cols-2">
              {services.map((service) => (
                <article
                  key={service.title}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-8 py-8 shadow-[var(--shadow-soft)] transition-shadow duration-200 hover:shadow-[var(--shadow-lift)]"
                >
                  <h3 className="text-xl font-semibold tracking-tight text-[var(--sage-deep)]">
                    {service.title}
                  </h3>
                  <p className="mt-3 leading-relaxed text-[var(--muted)]">
                    {service.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="consultorios" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            Consultorios
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--sage-deep)] sm:text-4xl">
            Espacios pensados para vos
          </h2>
          <p className="mt-4 max-w-2xl text-[var(--muted)]">
            Elegí la ubicación que te resulte más cómoda.
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {clinics.length ? (
              clinics.map((clinic) => (
                <article
                  key={clinic.id}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-8 py-7 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--sage-soft)]">
                      <MapPin className="h-5 w-5 text-[var(--sage-deep)]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold tracking-tight">
                        {clinic.name}
                      </h3>
                      {clinic.address ? (
                        <p className="mt-2 text-[var(--muted)]">{clinic.address}</p>
                      ) : null}
                      {clinic.phone ? (
                        <p className="mt-1 text-sm text-[var(--muted)]">
                          {clinic.phone}
                        </p>
                      ) : null}
                      {clinic.google_maps_url ? (
                        <a
                          href={clinic.google_maps_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-4 inline-block text-sm font-medium text-[var(--sage-deep)] transition hover:underline"
                        >
                          Ver en Google Maps
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <p className="text-[var(--muted)]">
                Los consultorios se configuran desde el panel de administración.
              </p>
            )}
          </div>
        </section>

        <section
          id="como-reservar"
          className="border-y border-[var(--border)] bg-[var(--cream)]/60 py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
              Reserva
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--sage-deep)] sm:text-4xl">
              Cómo reservar
            </h2>
            <p className="mt-4 max-w-2xl text-[var(--muted)]">
              {settings?.how_to_book_text ||
                "Elegí el consultorio, la fecha y el horario disponible. Completá tus datos y confirmá la solicitud."}
            </p>
            <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[
                "Elegí consultorio",
                "Seleccioná fecha",
                "Reservá horario",
                "Confirmá tus datos",
              ].map((step, i) => (
                <li
                  key={step}
                  className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-soft)]"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--sage-deep)]">
                    Paso {i + 1}
                  </span>
                  <p className="mt-3 font-medium tracking-tight">{step}</p>
                </li>
              ))}
            </ol>
            <Link
              href="/turnos"
              className="mt-12 inline-flex h-12 items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--sage)] px-7 text-sm font-semibold text-[var(--sage-deep)] shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-lift)]"
            >
              Ir a reservar
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section id="contacto" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            Contacto
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--sage-deep)] sm:text-4xl">
            Estamos para ayudarte
          </h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {[
              {
                label: "Teléfono",
                value: settings?.phone || "Configurar en el panel",
              },
              {
                label: "Email",
                value: settings?.email || "Configurar en el panel",
              },
              {
                label: "WhatsApp",
                value:
                  settings?.whatsapp ||
                  settings?.phone ||
                  "Configurar en el panel",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-6 py-6 shadow-[var(--shadow-soft)]"
              >
                <p className="text-sm text-[var(--muted)]">{item.label}</p>
                <p className="mt-2 font-medium tracking-tight">{item.value}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <PublicFooter settings={settings} />
      <WhatsAppFab phone={settings?.whatsapp || settings?.phone} />
    </div>
  );
}
