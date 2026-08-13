-- Foto de portada del inicio (tarjeta "Consultorio de nutrición")
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS landing_photo_url TEXT;

COMMENT ON COLUMN public.system_settings.landing_photo_url IS
  'Foto circular de la tarjeta principal del sitio público (inicio).';
