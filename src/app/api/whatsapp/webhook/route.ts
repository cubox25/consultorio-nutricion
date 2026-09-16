import { NextResponse } from "next/server";
import { handleWhatsAppInbound } from "@/lib/whatsapp-inbound";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  let payload: unknown = null;
  try {
    payload = await request.json();
  } catch {
    /* body vacío o no JSON */
  }
  const body = payload as {
    object?: string;
    entry?: Array<{ changes?: Array<{ value?: { messages?: unknown[] } }> }>;
  } | null;
  const messageCount =
    body?.entry?.reduce(
      (n, e) =>
        n +
        (e.changes?.reduce(
          (m, c) => m + (c.value?.messages?.length || 0),
          0
        ) || 0),
      0
    ) || 0;
  console.info("[whatsapp webhook] post", {
    object: body?.object || null,
    entries: body?.entry?.length || 0,
    messages: messageCount,
  });
  try {
    await handleWhatsAppInbound(payload);
  } catch (err) {
    console.error(
      "[whatsapp webhook]",
      err instanceof Error ? err.message : err
    );
  }
  return NextResponse.json({ ok: true });
}
