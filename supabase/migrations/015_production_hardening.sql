-- =============================================================================
-- 015_production_hardening.sql
-- Endurecimiento producción: columnas sensibles de system_settings no expuestas a anon
-- Compatible si faltan migraciones 003/004/009 (crea columnas faltantes con IF NOT EXISTS).
-- =============================================================================

-- Columnas que otras migraciones pueden no haber aplicado aún
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS landing_photo_url TEXT;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS booking_cutoff_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS consultation_price NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS anthropometry_price NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Anon solo necesita campos públicos de la web / reserva.
-- Plantillas WhatsApp y toggles internos quedan fuera del SELECT anónimo.
REVOKE ALL ON TABLE public.system_settings FROM anon;

GRANT SELECT (
  id,
  site_name,
  professional_name,
  logo_url,
  landing_photo_url,
  description,
  phone,
  whatsapp,
  email,
  address,
  social_instagram,
  social_facebook,
  social_tiktok,
  primary_color,
  secondary_color,
  accent_color,
  timezone,
  appointment_duration_minutes,
  min_advance_hours,
  booking_cutoff_minutes,
  max_advance_days,
  auto_create_patient_on_booking,
  reminder_enabled,
  reminder_hours_before,
  reminder_day_of_appointment,
  booking_policy_text,
  about_text,
  services_json,
  how_to_book_text,
  footer_text,
  consultation_price,
  anthropometry_price,
  created_at,
  updated_at
) ON TABLE public.system_settings TO anon;

-- Limpia fotos embebidas en services_json (legado: data URLs legibles por anon).
UPDATE public.system_settings
SET services_json = COALESCE(
  (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(COALESCE(services_json, '[]'::jsonb)) AS elem
    WHERE COALESCE(elem->>'title', '') <> '__landing_photo__'
  ),
  '[]'::jsonb
)
WHERE services_json IS NOT NULL
  AND services_json::text LIKE '%__landing_photo__%';
