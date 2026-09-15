import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Token que hay que pegar en Meta. También se puede override con WHATSAPP_VERIFY_TOKEN. */
const DEFAULT_VERIFY_TOKEN = "consultorio-pamela-wa-verify-2026";

function allowedTokens(): string[] {
  const env = (process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
  return [...new Set([env, DEFAULT_VERIFY_TOKEN].filter(Boolean))];
}

/**
 * Webhook Meta WhatsApp Cloud API.
 * GET: verificación (hub.mode / hub.verify_token / hub.challenge)
 * POST: eventos (200 rápido; el envío de turnos no depende de esto)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (!mode && !token && !challenge) {
    return new NextResponse("whatsapp-webhook-ok", {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (
    mode === "subscribe" &&
    token &&
    challenge &&
    allowedTokens().includes(token)
  ) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse("Forbidden", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  try {
    await request.json();
  } catch {
    /* body vacío o no JSON */
  }
  return NextResponse.json({ ok: true });
}
