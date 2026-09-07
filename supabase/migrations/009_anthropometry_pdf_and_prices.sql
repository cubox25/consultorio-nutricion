-- =============================================================================
-- 009: PDFs de antropometría (Storage) + precios de consulta
-- No destruye tablas existentes (anthropometric_records, nutrition_plans).
-- =============================================================================

-- Precios editables desde Administración → Configuración
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS consultation_price NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS anthropometry_price NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.system_settings.consultation_price IS
  'Precio vigente de la consulta nutricional (ARS). Solo staff puede modificarlo.';
COMMENT ON COLUMN public.system_settings.anthropometry_price IS
  'Precio vigente de la antropometría (ARS). Solo staff puede modificarlo.';

-- Un PDF vigente por paciente (el archivo vive en Storage, no en la fila)
CREATE TABLE IF NOT EXISTS public.anthropometry_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL UNIQUE REFERENCES public.patients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anthropometry_documents_patient
  ON public.anthropometry_documents(patient_id);
CREATE INDEX IF NOT EXISTS idx_anthropometry_documents_updated
  ON public.anthropometry_documents(updated_at DESC);

ALTER TABLE public.anthropometry_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage anthropometry documents" ON public.anthropometry_documents;
CREATE POLICY "Staff can manage anthropometry documents" ON public.anthropometry_documents
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Bucket privado: anthropometry/{patient_id}/antropometria.pdf
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anthropometry',
  'anthropometry',
  FALSE,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types,
    public = FALSE;

DROP POLICY IF EXISTS "Staff can read anthropometry files" ON storage.objects;
CREATE POLICY "Staff can read anthropometry files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'anthropometry' AND public.is_staff());

DROP POLICY IF EXISTS "Staff can upload anthropometry files" ON storage.objects;
CREATE POLICY "Staff can upload anthropometry files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anthropometry' AND public.is_staff());

DROP POLICY IF EXISTS "Staff can update anthropometry files" ON storage.objects;
CREATE POLICY "Staff can update anthropometry files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'anthropometry' AND public.is_staff())
  WITH CHECK (bucket_id = 'anthropometry' AND public.is_staff());

DROP POLICY IF EXISTS "Staff can delete anthropometry files" ON storage.objects;
CREATE POLICY "Staff can delete anthropometry files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'anthropometry' AND public.is_staff());

-- Slots ocupados en un rango (calendario público, sin datos personales)
CREATE OR REPLACE FUNCTION public.get_occupied_slots_range(
  p_clinic_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS TABLE (appointment_date DATE, start_time TIME, end_time TIME)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.appointment_date, a.start_time, a.end_time
  FROM public.appointments a
  WHERE a.clinic_id = p_clinic_id
    AND a.appointment_date >= p_from
    AND a.appointment_date <= p_to
    AND a.status NOT IN ('cancelado');
$$;

REVOKE ALL ON FUNCTION public.get_occupied_slots_range(UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_occupied_slots_range(UUID, DATE, DATE) TO anon, authenticated;
