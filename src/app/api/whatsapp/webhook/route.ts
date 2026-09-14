import { NextResponse } from "next/server";

/**
 * Webhook Meta WhatsApp Cloud API.
 * - GET: verificación (hub.mode / hub.verify_token / hub.challenge)
 * - POST: eventos (mensajes, statuses). Respondemos 200; el envío de turnos
 *   no depende de esto, pero Meta lo pide para completar el setup.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = (process.env.WHATSAPP_VERIFY_TOKEN || "").trim();

  if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: Request) {
  // Meta reintenta si no devolvemos 200 rápido.
  try {
    await request.json();
  } catch {
    /* body vacío o no JSON */
  }
  return NextResponse.json({ ok: true });
}
