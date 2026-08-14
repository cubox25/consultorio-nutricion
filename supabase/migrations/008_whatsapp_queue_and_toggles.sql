-- =============================================================================
-- WhatsApp: cola de mensajes, estados, toggles ON/OFF
-- Reutiliza appointments.*_sent como anti-duplicado definitivo.
-- =============================================================================

-- Toggles persistentes (defaults = comportamiento actual del servicio)
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS whatsapp_confirmation_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_24h_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS whatsapp_reminder_2h_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.system_settings.whatsapp_confirmation_enabled IS
  'Si true, encola/envía confirmación WhatsApp al crear turno';
COMMENT ON COLUMN public.system_settings.whatsapp_reminder_24h_enabled IS
  'Si true, encola/envía recordatorio ~24h antes';
COMMENT ON COLUMN public.system_settings.whatsapp_reminder_2h_enabled IS
  'Si true, encola/envía recordatorio ~2h antes';

-- Ampliar estados de notifications (historial / compat)
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_status_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_status_check
  CHECK (status IN ('pendiente', 'enviando', 'enviado', 'fallido', 'omitido', 'error'));

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS message_body TEXT;

-- Cola outbound (fuente de verdad operativa para pendientes/errores/reintentos)
CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  phone TEXT,
  message_type TEXT NOT NULL
    CHECK (message_type IN ('confirmacion', 'recordatorio_24h', 'recordatorio_2h')),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'enviando', 'enviado', 'error', 'omitido')),
  unique_key TEXT NOT NULL,
  body TEXT,
  scheduled_for TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_outbound_unique_key UNIQUE (unique_key)
);

CREATE INDEX IF NOT EXISTS idx_wa_outbound_status
  ON public.whatsapp_outbound_messages (status, created_at);

CREATE INDEX IF NOT EXISTS idx_wa_outbound_appointment
  ON public.whatsapp_outbound_messages (appointment_id);

CREATE INDEX IF NOT EXISTS idx_wa_outbound_type_status
  ON public.whatsapp_outbound_messages (message_type, status);

DROP TRIGGER IF EXISTS trg_whatsapp_outbound_messages_updated_at
  ON public.whatsapp_outbound_messages;
CREATE TRIGGER trg_whatsapp_outbound_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_outbound_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.whatsapp_outbound_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read whatsapp outbound" ON public.whatsapp_outbound_messages;
CREATE POLICY "Staff can read whatsapp outbound" ON public.whatsapp_outbound_messages
  FOR SELECT TO authenticated
  USING (public.is_staff());

-- Staff puede reintentar (pasar error → pendiente) y no más
DROP POLICY IF EXISTS "Staff can retry whatsapp outbound" ON public.whatsapp_outbound_messages;
CREATE POLICY "Staff can retry whatsapp outbound" ON public.whatsapp_outbound_messages
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- El worker usa service_role (bypass RLS) para INSERT/UPDATE masivos.
