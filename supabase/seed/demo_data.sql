-- =============================================================================
-- Datos DEMO (opcional). NO ejecutar en producción con datos reales.
-- Separado claramente de la migración principal.
-- =============================================================================

-- Consultorios demo
INSERT INTO public.clinics (id, name, address, phone, google_maps_url, appointment_duration_minutes, is_active, sort_order)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Consultorio Aguilares', 'Aguilares, Tucumán', '+54 381 000-0001', 'https://maps.google.com', 40, TRUE, 1),
  ('22222222-2222-2222-2222-222222222222', 'Consultorio Concepción', 'Concepción, Tucumán', '+54 381 000-0002', 'https://maps.google.com', 40, TRUE, 2)
ON CONFLICT (id) DO NOTHING;

-- Horarios demo (lun-vie 09:00-13:00 y 16:00-20:00)
INSERT INTO public.clinic_schedules (clinic_id, weekday, start_time, end_time, break_start, break_end)
SELECT c.id, d.weekday, '09:00'::time, '20:00'::time, '13:00'::time, '16:00'::time
FROM public.clinics c
CROSS JOIN (VALUES (1),(2),(3),(4),(5)) AS d(weekday)
WHERE c.id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
)
AND NOT EXISTS (
  SELECT 1 FROM public.clinic_schedules s WHERE s.clinic_id = c.id
);

-- Pacientes demo
INSERT INTO public.patients (id, first_name, last_name, dni, birth_date, sex, phone, email, address, communication_consent)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', 'María', 'González', '30111222', '1990-05-12', 'femenino', '3815550001', 'maria.gonzalez@example.com', 'Aguilares', TRUE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02', 'Juan', 'Pérez', '30111333', '1985-08-21', 'masculino', '3815550002', 'juan.perez@example.com', 'Concepción', TRUE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa03', 'Lucía', 'Fernández', '30111444', '1995-01-03', 'femenino', '3815550003', 'lucia.fernandez@example.com', 'Aguilares', FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa04', 'Carlos', 'Ruiz', '30111555', '1978-11-30', 'masculino', '3815550004', 'carlos.ruiz@example.com', 'Concepción', TRUE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa05', 'Ana', 'Martínez', '30111666', '1992-07-18', 'femenino', '3815550005', 'ana.martinez@example.com', 'Aguilares', TRUE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa06', 'Pedro', 'Sosa', '30111777', '1988-03-09', 'masculino', '3815550006', 'pedro.sosa@example.com', 'Concepción', FALSE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa07', 'Valentina', 'López', '30111888', '2000-12-01', 'femenino', '3815550007', 'valentina.lopez@example.com', 'Aguilares', TRUE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa08', 'Diego', 'Torres', '30111999', '1983-04-25', 'masculino', '3815550008', 'diego.torres@example.com', 'Concepción', TRUE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa09', 'Camila', 'Díaz', '30112000', '1997-09-14', 'femenino', '3815550009', 'camila.diaz@example.com', 'Aguilares', TRUE),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa10', 'Martín', 'Acosta', '30112111', '1991-06-07', 'masculino', '3815550010', 'martin.acosta@example.com', 'Concepción', FALSE)
ON CONFLICT (id) DO NOTHING;

-- Turnos demo (fechas relativas al día actual)
INSERT INTO public.appointments (
  clinic_id, patient_id, appointment_date, start_time, end_time, status, reason
)
SELECT
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
  CURRENT_DATE,
  '09:00'::time,
  '09:40'::time,
  'confirmado',
  'Control mensual'
WHERE NOT EXISTS (
  SELECT 1 FROM public.appointments
  WHERE clinic_id = '11111111-1111-1111-1111-111111111111'
    AND appointment_date = CURRENT_DATE
    AND start_time = '09:00'::time
);

INSERT INTO public.appointments (
  clinic_id, patient_id, appointment_date, start_time, end_time, status, reason
)
SELECT
  '22222222-2222-2222-2222-222222222222',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa02',
  CURRENT_DATE + 1,
  '10:00'::time,
  '10:40'::time,
  'pendiente',
  'Primera consulta'
WHERE NOT EXISTS (
  SELECT 1 FROM public.appointments
  WHERE clinic_id = '22222222-2222-2222-2222-222222222222'
    AND appointment_date = CURRENT_DATE + 1
    AND start_time = '10:00'::time
);

-- Antropometría demo
INSERT INTO public.anthropometric_records (patient_id, measured_at, weight_kg, height_cm, waist_cm, body_fat_percent)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', CURRENT_DATE - 60, 72.5, 165, 78, 28
WHERE NOT EXISTS (
  SELECT 1 FROM public.anthropometric_records
  WHERE patient_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01' AND measured_at = CURRENT_DATE - 60
);

INSERT INTO public.anthropometric_records (patient_id, measured_at, weight_kg, height_cm, waist_cm, body_fat_percent)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01', CURRENT_DATE - 30, 70.8, 165, 76, 26.5
WHERE NOT EXISTS (
  SELECT 1 FROM public.anthropometric_records
  WHERE patient_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01' AND measured_at = CURRENT_DATE - 30
);

-- Plan alimentario demo
INSERT INTO public.nutrition_plans (
  patient_id, title, plan_date, objective, breakfast, lunch, dinner, recommendations
)
SELECT
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01',
  'Plan de equilibrio energético',
  CURRENT_DATE - 30,
  'Reducción gradual de peso y mejora de hábitos',
  'Yogur natural + avena + fruta',
  'Proteína magra + verduras + carbohidrato complejo',
  'Ensalada + proteína + vegetales cocidos',
  'Hidratar 2 litros de agua al día. Evitar ultraprocesados.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.nutrition_plans
  WHERE patient_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaa01'
    AND title = 'Plan de equilibrio energético'
);
