import { NextResponse } from "next/server";
import { getWhatsAppCloudConfig } from "@/lib/whatsapp-cloud";
import { processWhatsAppCloudQueue } from "@/lib/whatsapp-cloud-worker";
import { tryCreateServiceClient } from "@/lib/supabase/admin";

/**
 * Disparo liviano tras reservar un turno (público).
 * Solo encola/envía confirmación de un appointment recién creado.
 */
export async function POST(request: Request) {
  if (!getWhatsAppCloudConfig().enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: "cloud_disabled" });
  }

  if (!tryCreateServiceClient()) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason: "no_service_role",
    });
  }

  const body = (await request.json().catch(() => ({}))) as {
    appointmentId?: string;
  };
  const appointmentId = String(body.appointmentId || "").trim();
  if (!appointmentId) {
    return NextResponse.json({ error: "Falta appointmentId" }, { status: 400 });
  }

  // Solo UUID simples
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      appointmentId
    )
  ) {
    return NextResponse.json({ error: "appointmentId inválido" }, { status: 400 });
  }

  try {
    const service = tryCreateServiceClient()!;
    const { data: row, error } = await service
      .from("appointments")
      .select("id, created_at, confirmation_sent, status")
      .eq("id", appointmentId)
      .maybeSingle();

    if (error || !row) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }

    const created = row.created_at ? new Date(row.created_at).getTime() : 0;
    if (!created || Date.now() - created > 15 * 60 * 1000) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "too_old",
      });
    }

    if (row.confirmation_sent || row.status === "cancelado") {
      return NextResponse.json({ ok: true, skipped: true, reason: "already" });
    }

    const result = await processWhatsAppCloudQueue({
      onlyConfirmations: true,
      appointmentId,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
