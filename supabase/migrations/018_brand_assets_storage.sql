-- =============================================================================
-- 018: Storage brand-assets (logo, foto de inicio, avatares, fotos de paciente)
-- Permite que el staff suba sin depender solo del service role.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'brand-assets',
  'brand-assets',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = TRUE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Lectura pública (el bucket es público; política explícita por claridad)
DROP POLICY IF EXISTS "Public can read brand assets" ON storage.objects;
CREATE POLICY "Public can read brand assets" ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'brand-assets');

DROP POLICY IF EXISTS "Staff can upload brand assets" ON storage.objects;
CREATE POLICY "Staff can upload brand assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'brand-assets' AND public.is_staff());

DROP POLICY IF EXISTS "Staff can update brand assets" ON storage.objects;
CREATE POLICY "Staff can update brand assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'brand-assets' AND public.is_staff())
  WITH CHECK (bucket_id = 'brand-assets' AND public.is_staff());

DROP POLICY IF EXISTS "Staff can delete brand assets" ON storage.objects;
CREATE POLICY "Staff can delete brand assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'brand-assets' AND public.is_staff());
