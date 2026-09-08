-- =============================================================================
-- 016_fix_anon_system_settings_select.sql
-- Repara /turnos: anon necesita leer system_settings.
-- Enfoque robusto: GRANT SELECT de tabla + REVOKE de columnas sensibles.
-- =============================================================================

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS landing_photo_url TEXT;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS booking_cutoff_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS consultation_price NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS anthropometry_price NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS reminder_hours_before INTEGER NOT NULL DEFAULT 24;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS reminder_day_of_appointment BOOLEAN NOT NULL DEFAULT true;

-- Lectura pública de settings (web + reserva)
GRANT SELECT ON TABLE public.system_settings TO anon;

-- Quitar solo datos internos de WhatsApp (si existen las columnas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_settings'
      AND column_name = 'whatsapp_confirmation_template'
  ) THEN
    EXECUTE 'REVOKE SELECT (whatsapp_confirmation_template) ON public.system_settings FROM anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_settings'
      AND column_name = 'whatsapp_reminder_24h_template'
  ) THEN
    EXECUTE 'REVOKE SELECT (whatsapp_reminder_24h_template) ON public.system_settings FROM anon';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'system_settings'
      AND column_name = 'whatsapp_reminder_2h_template'
  ) THEN
    EXECUTE 'REVOKE SELECT (whatsapp_reminder_2h_template) ON public.system_settings FROM anon';
  END IF;
END $$;
