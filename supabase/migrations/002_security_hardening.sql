-- =============================================================================
-- 002_security_hardening.sql
-- Endurecimiento de seguridad (roles, booking público, overlaps, DNI, grants)
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de 001_initial_schema.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Roles: permitir 'pending' (sin acceso clínico)
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'staff', 'pending'));

-- -----------------------------------------------------------------------------
-- 2) Nuevos usuarios NUNCA nacen como admin ni leen role del cliente
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
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3) Impedir escalada de privilegios (role no editable por clientes)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
    IF coalesce(auth.jwt()->>'role', '') <> 'service_role' THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- Lectura del propio perfil (además de staff)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_staff());

-- -----------------------------------------------------------------------------
-- 4) is_staff ejecutable desde el cliente (middleware / API)
-- -----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, anon;

-- -----------------------------------------------------------------------------
-- 5) Quitar INSERT público directo en appointments (solo vía RPC)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can create appointment requests" ON public.appointments;

-- -----------------------------------------------------------------------------
-- 6) Evitar solapamientos de turnos (no solo mismo start_time)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_appointment_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointments a
    WHERE a.clinic_id = NEW.clinic_id
      AND a.appointment_date = NEW.appointment_date
      AND a.status <> 'cancelado'
      AND a.id IS DISTINCT FROM NEW.id
      AND a.start_time < NEW.end_time
      AND a.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'El horario se solapa con otro turno existente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_overlap ON public.appointments;
CREATE TRIGGER trg_appointment_overlap
BEFORE INSERT OR UPDATE OF clinic_id, appointment_date, start_time, end_time, status
ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.check_appointment_overlap();

-- -----------------------------------------------------------------------------
-- 7) Unique DNI solo para pacientes activos
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS idx_patients_dni_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_dni_unique
  ON public.patients(dni)
  WHERE dni IS NOT NULL AND dni <> '' AND is_active = TRUE;

-- -----------------------------------------------------------------------------
-- 8) Bloqueos: anon solo columnas necesarias (sin title/reason)
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.appointment_blocks FROM anon;
GRANT SELECT (id, clinic_id, block_date, start_time, end_time, is_full_day)
  ON TABLE public.appointment_blocks TO anon;
-- authenticated (staff) mantiene acceso completo vía grants por defecto + RLS

-- -----------------------------------------------------------------------------
-- 9) RPC pública endurecida: sin vincular a paciente existente; valida agenda
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
  v_duration INTEGER;
  v_weekday INTEGER;
  v_ok_schedule BOOLEAN;
  v_now_local TIMESTAMP;
  v_slot_local TIMESTAMP;
  v_min_advance INTERVAL;
  v_max_date DATE;
BEGIN
  IF p_clinic_id IS NULL OR p_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'Datos de turno incompletos';
  END IF;

  IF p_first_name IS NULL OR length(trim(p_first_name)) < 2
     OR p_last_name IS NULL OR length(trim(p_last_name)) < 2 THEN
    RAISE EXCEPTION 'Nombre y apellido son obligatorios';
  END IF;

  IF p_dni IS NULL OR length(trim(p_dni)) < 7 THEN
    RAISE EXCEPTION 'El DNI es obligatorio';
  END IF;

  IF p_phone IS NULL OR length(trim(p_phone)) < 8 THEN
    RAISE EXCEPTION 'El teléfono es obligatorio';
  END IF;

  IF p_start_time >= p_end_time THEN
    RAISE EXCEPTION 'El horario del turno no es válido';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clinics WHERE id = p_clinic_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'El consultorio no está disponible';
  END IF;

  SELECT * INTO v_settings FROM public.system_settings LIMIT 1;

  SELECT appointment_duration_minutes INTO v_duration
  FROM public.clinics WHERE id = p_clinic_id;

  v_duration := COALESCE(v_duration, v_settings.appointment_duration_minutes, 40);

  -- Anticipación mínima / máxima (zona Argentina)
  v_now_local := timezone('America/Argentina/Buenos_Aires', now());
  v_slot_local := (p_date + p_start_time);
  v_min_advance := make_interval(hours => COALESCE(v_settings.min_advance_hours, 0));
  v_max_date := (v_now_local::date + COALESCE(v_settings.max_advance_days, 60));

  IF p_date > v_max_date THEN
    RAISE EXCEPTION 'La fecha supera la anticipación máxima permitida';
  END IF;

  IF v_slot_local < (v_now_local + v_min_advance) THEN
    RAISE EXCEPTION 'El horario no respeta la anticipación mínima';
  END IF;

  -- Debe coincidir con un horario de atención (y fuera de pausa)
  v_weekday := EXTRACT(DOW FROM p_date)::INTEGER;
  SELECT EXISTS (
    SELECT 1
    FROM public.clinic_schedules s
    WHERE s.clinic_id = p_clinic_id
      AND s.is_active = TRUE
      AND s.weekday = v_weekday
      AND p_start_time >= s.start_time
      AND p_end_time <= s.end_time
      AND (
        s.break_start IS NULL
        OR s.break_end IS NULL
        OR p_end_time <= s.break_start
        OR p_start_time >= s.break_end
      )
  ) INTO v_ok_schedule;

  IF NOT v_ok_schedule THEN
    RAISE EXCEPTION 'El horario está fuera de la agenda del consultorio';
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

  IF EXISTS (
    SELECT 1 FROM public.appointments
    WHERE clinic_id = p_clinic_id
      AND appointment_date = p_date
      AND status NOT IN ('cancelado')
      AND start_time < p_end_time
      AND end_time > p_start_time
  ) THEN
    RAISE EXCEPTION 'El horario seleccionado ya no está disponible';
  END IF;

  -- NO vincular a pacientes existentes por DNI/teléfono (evita contaminación de fichas).
  -- Si auto_create está activo, crea un paciente NUEVO solo cuando el DNI no existe.
  -- Si el DNI ya existe, deja patient_id NULL y conserva datos en guest_*.
  v_auto := COALESCE(v_settings.auto_create_patient_on_booking, TRUE);
  v_patient_id := NULL;

  IF v_auto THEN
    IF EXISTS (
      SELECT 1 FROM public.patients
      WHERE dni = NULLIF(trim(p_dni), '')
        AND is_active = TRUE
    ) THEN
      v_patient_id := NULL;
    ELSE
      INSERT INTO public.patients (
        first_name, last_name, dni, phone, email, communication_consent
      ) VALUES (
        trim(p_first_name),
        trim(p_last_name),
        NULLIF(trim(p_dni), ''),
        trim(p_phone),
        NULLIF(trim(p_email), ''),
        FALSE
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
    trim(p_first_name), trim(p_last_name), NULLIF(trim(p_dni), ''),
    trim(p_phone), NULLIF(trim(p_email), ''),
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
-- 10) Historias clínicas: append-only (sin UPDATE vía cliente)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Staff can manage clinical records" ON public.clinical_records;
CREATE POLICY "Staff can select clinical records" ON public.clinical_records
  FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY "Staff can insert clinical records" ON public.clinical_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff());
CREATE POLICY "Staff can delete clinical records" ON public.clinical_records
  FOR DELETE TO authenticated
  USING (public.is_staff());

-- -----------------------------------------------------------------------------
-- 11) Nota operativa
-- Desactivar registro público en Supabase Auth (Authentication → Providers → Email
-- → Disable sign ups) salvo que necesites alta controlada de staff.
-- Los administradores se promueven solo por SQL:
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'tu@email.com';
-- =============================================================================
