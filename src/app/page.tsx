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
} from "@/lib/landing-photo";
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

async function loadHome() {
  try {
    const supabase = await createClient();
    const [settingsRes, clinicsRes, photoVersion] = await Promise.all([
      supabase.from("system_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("clinics")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      getLandingPhotoVersion(),
    ]);
    const settings = (settingsRes.data as SystemSettings | null) ?? null;
    return {
      settings,
      clinics: (clinicsRes.data as Clinic[]) ?? [],
      landingPhotoUrl: photoVersion
        ? getLandingPhotoPublicUrl(photoVersion)
        : null,
    };
  } catch {
    return {
      settings: null,
      clinics: [] as Clinic[],
      landingPhotoUrl: null as string | null,
    };
  }
}

const services = [
  {
    icon: Apple,
    title: "Educación nutricional",
    description:
      "Herramientas claras para entender tu alimentación y construir hábitos sostenibles.",
  },
  {
    icon: Scale,
    title: "Evaluación antropométrica",
    description:
      "Mediciones precisas para conocer tu composición corporal y seguir tu evolución.",
  },
  {
    icon: Salad,
    title: "Planes alimentarios personalizados",
    description:
      "Menús adaptados a tu rutina, gustos, objetivos y estilo de vida.",
  },
  {
    icon: HeartPulse,
    title: "Planes adecuados a patologías",
    description:
      "Abordaje nutricional en diabetes, hipertensión, dislipemias, hipotiroidismo y más.",
  },
  {
    icon: TrendingDown,
    title: "Descenso de peso",
    description:
      "Acompañamiento realista, sin extremos, con foco en bienestar y constancia.",
  },
  {
    icon: TrendingUp,
    title: "Ascenso de peso",
    description:
      "Estrategias nutricionales para ganar peso de forma saludable y supervisada.",
  },
];

const clinicCards = [
  {
    tone: "green" as const,
    days: "Lunes, miércoles y viernes",
    hours: "8 a 12 hs y 18 a 21 hs",
    name: "Los Sarmientos",
    address: "Calle 25 de Mayo s/n - B° Belgrano",
  },
  {
    tone: "pink" as const,
    days: "Jueves",
    hours: "8 a 12 hs",
    name: "Centro Médico J. Marmol",
    address: "Calle José Marmol 569 - Aguilares",
  },
];

export default async function HomePage() {
  const { settings, clinics, landingPhotoUrl } = await loadHome();
  const phone = settings?.whatsapp || settings?.phone || WHATSAPP_DEFAULT;
  const wa = whatsappLink(phone, "Hola Pamela, quisiera consultar por un turno.");

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <PublicHeader settings={settings} />
      <main>
        {/* Hero */}
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
                Nutrición con calidez, claridad y acompañamiento real
              </h1>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-[var(--muted)] sm:text-lg">
                {settings?.description ||
                  "Te acompaño a mejorar tu relación con la alimentación con planes realistas, seguimiento cercano y un enfoque profesional."}
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
                        alt={
                          settings?.professional_name ||
                          "Pamela Guerrero"
                        }
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
                    Consultorio de nutrición
                  </p>
                  <p className="mt-3 text-lg font-semibold text-[var(--foreground)]">
                    Bienestar · Salud · Hábitos
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

        {/* Sobre mí */}
        <section id="sobre-mi" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div className="relative">
              <div className="absolute -inset-3 rounded-[2rem] bg-[var(--sage-soft)]" aria-hidden />
              <div className="relative rounded-[1.75rem] border border-[var(--border)] bg-white p-8 shadow-[var(--shadow-soft)] sm:p-10">
                <Leaf className="h-8 w-8 text-[var(--green)]" />
                <h2 className="mt-4 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
                  <span className="text-[var(--green)]">Pamela</span>{" "}
                  <span className="text-[var(--pink)]">Guerrero</span>
                </h2>
                <p className="mt-2 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  Licenciada en Nutrición
                </p>
                <p className="mt-5 whitespace-pre-line text-base leading-relaxed text-[var(--muted)]">
                  {settings?.about_text ||
                    "Acompaño a mis pacientes con un enfoque integral, cercano y profesional. Mi objetivo es que cada plan sea realista, sostenible y pensado para tu vida cotidiana."}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pink)]">
                Sobre mí
              </p>
              <h2 className="mt-3 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
                Un espacio para cuidar tu alimentación con tranquilidad
              </h2>
              <p className="mt-5 text-base leading-relaxed text-[var(--muted)]">
                Trabajo con educación nutricional, antropometría y planes
                personalizados, priorizando la escucha y el seguimiento
                continuo.
              </p>
              <ul className="mt-8 space-y-3">
                {[
                  "Atención personalizada",
                  "Planes adaptados a tu rutina",
                  "Seguimiento cercano",
                ].map((item) => (
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

        {/* Servicios */}
        <section id="servicios" className="bg-white py-20 lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pink)]">
              Servicios
            </p>
            <h2 className="mt-3 max-w-xl text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
              Acompañamiento nutricional para cada objetivo
            </h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((service) => (
                <article
                  key={service.title}
                  className="group rounded-[1.5rem] border border-[var(--border)] bg-[var(--background)] p-6 transition duration-200 hover:-translate-y-1 hover:border-[var(--pink-soft)] hover:bg-white hover:shadow-[var(--shadow-lift)]"
                >
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sage-soft)] text-[var(--green)] transition group-hover:bg-[var(--pink-mist)] group-hover:text-[var(--pink)]">
                    <service.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-5 text-lg font-semibold text-[var(--foreground)]">
                    {service.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                    {service.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Consultorios */}
        <section id="consultorios" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--pink)]">
            Consultorios
          </p>
          <h2 className="mt-3 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
            Dónde y cuándo atendemos
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {(clinics.length
              ? clinics.map((clinic, index) => ({
                  name: clinic.name,
                  address: clinic.address || "Dirección a confirmar",
                  days:
                    clinic.notes ||
                    "Consultá disponibilidad al reservar online",
                  hours: clinic.phone
                    ? `Tel: ${clinic.phone}`
                    : `Turnos de ${clinic.appointment_duration_minutes} min`,
                  tone: (index % 2 === 0 ? "green" : "pink") as "green" | "pink",
                  maps: clinic.google_maps_url,
                }))
              : clinicCards.map((c) => ({ ...c, maps: null as string | null }))
            ).map((clinic) => {
              const isGreen = clinic.tone === "green";
              return (
                <article
                  key={clinic.name}
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
                        {clinic.address}
                      </p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-3">
                    <p className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                      <CalendarDays className="h-4 w-4 text-[var(--muted)]" />
                      <span className="font-semibold">{clinic.days}</span>
                    </p>
                    <p className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <Clock3 className="h-4 w-4" />
                      {clinic.hours}
                    </p>
                    {"maps" in clinic && clinic.maps ? (
                      <a
                        href={clinic.maps}
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
            })}
          </div>

          <p className="mt-6 text-sm text-[var(--muted)]">
            Podés actualizar sedes y horarios desde el panel → Consultorios.
          </p>
        </section>

        {/* CTA */}
        <section id="contacto" className="bg-[var(--pink-mist)] py-20">
          <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
            <h2 className="text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
              ¿Lista/o para dar el primer paso?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[var(--muted)]">
              Reservá tu turno online o escribinos por WhatsApp. Estoy para
              acompañarte.
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
