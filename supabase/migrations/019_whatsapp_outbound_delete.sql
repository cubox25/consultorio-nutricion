-- Staff puede borrar historial / cola de WhatsApp desde el panel
DROP POLICY IF EXISTS "Staff can delete whatsapp outbound" ON public.whatsapp_outbound_messages;
CREATE POLICY "Staff can delete whatsapp outbound" ON public.whatsapp_outbound_messages
  FOR DELETE TO authenticated
  USING (public.is_staff());
