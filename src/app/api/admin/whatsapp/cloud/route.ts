import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWhatsAppCloudConfig, getWhatsAppCloudStatus } from "@/lib/whatsapp-cloud";
import { processWhatsAppCloudQueue } from "@/lib/whatsapp-cloud-worker";
import { tryCreateServiceClient } from "@/lib/supabase/admin";

async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: NextResponse.json({ error: "No autorizado." }, { status: 401 }) };
  }
  const { data: isStaff, error: staffError } = await supabase.rpc("is_staff");
  if (staffError || isStaff !== true) {
    return {
      error: NextResponse.json({ error: "No tenés permisos." }, { status: 403 }),
    };
  }
  return { user };
}

/** Estado Cloud API para el panel. */
export async function GET() {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  const status = getWhatsAppCloudStatus();
  const cfg = getWhatsAppCloudConfig();
  return NextResponse.json({
    ok: true,
    ...status,
    enabled: cfg.enabled,
    hasServiceRole: Boolean(tryCreateServiceClient()),
  });
}

/** Forzar ciclo de cola (staff). */
export async function POST(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  if (!getWhatsAppCloudConfig().enabled) {
    return NextResponse.json(
      {
        error:
          "Cloud API no está habilitada. Configurá las variables en Vercel (ver docs/WHATSAPP-CLOUD-API-SETUP.md).",
      },
      { status: 400 }
    );
  }

  if (!tryCreateServiceClient()) {
    return NextResponse.json(
      {
        error:
          "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel para procesar la cola.",
      },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    onlyConfirmations?: boolean;
  };

  try {
    const result = await processWhatsAppCloudQueue({
      onlyConfirmations: body.onlyConfirmations === true,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al procesar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
