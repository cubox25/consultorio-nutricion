import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAvailableSlots, listDatesWithSlots, eachISODate, weekdayFromISODate } from "@/lib/availability";
import { isUuid } from "@/lib/postgrest";
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
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!clinicId) {
      return NextResponse.json(
        { error: "El parámetro clinicId es obligatorio." },
        { status: 400 }
      );
    }

    if (!isUuid(clinicId)) {
      return NextResponse.json(
        { error: "Consultorio inválido." },
        { status: 400 }
      );
    }

    if (from && to) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        return NextResponse.json(
          { error: "Formato de fecha inválido. Usá YYYY-MM-DD." },
          { status: 400 }
        );
      }
      return NextResponse.json(await loadAvailableDates(clinicId, from, to));
    }

    if (!date) {
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
    console.error("[availability]", error);
    return NextResponse.json(
      { error: "Error al obtener disponibilidad." },
      { status: 500 }
    );
  }
}

async function loadAvailableDates(clinicId: string, from: string, to: string) {
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
        .gte("block_date", from)
        .lte("block_date", to)
        .or(`clinic_id.eq.${clinicId},clinic_id.is.null`),
      supabase.rpc("get_occupied_slots_range", {
        p_clinic_id: clinicId,
        p_from: from,
        p_to: to,
      }),
    ]);

  if (clinicRes.error) throw clinicRes.error;
  if (schedulesRes.error) throw schedulesRes.error;
  if (blocksRes.error) throw blocksRes.error;

  const clinic = clinicRes.data as Clinic | null;
  if (!clinic) {
    return { clinicId, from, to, dates: [] as string[] };
  }

  const schedules = (schedulesRes.data ?? []) as ClinicSchedule[];
  const occupiedByDate = new Map<string, TimeSlot[]>();

  if (occupiedRes.error) {
    const workingDays = new Set(
      schedules.filter((s) => s.is_active).map((s) => s.weekday)
    );
    const days = eachISODate(from, to).filter((d) =>
      workingDays.has(weekdayFromISODate(d))
    );
    const occupiedLists = await Promise.all(
      days.map((day) =>
        supabase.rpc("get_occupied_slots", {
          p_clinic_id: clinicId,
          p_date: day,
        })
      )
    );
    occupiedLists.forEach((res, index) => {
      if (res.error) return;
      const day = days[index];
      const rows = (res.data ?? []) as { start_time: string; end_time: string }[];
      occupiedByDate.set(
        day,
        rows.map((row) => ({
          start: normalizeTime(String(row.start_time)),
          end: normalizeTime(String(row.end_time)),
        }))
      );
    });
  } else {
    const occupiedRaw = (occupiedRes.data ?? []) as {
      appointment_date: string;
      start_time: string;
      end_time: string;
    }[];
    for (const row of occupiedRaw) {
      const key = String(row.appointment_date).slice(0, 10);
      const list = occupiedByDate.get(key) ?? [];
      list.push({
        start: normalizeTime(String(row.start_time)),
        end: normalizeTime(String(row.end_time)),
      });
      occupiedByDate.set(key, list);
    }
  }

  const durationMinutes =
    clinic.appointment_duration_minutes ||
    settings?.appointment_duration_minutes ||
    40;

  const dates = listDatesWithSlots({
    from,
    to,
    schedules: (schedulesRes.data ?? []) as ClinicSchedule[],
    occupiedByDate,
    blocks: (blocksRes.data ?? []) as AppointmentBlock[],
    durationMinutes,
    minAdvanceHours: settings?.min_advance_hours ?? 0,
    bookingCutoffMinutes: settings?.booking_cutoff_minutes ?? 30,
    clinicId,
    timezone: settings?.timezone || "America/Argentina/Buenos_Aires",
  });

  return { clinicId, from, to, dates };
}
