import { addMinutes, getDay, parseISO } from "date-fns";
import type { AppointmentBlock, ClinicSchedule, TimeSlot } from "@/types";
import { minutesToTime, timeToMinutes, todayISO } from "@/lib/utils";

interface AvailabilityInput {
  date: string;
  schedules: ClinicSchedule[];
  occupied: TimeSlot[];
  blocks: AppointmentBlock[];
  durationMinutes: number;
  minAdvanceHours?: number;
  clinicId: string;
  timezone?: string;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

export function getAvailableSlots(input: AvailabilityInput): TimeSlot[] {
  const {
    date,
    schedules,
    occupied,
    blocks,
    durationMinutes,
    minAdvanceHours = 0,
    clinicId,
  } = input;

  const weekday = getDay(parseISO(date));
  const daySchedules = schedules.filter(
    (s) => s.clinic_id === clinicId && s.weekday === weekday && s.is_active
  );

  if (!daySchedules.length) return [];

  const dayBlocks = blocks.filter(
    (b) =>
      b.block_date === date &&
      (b.clinic_id === null || b.clinic_id === clinicId)
  );

  if (dayBlocks.some((b) => b.is_full_day)) return [];

  const now = new Date();
  const today = todayISO(input.timezone);
  const slots: TimeSlot[] = [];

  for (const schedule of daySchedules) {
    let cursor = timeToMinutes(schedule.start_time);
    const end = timeToMinutes(schedule.end_time);
    const breakStart = schedule.break_start ? timeToMinutes(schedule.break_start) : null;
    const breakEnd = schedule.break_end ? timeToMinutes(schedule.break_end) : null;

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
      if (date === today && minAdvanceHours > 0) {
        const slotDate = parseISO(`${date}T${minutesToTime(cursor)}:00`);
        const minTime = addMinutes(now, minAdvanceHours * 60);
        tooSoon = slotDate < minTime;
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
