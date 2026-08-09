import { createClient } from "@/lib/supabase/server";
import { getSystemSettings, listClinics } from "@/services/settings";
import {
  PublicFooter,
  PublicHeader,
  WhatsAppFab,
} from "@/components/public/site-chrome";
import { BookingForm } from "@/components/public/booking-form";
import type { Clinic, SystemSettings } from "@/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Reservar turno",
  description: "Reservá tu consulta nutricional online en pocos pasos.",
};

async function loadBookingData() {
  try {
    const supabase = await createClient();
    const [settings, clinics] = await Promise.all([
      getSystemSettings(supabase),
      listClinics(supabase, true),
    ]);
    return { settings, clinics };
  } catch {
    return { settings: null as SystemSettings | null, clinics: [] as Clinic[] };
  }
}

export default async function TurnosPage() {
  const { settings, clinics } = await loadBookingData();

  const primary = settings?.primary_color || "#A8C3B0";
  const secondary = settings?.secondary_color || "#E8F1EB";
  const accent = settings?.accent_color || "#5F7A68";

  return (
    <div
      className="min-h-screen"
      style={
        {
          "--brand-primary": primary,
          "--brand-secondary": secondary,
          "--brand-accent": accent,
        } as React.CSSProperties
      }
    >
      <PublicHeader settings={settings} />
      <main className="public-hero leaf-pattern">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
              Reserva online
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[var(--brand-accent)] sm:text-4xl">
              Reservar turno
            </h1>
            <p className="mt-3 text-stone-600">
              Elegí el consultorio, la fecha y el horario. Completá tus datos y
              confirmá la solicitud.
            </p>
          </div>

          <BookingForm clinics={clinics} settings={settings} />
        </div>
      </main>
      <PublicFooter settings={settings} />
      <WhatsAppFab phone={settings?.whatsapp || settings?.phone} />
    </div>
  );
}
