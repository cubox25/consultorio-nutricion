import type { AppointmentBlock, ClinicSchedule, TimeSlot } from "@/types";
import { BOOKING_TZ, nowInTimezoneMs, zonedLocalToUtcMs } from "@/lib/timezone";
import { minutesToTime, timeToMinutes } from "@/lib/utils";

interface AvailabilityInput {
  date: string;
  schedules: ClinicSchedule[];
  occupied: TimeSlot[];
  blocks: AppointmentBlock[];
  durationMinutes: number;
  minAdvanceHours?: number;
  bookingCutoffMinutes?: number;
  clinicId: string;
  timezone?: string;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

/** Día de la semana (0=domingo) para una fecha YYYY-MM-DD, sin desfase de huso. */
export function weekdayFromISODate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function eachISODate(from: string, to: string) {
  const dates: string[] = [];
  let t = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(t) || !Number.isFinite(end) || t > end) return dates;
  while (t <= end) {
    dates.push(new Date(t).toISOString().slice(0, 10));
    t += 24 * 60 * 60 * 1000;
  }
  return dates;
}

export function getAvailableSlots(input: AvailabilityInput): TimeSlot[] {
  const {
    date,
    schedules,
    occupied,
    blocks,
    durationMinutes,
    minAdvanceHours = 0,
    bookingCutoffMinutes = 30,
    clinicId,
    timezone = BOOKING_TZ,
  } = input;

  const cutoffMinutes = Math.max(
    Math.max(0, bookingCutoffMinutes),
    Math.max(0, minAdvanceHours) * 60
  );

  const weekday = weekdayFromISODate(date);
  const daySchedules = schedules.filter(
    (s) => s.clinic_id === clinicId && s.weekday === weekday && s.is_active
  );

  if (!daySchedules.length) return [];

  const dayBlocks = blocks.filter(
    (b) =>
      String(b.block_date).slice(0, 10) === date &&
      (b.clinic_id === null || b.clinic_id === clinicId)
  );

  if (dayBlocks.some((b) => b.is_full_day)) return [];

  const nowMs = nowInTimezoneMs(timezone);
  const slots: TimeSlot[] = [];

  for (const schedule of daySchedules) {
    let cursor = timeToMinutes(schedule.start_time);
    const end = timeToMinutes(schedule.end_time);
    const breakStart = schedule.break_start
      ? timeToMinutes(schedule.break_start)
      : null;
    const breakEnd = schedule.break_end
      ? timeToMinutes(schedule.break_end)
      : null;

    while (cursor + durationMinutes <= end) {
      const slotEnd = cursor + durationMinutes;

      const inBreak =
        breakStart !== null &&
        breakEnd !== null &&
        overlaps(cursor, slotEnd, breakStart, breakEnd);

      const blocked = dayBlocks.some((b) => {
        if (b.is_full_day) return true;
        if (!b.start_time || !b.end_time) return false;
        return overlaps(
          cursor,
          slotEnd,
          timeToMinutes(b.start_time),
          timeToMinutes(b.end_time)
        );
      });

      const taken = occupied.some((o) =>
        overlaps(cursor, slotEnd, timeToMinutes(o.start), timeToMinutes(o.end))
      );

      let tooSoon = false;
      if (cutoffMinutes > 0) {
        const slotMs = zonedLocalToUtcMs(
          date,
          minutesToTime(cursor),
          timezone
        );
        const minMs = nowMs + cutoffMinutes * 60 * 1000;
        tooSoon = slotMs < minMs;
      }

      if (!inBreak && !blocked && !taken && !tooSoon) {
        slots.push({
          start: minutesToTime(cursor),
          end: minutesToTime(slotEnd),
        });
      }

      cursor += durationMinutes;
    }
  }

  return slots;
}

export function listDatesWithSlots(input: {
  from: string;
  to: string;
  schedules: ClinicSchedule[];
  occupiedByDate: Map<string, TimeSlot[]>;
  blocks: AppointmentBlock[];
  durationMinutes: number;
  minAdvanceHours?: number;
  bookingCutoffMinutes?: number;
  clinicId: string;
  timezone?: string;
}): string[] {
  const dates: string[] = [];
  for (const date of eachISODate(input.from, input.to)) {
    const slots = getAvailableSlots({
      date,
      schedules: input.schedules,
      occupied: input.occupiedByDate.get(date) ?? [],
      blocks: input.blocks,
      durationMinutes: input.durationMinutes,
      minAdvanceHours: input.minAdvanceHours,
      bookingCutoffMinutes: input.bookingCutoffMinutes,
      clinicId: input.clinicId,
      timezone: input.timezone,
    });
    if (slots.length) dates.push(date);
  }
  return dates;
}
