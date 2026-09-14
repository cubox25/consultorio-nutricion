import { NextResponse } from "next/server";
import { getWhatsAppCloudConfig } from "@/lib/whatsapp-cloud";
import { processWhatsAppCloudQueue } from "@/lib/whatsapp-cloud-worker";

function authorizeCron(request: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  const auth = request.headers.get("authorization") || "";
  const vercelCron = request.headers.get("x-vercel-cron");

  if (vercelCron === "1") return true;
  if (secret && auth === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  const q = url.searchParams.get("secret");
  if (secret && q && q === secret) return true;

  // Dev local sin secret
  if (!secret && process.env.NODE_ENV !== "production") return true;

  return false;
}

async function run(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const cfg = getWhatsAppCloudConfig();
  if (!cfg.enabled) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "cloud_disabled",
      hint: "Set WHATSAPP_CLOUD_ENABLED=true + TOKEN + PHONE_NUMBER_ID",
    });
  }

  try {
    const result = await processWhatsAppCloudQueue();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error procesando cola";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
