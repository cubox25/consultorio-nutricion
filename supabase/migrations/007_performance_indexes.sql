-- Índices de rendimiento (sin cambio de esquema de datos ni RLS).
-- Aceleran filtros frecuentes de agenda, notificaciones y dashboard.

CREATE INDEX IF NOT EXISTS idx_appointments_date_status
  ON public.appointments (appointment_date, status);

CREATE INDEX IF NOT EXISTS idx_appointments_date_time
  ON public.appointments (appointment_date, start_time);

CREATE INDEX IF NOT EXISTS idx_patients_active_created
  ON public.patients (is_active, created_at);

CREATE INDEX IF NOT EXISTS idx_clinical_records_patient_date
  ON public.clinical_records (patient_id, record_date DESC);
