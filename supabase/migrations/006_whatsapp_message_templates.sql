-- Plantillas editables de mensajes WhatsApp (confirmación / recordatorios)
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS whatsapp_confirmation_template TEXT;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_24h_template TEXT;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_2h_template TEXT;

COMMENT ON COLUMN public.system_settings.whatsapp_confirmation_template IS
  'Plantilla del mensaje de confirmación. Placeholders: {nombre} {fecha} {hora} {consultorio} {profesional}';
COMMENT ON COLUMN public.system_settings.whatsapp_reminder_24h_template IS
  'Plantilla recordatorio 24h. Placeholders: {nombre} {fecha} {hora} {consultorio} {profesional}';
COMMENT ON COLUMN public.system_settings.whatsapp_reminder_2h_template IS
  'Plantilla recordatorio 2h. Placeholders: {nombre} {fecha} {hora} {consultorio} {profesional}';
