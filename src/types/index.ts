export type UserRole = "admin" | "staff" | "pending";

export type AppointmentStatus =
  | "pendiente"
  | "confirmado"
  | "atendido"
  | "cancelado"
  | "no_asistio";

export type FileCategory =
  | "antropometria"
  | "analisis"
  | "estudios"
  | "fotos"
  | "plan_alimentario"
  | "otros";

export type Sex = "femenino" | "masculino" | "otro" | "no_especificado";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SystemSettings {
  id: string;
  site_name: string;
  professional_name: string;
  logo_url: string | null;
  /** Foto circular de la tarjeta principal del inicio. */
  landing_photo_url?: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  social_instagram: string | null;
  social_facebook: string | null;
  social_tiktok: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  timezone: string;
  appointment_duration_minutes: number;
  min_advance_hours: number;
  /** Minutos antes del inicio en que el turno deja de mostrarse/aceptarse. */
  booking_cutoff_minutes?: number;
  max_advance_days: number;
  auto_create_patient_on_booking: boolean;
  reminder_enabled: boolean;
  reminder_hours_before: number;
  reminder_day_of_appointment: boolean;
  /** Plantillas WhatsApp (migración 006) */
  whatsapp_confirmation_template?: string | null;
  whatsapp_reminder_24h_template?: string | null;
  whatsapp_reminder_2h_template?: string | null;
  /** Toggles ON/OFF (migración 008) */
  whatsapp_confirmation_enabled?: boolean;
  whatsapp_reminder_24h_enabled?: boolean;
  whatsapp_reminder_2h_enabled?: boolean;
  booking_policy_text: string | null;
  about_text: string | null;
  services_json: ServiceItem[];
  how_to_book_text: string | null;
  footer_text: string | null;
  /** Precios vigentes (migración 009). Solo staff puede editarlos. */
  consultation_price?: number | null;
  anthropometry_price?: number | null;
  /** Nombres públicos de precios / opción combo (vía services_json). */
  consultation_price_label?: string | null;
  anthropometry_price_label?: string | null;
  booking_combo_label?: string | null;
  booking_show_combined?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceItem {
  title: string;
  description: string;
  /** Icono opcional para tarjetas de servicios en la home. */
  icon?: string;
}

export interface Clinic {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  google_maps_url: string | null;
  appointment_duration_minutes: number;
  is_active: boolean;
  sort_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClinicSchedule {
  id: string;
  clinic_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppointmentBlock {
  id: string;
  clinic_id: string | null;
  title: string;
  block_date: string;
  start_time: string | null;
  end_time: string | null;
  is_full_day: boolean;
  reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  dni: string | null;
  birth_date: string | null;
  sex: Sex | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  occupation: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  photo_url?: string | null;
  clinical_history_number?: string | null;
  health_insurance?: string | null;
  marital_status?: string | null;
  clinical_alerts?: string[] | null;
  communication_consent: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  clinic_id: string;
  patient_id: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  guest_first_name: string | null;
  guest_last_name: string | null;
  guest_dni: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  is_public_request: boolean;
  reminder_sent: boolean;
  reminder_sent_at: string | null;
  confirmation_sent: boolean;
  confirmation_sent_at: string | null;
  day_reminder_sent: boolean;
  day_reminder_sent_at: string | null;
  /** Presente tras migración 005 */
  reminder_2h_sent?: boolean;
  reminder_2h_sent_at?: string | null;
  created_by: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient | null;
  clinic?: Clinic | null;
}

export interface ClinicalRecord {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  record_date: string;
  record_time?: string | null;
  reason: string | null;
  evolution: string | null;
  observations: string | null;
  objectives: string | null;
  recommendations: string | null;
  professional_notes: string | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  bmi?: number | null;
  bmi_classification?: string | null;
  cie10_code?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient | null;
}

export type BookingServiceType =
  | "consulta"
  | "antropometria"
  | "consulta_antropometria";

export const BOOKING_SERVICE_LABELS: Record<BookingServiceType, string> = {
  consulta: "Consulta nutricional",
  antropometria: "Antropometría",
  consulta_antropometria: "Consulta + antropometría",
};

export interface AnthropometryDocument {
  id: string;
  patient_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient | null;
}

export interface AnthropometricRecord {
  id: string;
  patient_id: string;
  measured_at: string;
  weight_kg: number | null;
  height_cm: number | null;
  bmi: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  arm_cm: number | null;
  thigh_cm: number | null;
  neck_cm: number | null;
  body_fat_percent: number | null;
  muscle_mass_kg: number | null;
  fat_mass_kg: number | null;
  body_water_percent: number | null;
  basal_metabolism_kcal: number | null;
  custom_measures: Record<string, number | string> | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient | null;
}

export interface NutritionPlan {
  id: string;
  patient_id: string;
  title: string;
  plan_date: string;
  objective: string | null;
  description: string | null;
  breakfast: string | null;
  mid_morning: string | null;
  lunch: string | null;
  snack: string | null;
  dinner: string | null;
  extras: string | null;
  recommendations: string | null;
  observations: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient | null;
}

export interface PatientFile {
  id: string;
  patient_id: string;
  category: FileCategory;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  file_date: string;
  notes: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  patient?: Patient | null;
}

export interface PatientActivityHints {
  lastConsultation: string | null;
  nextAppointment: string | null;
}

export interface BackupLog {
  id: string;
  backup_type: string;
  status: "en_proceso" | "completado" | "fallido";
  file_name: string | null;
  storage_path: string | null;
  record_counts: Record<string, number> | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TimeSlot {
  start: string;
  end: string;
}

export interface DashboardStats {
  totalPatients: number;
  newPatients: number;
  todayAppointments: number;
  weekAppointments: number;
  pendingAppointments: number;
  confirmedAppointments: number;
  monthAppointments: number;
  attendedAppointments: number;
  cancelledAppointments: number;
  noShowAppointments: number;
  patientsByMonth: { label: string; total: number }[];
  byClinic: { name: string; total: number }[];
  upcoming: Appointment[];
  todayList: Appointment[];
}

export const APPOINTMENT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  atendido: "Atendido",
  cancelado: "Cancelado",
  no_asistio: "No asistió",
};

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  antropometria: "Antropometría",
  analisis: "Análisis",
  estudios: "Estudios",
  fotos: "Fotos",
  plan_alimentario: "Documento",
  otros: "Otros",
};

export const WEEKDAY_LABELS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

export const SEX_LABELS: Record<Sex, string> = {
  femenino: "Femenino",
  masculino: "Masculino",
  otro: "Otro",
  no_especificado: "No especificado",
};
