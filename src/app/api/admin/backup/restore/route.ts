import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  BACKUP_TABLES,
  normalizeBackupPayload,
  type BackupTable,
} from "@/lib/backup";

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
  return { user, supabase };
}

const FK_USER_COLUMNS = new Set([
  "created_by",
  "uploaded_by",
  "updated_by",
]);

function sanitizeRow(
  table: BackupTable,
  row: Record<string, unknown>,
  staffUserId: string
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...row };
  for (const key of Object.keys(next)) {
    if (FK_USER_COLUMNS.has(key)) {
      // Evita fallar si el perfil del backup no existe en este proyecto
      next[key] = staffUserId;
    }
  }
  if (table === "system_settings") {
    // No pisar secretos de WhatsApp / tokens si vinieran vacíos
    for (const key of Object.keys(next)) {
      if (
        /token|secret|password|api_key|webhook/i.test(key) &&
        (next[key] == null || next[key] === "")
      ) {
        delete next[key];
      }
    }
  }
  return next;
}

async function upsertChunk(
  service: ReturnType<typeof createServiceClient>,
  table: BackupTable,
  rows: Record<string, unknown>[]
) {
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await service.from(table).upsert(chunk, {
      onConflict: "id",
    });
    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }
  }
}

export async function POST(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff && staff.error) return staff.error;

  try {
    const body = (await request.json()) as {
      backup?: unknown;
      confirm?: string;
    };

    if (body.confirm !== "RESTAURAR") {
      return NextResponse.json(
        {
          error:
            'Para confirmar, enviá confirm: "RESTAURAR". Esto fusiona los datos del archivo con la base.',
        },
        { status: 400 }
      );
    }

    const payload = normalizeBackupPayload(body.backup);
    const service = createServiceClient();
    const restored: Record<string, number> = {};

    for (const table of BACKUP_TABLES) {
      const rawRows = payload.data[table];
      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        restored[table] = 0;
        continue;
      }

      const rows = rawRows
        .filter((r) => r && typeof r === "object" && (r as { id?: unknown }).id)
        .map((r) =>
          sanitizeRow(table, r as Record<string, unknown>, staff.user.id)
        );

      if (table === "clinic_schedules") {
        // Puede no haber PK única simple en algunos dumps: upsert por id si existe
        await upsertChunk(service, table, rows);
      } else {
        await upsertChunk(service, table, rows);
      }

      restored[table] = rows.length;
    }

    await staff.supabase.from("backup_logs").insert({
      backup_type: "restauracion",
      status: "completado",
      file_name: null,
      record_counts: restored,
      notes: `Restauración desde respaldo del ${payload.exported_at}`,
      created_by: staff.user.id,
    });

    return NextResponse.json({
      ok: true,
      restored,
      exported_at: payload.exported_at,
    });
  } catch (error) {
    console.error("[backup/restore]", error);
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo restaurar el respaldo.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
