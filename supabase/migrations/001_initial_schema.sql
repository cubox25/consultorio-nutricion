-- =============================================================================
-- Consultorio de Nutrición - Esquema inicial
-- Zona horaria: America/Argentina/Buenos_Aires
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Perfiles (usuarios autenticados / administradores)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'pending' CHECK (role IN ('admin', 'staff', 'pending')),
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Configuración del sistema (singleton)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name TEXT NOT NULL DEFAULT 'Consultorio de Nutrición',
  professional_name TEXT NOT NULL DEFAULT 'Lic. Nutrición',
  logo_url TEXT,
  description TEXT,
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  address TEXT,
  social_instagram TEXT,
  social_facebook TEXT,
  social_tiktok TEXT,
  primary_color TEXT DEFAULT '#2D6A4F',
  secondary_color TEXT DEFAULT '#95D5B2',
  accent_color TEXT DEFAULT '#1B4332',
  timezone TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  appointment_duration_minutes INTEGER NOT NULL DEFAULT 40,
  min_advance_hours INTEGER NOT NULL DEFAULT 2,
  max_advance_days INTEGER NOT NULL DEFAULT 60,
  auto_create_patient_on_booking BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_hours_before INTEGER NOT NULL DEFAULT 24,
  reminder_day_of_appointment BOOLEAN NOT NULL DEFAULT TRUE,
  booking_policy_text TEXT,
  about_text TEXT,
  services_json JSONB DEFAULT '[]'::jsonb,
  how_to_book_text TEXT,
  footer_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Consultorios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  google_maps_url TEXT,
  appointment_duration_minutes INTEGER NOT NULL DEFAULT 40,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinics_active ON public.clinics(is_active);

-- -----------------------------------------------------------------------------
-- Horarios por consultorio
-- weekday: 0=domingo ... 6=sábado
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_start TIME,
  break_end TIME,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT clinic_schedules_time_check CHECK (start_time < end_time),
  CONSTRAINT clinic_schedules_break_check CHECK (
    (break_start IS NULL AND break_end IS NULL)
    OR (break_start IS NOT NULL AND break_end IS NOT NULL AND break_start < break_end)
  )
);

CREATE INDEX IF NOT EXISTS idx_clinic_schedules_clinic ON public.clinic_schedules(clinic_id);

-- -----------------------------------------------------------------------------
-- Bloqueos de agenda / feriados
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  block_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  is_full_day BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointment_blocks_date ON public.appointment_blocks(block_date);
CREATE INDEX IF NOT EXISTS idx_appointment_blocks_clinic ON public.appointment_blocks(clinic_id);

-- -----------------------------------------------------------------------------
-- Pacientes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dni TEXT,
  birth_date DATE,
  sex TEXT CHECK (sex IN ('femenino', 'masculino', 'otro', 'no_especificado')),
  phone TEXT,
  email TEXT,
  address TEXT,
  occupation TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  notes TEXT,
  communication_consent BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_dni_unique
  ON public.patients(dni) WHERE dni IS NOT NULL AND dni <> '' AND is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_patients_dni ON public.patients(dni);
CREATE INDEX IF NOT EXISTS idx_patients_last_name ON public.patients(last_name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON public.patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_full_name ON public.patients(last_name, first_name);

-- -----------------------------------------------------------------------------
-- Turnos
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'confirmado', 'atendido', 'cancelado', 'no_asistio')),
  reason TEXT,
  notes TEXT,
  guest_first_name TEXT,
  guest_last_name TEXT,
  guest_dni TEXT,
  guest_phone TEXT,
  guest_email TEXT,
  is_public_request BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_sent_at TIMESTAMPTZ,
  confirmation_sent BOOLEAN NOT NULL DEFAULT FALSE,
  confirmation_sent_at TIMESTAMPTZ,
  day_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE,
  day_reminder_sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT appointments_time_check CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic ON public.appointments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_date ON public.appointments(clinic_id, appointment_date);

-- Evitar doble reserva del mismo horario (turnos activos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_no_double_booking
  ON public.appointments(clinic_id, appointment_date, start_time)
  WHERE status NOT IN ('cancelado');

-- -----------------------------------------------------------------------------
-- Historias clínicas / evoluciones
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  record_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  evolution TEXT,
  observations TEXT,
  objectives TEXT,
  recommendations TEXT,
  professional_notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_records_patient ON public.clinical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_clinical_records_date ON public.clinical_records(record_date DESC);

-- -----------------------------------------------------------------------------
-- Antropometría
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.anthropometric_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(6,2) CHECK (weight_kg IS NULL OR weight_kg > 0),
  height_cm NUMERIC(5,2) CHECK (height_cm IS NULL OR height_cm > 0),
  bmi NUMERIC(5,2),
  waist_cm NUMERIC(5,2),
  hip_cm NUMERIC(5,2),
  arm_cm NUMERIC(5,2),
  thigh_cm NUMERIC(5,2),
  neck_cm NUMERIC(5,2),
  body_fat_percent NUMERIC(5,2),
  muscle_mass_kg NUMERIC(6,2),
  fat_mass_kg NUMERIC(6,2),
  body_water_percent NUMERIC(5,2),
  basal_metabolism_kcal NUMERIC(7,2),
  custom_measures JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anthropometric_patient ON public.anthropometric_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_anthropometric_date ON public.anthropometric_records(measured_at DESC);

-- -----------------------------------------------------------------------------
-- Planes alimentarios
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nutrition_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  plan_date DATE NOT NULL DEFAULT CURRENT_DATE,
  objective TEXT,
  description TEXT,
  breakfast TEXT,
  mid_morning TEXT,
  lunch TEXT,
  snack TEXT,
  dinner TEXT,
  extras TEXT,
  recommendations TEXT,
  observations TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_plans_patient ON public.nutrition_plans(patient_id);
CREATE INDEX IF NOT EXISTS idx_nutrition_plans_date ON public.nutrition_plans(plan_date DESC);

-- -----------------------------------------------------------------------------
-- Archivos (referencias a Storage)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN (
    'antropometria', 'analisis', 'estudios', 'fotos', 'plan_alimentario', 'otros'
  )),
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  file_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_files_patient ON public.files(patient_id);
CREATE INDEX IF NOT EXISTS idx_files_category ON public.files(category);
CREATE INDEX IF NOT EXISTS idx_files_date ON public.files(file_date DESC);

-- -----------------------------------------------------------------------------
-- Notificaciones / recordatorios (arquitectura WhatsApp Business API)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  phone TEXT,
  channel TEXT NOT NULL DEFAULT 'whatsapp_business'
    CHECK (channel IN ('whatsapp_business', 'email', 'sms')),
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'confirmacion', 'recordatorio_24h', 'recordatorio_dia', 'otro'
  )),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'enviado', 'fallido', 'omitido')),
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  payload JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_appointment ON public.notifications(appointment_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status);

-- -----------------------------------------------------------------------------
-- Logs de backups
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_type TEXT NOT NULL DEFAULT 'completo',
  status TEXT NOT NULL DEFAULT 'completado'
    CHECK (status IN ('en_proceso', 'completado', 'fallido')),
  file_name TEXT,
  storage_path TEXT,
  record_counts JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Trigger: updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles', 'system_settings', 'clinics', 'clinic_schedules',
    'appointment_blocks', 'patients', 'appointments', 'clinical_records',
    'anthropometric_records', 'nutrition_plans', 'files', 'notifications'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;
       CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Trigger: calcular IMC automáticamente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_bmi()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.weight_kg IS NOT NULL AND NEW.height_cm IS NOT NULL AND NEW.height_cm > 0 THEN
    NEW.bmi := ROUND((NEW.weight_kg / POWER(NEW.height_cm / 100.0, 2))::NUMERIC, 2);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anthropometric_bmi ON public.anthropometric_records;
CREATE TRIGGER trg_anthropometric_bmi
BEFORE INSERT OR UPDATE ON public.anthropometric_records
FOR EACH ROW EXECUTE FUNCTION public.calculate_bmi();

-- -----------------------------------------------------------------------------
-- Trigger: crear perfil al registrarse
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    -- Nunca confiar en metadata del cliente; el admin se asigna solo por SQL.
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Función auxiliar: ¿es staff autenticado?
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'staff')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anthropometric_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

-- Profiles
DROP POLICY IF EXISTS "Staff can read profiles" ON public.profiles;
CREATE POLICY "Staff can read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_staff());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- System settings: lectura pública limitada (sitio), escritura staff
DROP POLICY IF EXISTS "Public can read system settings" ON public.system_settings;
CREATE POLICY "Public can read system settings" ON public.system_settings
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS "Staff can manage system settings" ON public.system_settings;
CREATE POLICY "Staff can manage system settings" ON public.system_settings
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Clinics: lectura pública de activos; gestión staff
DROP POLICY IF EXISTS "Public can read active clinics" ON public.clinics;
CREATE POLICY "Public can read active clinics" ON public.clinics
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE OR public.is_staff());

DROP POLICY IF EXISTS "Staff can manage clinics" ON public.clinics;
CREATE POLICY "Staff can manage clinics" ON public.clinics
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Clinic schedules: lectura pública
DROP POLICY IF EXISTS "Public can read clinic schedules" ON public.clinic_schedules;
CREATE POLICY "Public can read clinic schedules" ON public.clinic_schedules
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS "Staff can manage clinic schedules" ON public.clinic_schedules;
CREATE POLICY "Staff can manage clinic schedules" ON public.clinic_schedules
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Appointment blocks: lectura pública (para disponibilidad); gestión staff
DROP POLICY IF EXISTS "Public can read appointment blocks" ON public.appointment_blocks;
CREATE POLICY "Public can read appointment blocks" ON public.appointment_blocks
  FOR SELECT TO anon, authenticated USING (TRUE);

DROP POLICY IF EXISTS "Staff can manage appointment blocks" ON public.appointment_blocks;
CREATE POLICY "Staff can manage appointment blocks" ON public.appointment_blocks
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Patients: solo staff
DROP POLICY IF EXISTS "Staff can manage patients" ON public.patients;
CREATE POLICY "Staff can manage patients" ON public.patients
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Appointments
DROP POLICY IF EXISTS "Staff can manage appointments" ON public.appointments;
CREATE POLICY "Staff can manage appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Lectura pública mínima: solo horarios ocupados (sin datos clínicos/personales)
-- Se expone vía RPC segura, no SELECT directo de anon sobre appointments.

DROP POLICY IF EXISTS "Public can create appointment requests" ON public.appointments;
-- Las solicitudes públicas SOLO se crean vía RPC create_public_appointment (SECURITY DEFINER).

-- Clinical / anthropometric / plans / files / notifications / backups: solo staff
DROP POLICY IF EXISTS "Staff can manage clinical records" ON public.clinical_records;
CREATE POLICY "Staff can manage clinical records" ON public.clinical_records
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage anthropometric records" ON public.anthropometric_records;
CREATE POLICY "Staff can manage anthropometric records" ON public.anthropometric_records
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage nutrition plans" ON public.nutrition_plans;
CREATE POLICY "Staff can manage nutrition plans" ON public.nutrition_plans
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage files" ON public.files;
CREATE POLICY "Staff can manage files" ON public.files
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage notifications" ON public.notifications;
CREATE POLICY "Staff can manage notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Staff can manage backup logs" ON public.backup_logs;
CREATE POLICY "Staff can manage backup logs" ON public.backup_logs
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- -----------------------------------------------------------------------------
-- RPC pública: slots ocupados (sin datos personales)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_occupied_slots(
  p_clinic_id UUID,
  p_date DATE
)
RETURNS TABLE (start_time TIME, end_time TIME)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.start_time, a.end_time
  FROM public.appointments a
  WHERE a.clinic_id = p_clinic_id
    AND a.appointment_date = p_date
    AND a.status NOT IN ('cancelado');
$$;

REVOKE ALL ON FUNCTION public.get_occupied_slots(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupied_slots(UUID, DATE) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- RPC: crear solicitud de turno pública (evita doble reserva + paciente)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_public_appointment(
  p_clinic_id UUID,
  p_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_first_name TEXT,
  p_last_name TEXT,
  p_dni TEXT,
  p_phone TEXT,
  p_email TEXT,
  p_reason TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_settings public.system_settings%ROWTYPE;
  v_patient_id UUID;
  v_auto BOOLEAN;
BEGIN
  IF p_clinic_id IS NULL OR p_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'Datos de turno incompletos';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clinics WHERE id = p_clinic_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'El consultorio no está disponible';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE clinic_id = p_clinic_id
      AND appointment_date = p_date
      AND start_time = p_start_time
      AND status NOT IN ('cancelado')
  ) THEN
    RAISE EXCEPTION 'El horario seleccionado ya no está disponible';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.appointment_blocks b
    WHERE b.block_date = p_date
      AND (b.clinic_id IS NULL OR b.clinic_id = p_clinic_id)
      AND (
        b.is_full_day = TRUE
        OR (b.start_time IS NOT NULL AND b.end_time IS NOT NULL
            AND p_start_time < b.end_time AND p_end_time > b.start_time)
      )
  ) THEN
    RAISE EXCEPTION 'La agenda está bloqueada para esa fecha u horario';
  END IF;

  SELECT * INTO v_settings FROM public.system_settings LIMIT 1;
  v_auto := COALESCE(v_settings.auto_create_patient_on_booking, TRUE);

  IF v_auto THEN
    SELECT id INTO v_patient_id
    FROM public.patients
    WHERE (p_dni IS NOT NULL AND p_dni <> '' AND dni = p_dni)
       OR (p_phone IS NOT NULL AND p_phone <> '' AND phone = p_phone)
    LIMIT 1;

    IF v_patient_id IS NULL THEN
      INSERT INTO public.patients (
        first_name, last_name, dni, phone, email, communication_consent
      ) VALUES (
        p_first_name, p_last_name, NULLIF(p_dni, ''), p_phone, NULLIF(p_email, ''), FALSE
      )
      RETURNING id INTO v_patient_id;
    END IF;
  END IF;

  INSERT INTO public.appointments (
    clinic_id, patient_id, appointment_date, start_time, end_time,
    status, reason, notes,
    guest_first_name, guest_last_name, guest_dni, guest_phone, guest_email,
    is_public_request
  ) VALUES (
    p_clinic_id, v_patient_id, p_date, p_start_time, p_end_time,
    'pendiente', p_reason, p_notes,
    p_first_name, p_last_name, NULLIF(p_dni, ''), p_phone, NULLIF(p_email, ''),
    TRUE
  )
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'El horario seleccionado ya no está disponible';
END;
$$;

REVOKE ALL ON FUNCTION public.create_public_appointment(
  UUID, DATE, TIME, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_public_appointment(
  UUID, DATE, TIME, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado patient-files
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-files',
  'patient-files',
  FALSE,
  5242880,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = FALSE,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Staff can read patient files" ON storage.objects;
CREATE POLICY "Staff can read patient files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'patient-files' AND public.is_staff());

DROP POLICY IF EXISTS "Staff can upload patient files" ON storage.objects;
CREATE POLICY "Staff can upload patient files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-files' AND public.is_staff());

DROP POLICY IF EXISTS "Staff can update patient files" ON storage.objects;
CREATE POLICY "Staff can update patient files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'patient-files' AND public.is_staff())
  WITH CHECK (bucket_id = 'patient-files' AND public.is_staff());

DROP POLICY IF EXISTS "Staff can delete patient files" ON storage.objects;
CREATE POLICY "Staff can delete patient files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'patient-files' AND public.is_staff());

-- -----------------------------------------------------------------------------
-- Datos iniciales de configuración (no demo de pacientes)
-- -----------------------------------------------------------------------------
INSERT INTO public.system_settings (
  site_name,
  professional_name,
  description,
  about_text,
  how_to_book_text,
  footer_text,
  services_json,
  timezone
)
SELECT
  'Consultorio de Nutrición',
  'Lic. Nutrición',
  'Acompañamiento nutricional personalizado para mejorar tu bienestar.',
  'Soy licenciada en nutrición y acompaño a mis pacientes con planes realistas, seguimiento cercano y un enfoque integral de la salud.',
  'Elegí el consultorio, la fecha y el horario disponible. Completá tus datos y confirmá la solicitud. Te contactaremos para confirmar el turno.',
  'Cuidamos tu salud con un enfoque profesional y humano.',
  '[
    {"title":"Consulta nutricional","description":"Evaluación integral y plan personalizado."},
    {"title":"Seguimiento y evolución","description":"Control de avances y ajustes del plan."},
    {"title":"Antropometría","description":"Mediciones y análisis de composición corporal."},
    {"title":"Planes alimentarios","description":"Menús adaptados a tu rutina y objetivos."}
  ]'::jsonb,
  'America/Argentina/Buenos_Aires'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);
