export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.VERCEL) return;

  try {
    const { ensureWhatsAppService } = await import("./lib/whatsapp-ensure.server");
    void ensureWhatsAppService();
  } catch {
    // El panel puede volver a intentar al abrir WhatsApp
  }
}
