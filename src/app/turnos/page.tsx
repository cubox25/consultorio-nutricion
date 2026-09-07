import { createClient } from "@/lib/supabase/server";
import { getSystemSettings, listClinics } from "@/services/settings";
import {
  PublicFooter,
  PublicHeader,
  WhatsAppFab,
  WHATSAPP_DEFAULT,
} from "@/components/public/site-chrome";
import { BookingForm } from "@/components/public/booking-form";
import type { Clinic, SystemSettings } from "@/types";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Solicitar turno",
  description: "Reservá tu consulta nutricional online en pocos pasos.",
};

async function loadBookingData() {
  try {
    const supabase = await createClient();
    const [settings, clinics] = await Promise.all([
      getSystemSettings(supabase),
      listClinics(supabase, true),
    ]);
    return { settings, clinics, loadError: null as string | null };
  } catch (error) {
    console.error("[turnos] loadBookingData", error);
    return {
      settings: null as SystemSettings | null,
      clinics: [] as Clinic[],
      loadError: "No se pudieron cargar los datos para reservar turnos.",
    };
  }
}

export default async function TurnosPage() {
  const { settings, clinics, loadError } = await loadBookingData();
  const phone = settings?.whatsapp || settings?.phone || WHATSAPP_DEFAULT;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <PublicHeader
        settings={settings}
        logoClassName="h-[5.75rem] w-auto sm:h-[6.25rem]"
      />
      <main className="public-hero">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--pink)]">
              Reserva online
            </p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--foreground)] sm:text-4xl">
              Reservá tu turno
            </h1>
            <p className="mt-3 text-[var(--muted)]">
              Conocé los valores, elegí el día y el horario, y confirmá tu consulta.
            </p>
          </div>

          {loadError ? (
            <div className="rounded-2xl border border-[var(--border)] bg-white p-6 text-center text-sm text-[var(--muted)]">
              {loadError}
            </div>
          ) : (
            <BookingForm clinics={clinics} settings={settings} />
          )}
        </div>
      </main>
      <PublicFooter settings={settings} showLogo={false} />
      <WhatsAppFab phone={phone} />
    </div>
  );
}
