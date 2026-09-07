import { z } from "zod";

const phoneRegex = /^[+]?[\d\s()-]{8,20}$/;

export const loginSchema = z.object({
  email: z.string().email("Ingresá un email válido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});

export const patientSchema = z.object({
  first_name: z.string().min(2, "El nombre es obligatorio"),
  last_name: z.string().min(2, "El apellido es obligatorio"),
  dni: z.string().min(7, "Ingresá un DNI válido").max(12, "DNI demasiado largo").optional().or(z.literal("")),
  birth_date: z.string().optional().or(z.literal("")),
  sex: z.enum(["femenino", "masculino", "otro", "no_especificado"]).optional().nullable(),
  phone: z
    .string()
    .regex(phoneRegex, "Ingresá un teléfono válido")
    .optional()
    .or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  occupation: z.string().optional().or(z.literal("")),
  emergency_contact_name: z.string().optional().or(z.literal("")),
  emergency_contact_phone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  photo_url: z.string().optional().or(z.literal("")),
  clinical_history_number: z.string().optional().or(z.literal("")),
  health_insurance: z.string().optional().or(z.literal("")),
  marital_status: z.string().optional().or(z.literal("")),
  /** En el form se edita como texto separado por comas; al guardar se convierte a string[]. */
  clinical_alerts: z.string().optional().or(z.literal("")),
  communication_consent: z.boolean().default(false),
});

export const publicBookingSchema = z.object({
  clinic_id: z.string().uuid("Seleccioná un consultorio"),
  service_type: z.enum(["consulta", "consulta_antropometria"], {
    required_error: "Seleccioná un servicio",
    invalid_type_error: "Seleccioná un servicio",
  }),
  appointment_date: z.string().min(1, "Seleccioná una fecha"),
  start_time: z.string().min(1, "Seleccioná un horario"),
  end_time: z.string().min(1),
  first_name: z.string().min(2, "El nombre es obligatorio"),
  last_name: z.string().min(2, "El apellido es obligatorio"),
  dni: z.string().min(7, "El DNI es obligatorio").max(12),
  phone: z.string().regex(phoneRegex, "Ingresá un teléfono válido"),
});

export const appointmentSchema = z.object({
  clinic_id: z.string().uuid("Seleccioná un consultorio"),
  patient_id: z.string().uuid("Seleccioná un paciente").optional().nullable(),
  appointment_date: z.string().min(1, "Seleccioná una fecha"),
  start_time: z.string().min(1, "Seleccioná un horario"),
  end_time: z.string().min(1),
  status: z.enum(["pendiente", "confirmado", "atendido", "cancelado", "no_asistio"]),
  reason: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  guest_first_name: z.string().optional().or(z.literal("")),
  guest_last_name: z.string().optional().or(z.literal("")),
  guest_dni: z.string().optional().or(z.literal("")),
  guest_phone: z.string().optional().or(z.literal("")),
  guest_email: z.string().email("Email inválido").optional().or(z.literal("")),
});

export const clinicalRecordSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().optional().nullable(),
  record_date: z.string().min(1, "La fecha es obligatoria"),
  record_time: z.string().optional().or(z.literal("")),
  reason: z.string().optional().or(z.literal("")),
  evolution: z.string().optional().or(z.literal("")),
  weight_kg: z.preprocess(
    (v) =>
      v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))
        ? null
        : v,
    z.coerce.number().positive("El peso debe ser positivo").nullable().optional()
  ),
  height_cm: z.preprocess(
    (v) =>
      v === "" || v === null || v === undefined || (typeof v === "number" && Number.isNaN(v))
        ? null
        : v,
    z.coerce.number().positive("La talla debe ser positiva").nullable().optional()
  ),
});

export const anthropometricSchema = z.object({
  patient_id: z.string().uuid(),
  measured_at: z.string().min(1, "La fecha es obligatoria"),
  weight_kg: z.coerce.number().positive("El peso debe ser positivo").optional().nullable(),
  height_cm: z.coerce.number().positive("La altura debe ser positiva").optional().nullable(),
  waist_cm: z.coerce.number().positive().optional().nullable(),
  hip_cm: z.coerce.number().positive().optional().nullable(),
  arm_cm: z.coerce.number().positive().optional().nullable(),
  thigh_cm: z.coerce.number().positive().optional().nullable(),
  neck_cm: z.coerce.number().positive().optional().nullable(),
  body_fat_percent: z.coerce.number().min(0).max(100).optional().nullable(),
  muscle_mass_kg: z.coerce.number().positive().optional().nullable(),
  fat_mass_kg: z.coerce.number().positive().optional().nullable(),
  body_water_percent: z.coerce.number().min(0).max(100).optional().nullable(),
  basal_metabolism_kcal: z.coerce.number().positive().optional().nullable(),
  notes: z.string().optional().or(z.literal("")),
});

export const clinicSchema = z.object({
  name: z.string().min(2, "El nombre es obligatorio"),
  address: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  google_maps_url: z.string().url("URL inválida").optional().or(z.literal("")),
  appointment_duration_minutes: z.coerce.number().int().min(10).max(180),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
  notes: z.string().optional().or(z.literal("")),
});

export const settingsSchema = z.object({
  site_name: z.string().min(2),
  professional_name: z.string().min(2),
  description: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  whatsapp: z.string().optional().or(z.literal("")),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  social_instagram: z.string().optional().or(z.literal("")),
  social_facebook: z.string().optional().or(z.literal("")),
  social_tiktok: z.string().optional().or(z.literal("")),
  primary_color: z.string().optional().or(z.literal("")),
  secondary_color: z.string().optional().or(z.literal("")),
  accent_color: z.string().optional().or(z.literal("")),
  timezone: z.string().default("America/Argentina/Buenos_Aires"),
  appointment_duration_minutes: z.coerce.number().int().min(10).max(180),
  min_advance_hours: z.coerce.number().int().min(0).max(168),
  booking_cutoff_minutes: z.coerce.number().int().min(0).max(1440),
  max_advance_days: z.coerce.number().int().min(1).max(365),
  auto_create_patient_on_booking: z.boolean(),
  reminder_enabled: z.boolean(),
  reminder_hours_before: z.coerce.number().int().min(1).max(72),
  reminder_day_of_appointment: z.boolean(),
  booking_policy_text: z.string().optional().or(z.literal("")),
  about_text: z.string().optional().or(z.literal("")),
  how_to_book_text: z.string().optional().or(z.literal("")),
  footer_text: z.string().optional().or(z.literal("")),
  consultation_price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  anthropometry_price: z.coerce.number().min(0, "El precio no puede ser negativo"),
  hero_title: z.string().optional().or(z.literal("")),
  hero_card_eyebrow: z.string().optional().or(z.literal("")),
  hero_card_tagline: z.string().optional().or(z.literal("")),
  professional_title: z.string().optional().or(z.literal("")),
  about_section_label: z.string().optional().or(z.literal("")),
  about_section_title: z.string().optional().or(z.literal("")),
  about_section_body: z.string().optional().or(z.literal("")),
  about_highlights_text: z.string().optional().or(z.literal("")),
  services_section_label: z.string().optional().or(z.literal("")),
  services_section_title: z.string().optional().or(z.literal("")),
  clinics_section_label: z.string().optional().or(z.literal("")),
  clinics_section_title: z.string().optional().or(z.literal("")),
  cta_title: z.string().optional().or(z.literal("")),
  cta_subtitle: z.string().optional().or(z.literal("")),
  landing_services: z
    .array(
      z.object({
        title: z.string().min(1, "Título requerido"),
        description: z.string().optional().or(z.literal("")),
        icon: z.enum([
          "apple",
          "scale",
          "salad",
          "heart",
          "trending-down",
          "trending-up",
        ]),
      })
    )
    .default([]),
});

export const ALLOWED_FILE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "xlsx"] as const;

export const FILE_SIZE_LIMITS: Record<string, number> = {
  pdf: 5 * 1024 * 1024,
  jpg: 3 * 1024 * 1024,
  jpeg: 3 * 1024 * 1024,
  png: 3 * 1024 * 1024,
  xlsx: 2 * 1024 * 1024,
};

export const ANTHROPOMETRY_PDF_MAX_BYTES = 10 * 1024 * 1024;

export function validateAnthropometryPdf(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = (file.type || "").toLowerCase();
  if (ext !== "pdf" && mime !== "application/pdf") {
    return "Solo se aceptan archivos PDF.";
  }
  if (file.size > ANTHROPOMETRY_PDF_MAX_BYTES) {
    return "El PDF supera el límite de 10 MB.";
  }
  return null;
}

export function validateUploadFile(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_FILE_EXTENSIONS.includes(ext as (typeof ALLOWED_FILE_EXTENSIONS)[number])) {
    return "Tipo de archivo no permitido. Usá PDF, JPG, JPEG, PNG o XLSX.";
  }
  const max = FILE_SIZE_LIMITS[ext];
  if (max && file.size > max) {
    const mb = Math.round(max / (1024 * 1024));
    return `El archivo supera el límite de ${mb} MB para .${ext}.`;
  }
  return null;
}

export type PatientFormValues = z.infer<typeof patientSchema>;
export type PublicBookingValues = z.infer<typeof publicBookingSchema>;
export type AppointmentFormValues = z.infer<typeof appointmentSchema>;
export type ClinicalRecordFormValues = z.infer<typeof clinicalRecordSchema>;
export type AnthropometricFormValues = z.infer<typeof anthropometricSchema>;
export type ClinicFormValues = z.infer<typeof clinicSchema>;
export type SettingsFormValues = z.infer<typeof settingsSchema>;
