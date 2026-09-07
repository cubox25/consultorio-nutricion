-- =============================================================================
-- 013: Varias antropometrías (PDF) por paciente
-- Quita el UNIQUE de patient_id; no borra documentos existentes.
-- =============================================================================

ALTER TABLE public.anthropometry_documents
  DROP CONSTRAINT IF EXISTS anthropometry_documents_patient_id_key;

COMMENT ON TABLE public.anthropometry_documents IS
  'PDFs de antropometría. Un paciente puede tener varios documentos.';
