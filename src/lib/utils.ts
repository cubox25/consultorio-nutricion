import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date, pattern = "dd/MM/yyyy") {
  const value = typeof date === "string" ? parseISO(date) : date;
  return format(value, pattern, { locale: es });
}

export function formatDateTime(date: string | Date) {
  const value = typeof date === "string" ? parseISO(date) : date;
  return format(value, "dd/MM/yyyy HH:mm", { locale: es });
}

export function formatTime(time: string) {
  return time.slice(0, 5);
}

export function fullName(first?: string | null, last?: string | null) {
  return [last, first].filter(Boolean).join(", ") || "Sin nombre";
}

export function displayPatientName(input: {
  first_name?: string | null;
  last_name?: string | null;
  guest_first_name?: string | null;
  guest_last_name?: string | null;
  patient?: { first_name?: string | null; last_name?: string | null } | null;
}) {
  if (input.patient) {
    return fullName(input.patient.first_name, input.patient.last_name);
  }
  if (input.first_name || input.last_name) {
    return fullName(input.first_name, input.last_name);
  }
  return fullName(input.guest_first_name, input.guest_last_name);
}

export function calculateBmi(weightKg?: number | null, heightCm?: number | null) {
  if (!weightKg || !heightCm || heightCm <= 0 || weightKg <= 0) return null;
  const bmi = weightKg / Math.pow(heightCm / 100, 2);
  return Math.round(bmi * 100) / 100;
}

export function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toCSV(rows: Record<string, unknown>[], headers?: string[]) {
  if (!rows.length) return "";
  const cols = headers ?? Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const str = value == null ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [
    cols.join(","),
    ...rows.map((row) => cols.map((col) => escape(row[col])).join(",")),
  ];
  return lines.join("\n");
}

export function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function whatsappLink(phone?: string | null, message?: string) {
  if (phone == null || phone === "") return null;
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${text}`;
}

export function timeToMinutes(time: string) {
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function todayISO(timeZone = "America/Argentina/Buenos_Aires") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
