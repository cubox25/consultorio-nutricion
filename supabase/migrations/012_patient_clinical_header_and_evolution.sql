-- =============================================================================
-- 012: Cabecera clínica del paciente + datos antropométricos en evoluciones
-- No destruye datos existentes.
-- =============================================================================

-- Pacientes: datos de ficha clínica
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS clinical_history_number TEXT;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS health_insurance TEXT;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS marital_status TEXT;

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS clinical_alerts TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.patients.photo_url IS
  'URL de foto del paciente (opcional).';
COMMENT ON COLUMN public.patients.clinical_history_number IS
  'Número de historia clínica (HC).';
COMMENT ON COLUMN public.patients.health_insurance IS
  'Cobertura / obra social.';
COMMENT ON COLUMN public.patients.marital_status IS
  'Estado civil.';
COMMENT ON COLUMN public.patients.clinical_alerts IS
  'Etiquetas clínicas de alerta (ej. Diabetes Tipo 2, Obesidad).';

-- Evoluciones: hora + antropometría del control + CIE-10
ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS record_time TIME;

ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(6,2)
    CHECK (weight_kg IS NULL OR weight_kg > 0);

ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS height_cm NUMERIC(5,2)
    CHECK (height_cm IS NULL OR height_cm > 0);

ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS bmi NUMERIC(5,2);

ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS bmi_classification TEXT;

ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS cie10_code TEXT;

COMMENT ON COLUMN public.clinical_records.record_time IS
  'Hora opcional de la evolución.';
COMMENT ON COLUMN public.clinical_records.weight_kg IS
  'Peso (kg) registrado en esta evolución.';
COMMENT ON COLUMN public.clinical_records.height_cm IS
  'Talla (cm) registrada en esta evolución.';
COMMENT ON COLUMN public.clinical_records.bmi IS
  'IMC calculado a partir de peso y talla.';
COMMENT ON COLUMN public.clinical_records.bmi_classification IS
  'Clasificación del IMC (Bajo peso, Normal, Sobrepeso, etc.).';
COMMENT ON COLUMN public.clinical_records.cie10_code IS
  'Código CIE-10 opcional.';
