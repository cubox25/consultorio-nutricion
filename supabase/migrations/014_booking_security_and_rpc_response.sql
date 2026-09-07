-- =============================================================================
-- 014: Seguridad en reserva pública
-- - Duración del turno obligatoria (anti bloqueo de agenda)
-- - No pisar teléfono de paciente existente
-- - Respuesta JSON con id + nombre oficial (evita API confirm sin auth)
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_public_appointment(
  UUID, DATE, TIME, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

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
RETURNS JSONB
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
  v_cutoff_minutes INTEGER;
  v_max_date DATE;
  v_dni TEXT;
  v_first_name TEXT;
  v_last_name TEXT;
  v_slot_duration INTEGER;
BEGIN
  IF p_clinic_id IS NULL OR p_date IS NULL OR p_start_time IS NULL OR p_end_time IS NULL THEN
    RAISE EXCEPTION 'Datos de turno incompletos';
  END IF;

  IF p_first_name IS NULL OR length(trim(p_first_name)) < 2
     OR p_last_name IS NULL OR length(trim(p_last_name)) < 2 THEN
    RAISE EXCEPTION 'Nombre y apellido son obligatorios';
  END IF;

  v_dni := NULLIF(regexp_replace(trim(COALESCE(p_dni, '')), '\D', '', 'g'), '');

  IF v_dni IS NULL OR length(v_dni) < 7 THEN
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

  v_slot_duration := (EXTRACT(EPOCH FROM (p_end_time - p_start_time)) / 60)::INTEGER;
  IF v_slot_duration <> v_duration THEN
    RAISE EXCEPTION 'La duración del turno no es válida';
  END IF;

  v_now_local := timezone('America/Argentina/Buenos_Aires', now());
  v_slot_local := (p_date + p_start_time);
  v_cutoff_minutes := GREATEST(
    COALESCE(v_settings.booking_cutoff_minutes, 30),
    COALESCE(v_settings.min_advance_hours, 0) * 60
  );
  v_max_date := (v_now_local::date + COALESCE(v_settings.max_advance_days, 60));

  IF p_date > v_max_date THEN
    RAISE EXCEPTION 'La fecha supera la anticipación máxima permitida';
  END IF;

  IF v_slot_local < (v_now_local + make_interval(mins => v_cutoff_minutes)) THEN
    RAISE EXCEPTION 'El horario ya no está disponible (cierre por anticipación)';
  END IF;

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

  v_auto := COALESCE(v_settings.auto_create_patient_on_booking, TRUE);
  v_patient_id := NULL;
  v_first_name := trim(p_first_name);
  v_last_name := trim(p_last_name);

  SELECT id
  INTO v_patient_id
  FROM public.patients
  WHERE is_active = TRUE
    AND regexp_replace(COALESCE(dni, ''), '\D', '', 'g') = v_dni
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_patient_id IS NOT NULL THEN
    SELECT first_name, last_name
    INTO v_first_name, v_last_name
    FROM public.patients
    WHERE id = v_patient_id;

    UPDATE public.patients
    SET phone = CASE
          WHEN phone IS NULL OR trim(phone) = '' THEN trim(p_phone)
          ELSE phone
        END,
        updated_at = now()
    WHERE id = v_patient_id;
  ELSIF v_auto THEN
    INSERT INTO public.patients (
      first_name, last_name, dni, phone, email, communication_consent
    ) VALUES (
      v_first_name,
      v_last_name,
      v_dni,
      trim(p_phone),
      NULLIF(trim(p_email), ''),
      FALSE
    )
    RETURNING id INTO v_patient_id;
  END IF;

  INSERT INTO public.appointments (
    clinic_id, patient_id, appointment_date, start_time, end_time,
    status, reason, notes,
    guest_first_name, guest_last_name, guest_dni, guest_phone, guest_email,
    is_public_request
  ) VALUES (
    p_clinic_id, v_patient_id, p_date, p_start_time, p_end_time,
    'confirmado', p_reason, p_notes,
    v_first_name, v_last_name, v_dni,
    trim(p_phone), NULLIF(trim(p_email), ''),
    TRUE
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'first_name', v_first_name,
    'last_name', v_last_name
  );
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
