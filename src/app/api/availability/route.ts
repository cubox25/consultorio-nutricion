import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAvailableSlots } from "@/lib/availability";
import { getSystemSettings } from "@/services/settings";
import type { AppointmentBlock, Clinic, ClinicSchedule, TimeSlot } from "@/types";

function normalizeTime(value: string) {
  return value.slice(0, 5);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get("clinicId");
    const date = searchParams.get("date");

    if (!clinicId || !date) {
      return NextResponse.json(
        { error: "Parámetros clinicId y date son obligatorios." },
        { status: 400 }
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: "Formato de fecha inválido. Usá YYYY-MM-DD." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const [settings, clinicRes, schedulesRes, blocksRes, occupiedRes] =
      await Promise.all([
        getSystemSettings(supabase),
        supabase
          .from("clinics")
          .select("*")
          .eq("id", clinicId)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("clinic_schedules")
          .select("*")
          .eq("clinic_id", clinicId)
          .eq("is_active", true),
        supabase
          .from("appointment_blocks")
          .select("*")
          .eq("block_date", date)
          .or(`clinic_id.eq.${clinicId},clinic_id.is.null`),
        supabase.rpc("get_occupied_slots", {
          p_clinic_id: clinicId,
          p_date: date,
        }),
      ]);

    if (clinicRes.error) throw clinicRes.error;
    if (schedulesRes.error) throw schedulesRes.error;
    if (blocksRes.error) throw blocksRes.error;
    if (occupiedRes.error) throw occupiedRes.error;

    const clinic = clinicRes.data as Clinic | null;
    if (!clinic) {
      return NextResponse.json(
        { error: "Consultorio no encontrado o inactivo." },
        { status: 404 }
      );
    }

    const schedules = (schedulesRes.data ?? []) as ClinicSchedule[];
    const blocks = (blocksRes.data ?? []) as AppointmentBlock[];
    const occupiedRaw = (occupiedRes.data ?? []) as {
      start_time: string;
      end_time: string;
    }[];
    const occupied: TimeSlot[] = occupiedRaw.map((row) => ({
      start: normalizeTime(String(row.start_time)),
      end: normalizeTime(String(row.end_time)),
    }));

    const durationMinutes =
      clinic.appointment_duration_minutes ||
      settings?.appointment_duration_minutes ||
      40;

    const slots = getAvailableSlots({
      date,
      schedules,
      occupied,
      blocks,
      durationMinutes,
      minAdvanceHours: settings?.min_advance_hours ?? 0,
      bookingCutoffMinutes: settings?.booking_cutoff_minutes ?? 30,
      clinicId,
      timezone: settings?.timezone || "America/Argentina/Buenos_Aires",
    });

    return NextResponse.json({
      clinicId,
      date,
      durationMinutes,
      slots,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al obtener disponibilidad.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
