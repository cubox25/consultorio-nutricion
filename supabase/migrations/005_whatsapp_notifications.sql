-- =============================================================================
-- WhatsApp (whatsapp-web.js) — flags, tipos de notificación y estado del servicio
-- =============================================================================

-- Recordatorio 2 horas antes (confirmación y 24h ya existen en appointments)
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_2h_sent BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.appointments.confirmation_sent IS
  'Confirmación WhatsApp enviada (whatsapp-service)';
COMMENT ON COLUMN public.appointments.reminder_sent IS
  'Recordatorio WhatsApp ~24h antes enviado';
COMMENT ON COLUMN public.appointments.reminder_2h_sent IS
  'Recordatorio WhatsApp ~2h antes enviado';

-- Evitar spam histórico al activar el servicio por primera vez
UPDATE public.appointments
SET
  confirmation_sent = TRUE,
  confirmation_sent_at = COALESCE(confirmation_sent_at, NOW())
WHERE confirmation_sent = FALSE;

-- Ampliar canal / tipos de la tabla notifications existente
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_channel_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_channel_check
  CHECK (channel IN ('whatsapp_business', 'whatsapp_web', 'email', 'sms'));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_notification_type_check
  CHECK (notification_type IN (
    'confirmacion',
    'recordatorio_24h',
    'recordatorio_dia',
    'recordatorio_2h',
    'otro'
  ));

CREATE INDEX IF NOT EXISTS idx_appointments_wa_confirmation
  ON public.appointments (created_at DESC)
  WHERE confirmation_sent = FALSE AND status <> 'cancelado';

CREATE INDEX IF NOT EXISTS idx_appointments_wa_reminder_24h
  ON public.appointments (appointment_date, start_time)
  WHERE reminder_sent = FALSE AND status <> 'cancelado';

CREATE INDEX IF NOT EXISTS idx_appointments_wa_reminder_2h
  ON public.appointments (appointment_date, start_time)
  WHERE reminder_2h_sent = FALSE AND status <> 'cancelado';

-- Estado singleton del servicio WhatsApp (leído por el panel admin)
CREATE TABLE IF NOT EXISTS public.whatsapp_service_status (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  state TEXT NOT NULL DEFAULT 'DISCONNECTED'
    CHECK (state IN ('CONNECTING', 'QR_REQUIRED', 'READY', 'DISCONNECTED', 'ERROR')),
  qr_required BOOLEAN NOT NULL DEFAULT FALSE,
  last_connected_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  last_error TEXT,
  messages_sent_count INTEGER NOT NULL DEFAULT 0,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.whatsapp_service_status (id, state)
VALUES (1, 'DISCONNECTED')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.whatsapp_service_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read whatsapp status" ON public.whatsapp_service_status;
CREATE POLICY "Staff can read whatsapp status" ON public.whatsapp_service_status
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Service role manages whatsapp status" ON public.whatsapp_service_status;
-- El worker usa service_role (bypass RLS). Staff solo lectura.
