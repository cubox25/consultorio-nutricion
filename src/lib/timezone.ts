export const BOOKING_TZ = "America/Argentina/Buenos_Aires";

export function getTimezoneOffsetMinutes(date: Date, timeZone: string) {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
  return (tzDate.getTime() - utcDate.getTime()) / 60000;
}

/** Convierte fecha+hora local del consultorio a timestamp UTC comparable. */
export function zonedLocalToUtcMs(
  date: string,
  time: string,
  timeZone = BOOKING_TZ
): number {
  const [hh = "00", mm = "00", ss = "00"] = time.split(":");
  const probe = new Date(`${date}T12:00:00Z`);
  const offsetMin = getTimezoneOffsetMinutes(probe, timeZone);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  const normalized = `${hh.padStart(2, "0")}:${mm.padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return Date.parse(`${date}T${normalized}${sign}${oh}:${om}`);
}

export function nowInTimezoneMs(timeZone = BOOKING_TZ): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const time = `${get("hour")}:${get("minute")}:${get("second")}`;
  return zonedLocalToUtcMs(date, time, timeZone);
}
