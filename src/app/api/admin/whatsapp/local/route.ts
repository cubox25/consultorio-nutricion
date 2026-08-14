import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ensureWhatsAppService,
  postWhatsAppAction,
  probeWhatsAppStatus,
} from "@/lib/whatsapp-ensure.server";

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

export async function GET() {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  const status = await probeWhatsAppStatus();
  return NextResponse.json({
    ok: Boolean(status),
    running: Boolean(status),
    status,
  });
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action || "ensure";

  if (action === "ensure") {
    const result = await ensureWhatsAppService();
    return NextResponse.json({ ok: result.running, ...result });
  }

  if (action === "show-qr") {
    const ensured = await ensureWhatsAppService();
    if (!ensured.running) {
      return NextResponse.json({ ok: false, ...ensured }, { status: 503 });
    }
    const posted = await postWhatsAppAction("/show-qr");
    return NextResponse.json({ ...posted, started: true });
  }

  if (action === "disconnect") {
    const posted = await postWhatsAppAction("/disconnect");
    return NextResponse.json(posted);
  }

  return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
}
