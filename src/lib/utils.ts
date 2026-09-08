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

/** Capitaliza solo la primera letra de cada palabra (ej. Pamela Guerrero). */
function toTitleCaseName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => {
      if (!word) return word;
      const lower = word.toLocaleLowerCase("es-AR");
      return lower.charAt(0).toLocaleUpperCase("es-AR") + lower.slice(1);
    })
    .join(" ");
}

/** Quita títulos/profesión: "Pamela Guerrero, Lic. ..." → "Pamela Guerrero". */
function stripProfessionalTitle(value: string): string {
  let name = value.split(",")[0]?.trim() || value.trim();
  name = name
    .replace(
      /\s+(lic\.?|licenciad[oa]|dr\.?|dra\.?|nut\.?|nutricionista)\b.*$/i,
      ""
    )
    .trim();
  return name || value.trim();
}

/** Nombre admin separado y con mayúscula inicial (ej. Pamela Guerrero). */
export function formatAdminDisplayName(
  ...candidates: Array<string | null | undefined>
): string {
  const fallback = "Pamela Guerrero";
  const spaced = candidates.find((c) => {
    const v = (c ?? "").trim();
    return v.length > 0 && /\s/.test(v);
  });
  if (spaced) return toTitleCaseName(stripProfessionalTitle(spaced));
  for (const raw of candidates) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    // Username/email local sin espacios → no se puede separar de forma fiable
    if (/^[a-z0-9._-]+$/i.test(value)) return fallback;
    return toTitleCaseName(stripProfessionalTitle(value));
  }
  return fallback;
}

export function displayPatientName(input: {
  first_name?: string | null;
  last_name?: string | null;
  guest_first_name?: string | null;
  guest_last_name?: string | null;
  patient?: { first_name?: string | null; last_name?: string | null } | null;
}) {
  // Prioridad: ficha del paciente (vinculada por DNI) > nombre directo > guest
  if (input.patient?.first_name || input.patient?.last_name) {
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

/** Clasificación OMS adulta (aprox.) a partir del IMC. */
export function bmiClassification(bmi?: number | null) {
  if (bmi == null || !Number.isFinite(bmi)) return null;
  if (bmi < 18.5) return "Bajo peso";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Sobrepeso";
  if (bmi < 35) return "Obesidad I";
  if (bmi < 40) return "Obesidad II";
  return "Obesidad III";
}

/** Edad en años a partir de YYYY-MM-DD; null si no hay fecha válida. */
export function ageFromBirthDate(birthDate?: string | null) {
  if (!birthDate) return null;
  const raw = String(birthDate).slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  const month = today.getMonth() + 1;
  const day = today.getDate();
  if (month < m || (month === m && day < d)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** HC visible: número cargado o código corto del UUID. */
export function clinicalHistoryLabel(
  clinicalHistoryNumber?: string | null,
  patientId?: string
) {
  const custom = clinicalHistoryNumber?.trim();
  if (custom) return custom;
  if (!patientId) return "—";
  return patientId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function formatARS(value: number | null | undefined) {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(safe);
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
