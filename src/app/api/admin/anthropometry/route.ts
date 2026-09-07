import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { ANTHROPOMETRY_PDF_MAX_BYTES } from "@/lib/validations";

const BUCKET = "anthropometry";
const DOC_SELECT =
  "id, patient_id, file_name, storage_path, mime_type, file_size, uploaded_by, created_at, updated_at";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function missingSchemaMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/anthropometry_documents|schema cache|does not exist/i.test(message)) {
    return "Falta la tabla de antropometría en Supabase. Ejecutá la migración 009_anthropometry_pdf_and_prices.sql.";
  }
  if (/Bucket not found|not found/i.test(message)) {
    return "Falta el bucket de Storage «anthropometry». Ejecutá la migración 009 o crealo en Supabase → Storage.";
  }
  if (/unique|duplicate key|patient_id/i.test(message)) {
    return "Todavía hay un límite de un PDF por paciente. Ejecutá la migración 013_multiple_anthropometry_documents.sql en Supabase.";
  }
  return message || "No se pudo completar la operación.";
}

async function ensureAnthropometryBucket(
  service: ReturnType<typeof createServiceClient>
) {
  const { data: buckets, error } = await service.storage.listBuckets();
  if (error) throw error;
  const exists = (buckets ?? []).some((b) => b.id === BUCKET || b.name === BUCKET);
  if (exists) return;

  const { error: createError } = await service.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: ANTHROPOMETRY_PDF_MAX_BYTES,
    allowedMimeTypes: ["application/pdf"],
  });
  if (createError && !/already exists|duplicate/i.test(createError.message)) {
    throw createError;
  }
}

function safePdfName(name: string) {
  const base = (name || "antropometria.pdf").replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}

function storagePathFor(patientId: string, fileName: string) {
  return `${patientId}/${Date.now()}_${safePdfName(fileName)}`;
}

async function signedFor(
  service: ReturnType<typeof createServiceClient>,
  storagePath: string
) {
  const { data, error } = await service.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

/** GET ?patientId=… [&documentId=…] → listado o un documento con URL firmada */
export async function GET(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;

  try {
    const url = new URL(request.url);
    const patientId = url.searchParams.get("patientId")?.trim() ?? "";
    const documentId = url.searchParams.get("documentId")?.trim() ?? "";

    if (!UUID_RE.test(patientId)) {
      return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
    }
    if (documentId && !UUID_RE.test(documentId)) {
      return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
    }

    const service = createServiceClient();
    await ensureAnthropometryBucket(service);

    if (documentId) {
      const { data: doc, error } = await service
        .from("anthropometry_documents")
        .select(DOC_SELECT)
        .eq("id", documentId)
        .eq("patient_id", patientId)
        .maybeSingle();
      if (error) throw error;
      if (!doc) {
        return NextResponse.json({ document: null, signedUrl: null });
      }
      return NextResponse.json({
        document: doc,
        signedUrl: await signedFor(service, doc.storage_path),
      });
    }

    const { data: docs, error } = await service
      .from("anthropometry_documents")
      .select(DOC_SELECT)
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const documents = docs ?? [];
    const withUrls = await Promise.all(
      documents.map(async (doc) => ({
        document: doc,
        signedUrl: await signedFor(service, doc.storage_path).catch(() => null),
      }))
    );

    // Compat: document/signedUrl = el más reciente
    const latest = withUrls[0] ?? null;

    return NextResponse.json({
      documents: withUrls,
      document: latest?.document ?? null,
      signedUrl: latest?.signedUrl ?? null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: missingSchemaMessage(error) },
      { status: 500 }
    );
  }
}

/** POST multipart: patientId + file [&documentId= para reemplazar] */
export async function POST(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;

  try {
    const form = await request.formData();
    const patientId = String(form.get("patientId") ?? "").trim();
    const documentId = String(form.get("documentId") ?? "").trim();
    const file = form.get("file");

    if (!UUID_RE.test(patientId)) {
      return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
    }
    if (documentId && !UUID_RE.test(documentId)) {
      return NextResponse.json({ error: "Documento inválido." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo PDF." }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mime = (file.type || "").toLowerCase();
    if (ext !== "pdf" && mime !== "application/pdf") {
      return NextResponse.json(
        { error: "Solo se aceptan archivos PDF." },
        { status: 400 }
      );
    }
    if (file.size <= 0) {
      return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });
    }
    if (file.size > ANTHROPOMETRY_PDF_MAX_BYTES) {
      return NextResponse.json(
        { error: "El PDF supera el límite de 10 MB." },
        { status: 400 }
      );
    }

    const service = createServiceClient();
    await ensureAnthropometryBucket(service);

    const { data: patient, error: patientError } = await service
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .maybeSingle();
    if (patientError) throw patientError;
    if (!patient) {
      return NextResponse.json({ error: "Paciente no encontrado." }, { status: 404 });
    }

    let existing: { id: string; storage_path: string } | null = null;
    if (documentId) {
      const { data, error } = await service
        .from("anthropometry_documents")
        .select("id, storage_path")
        .eq("id", documentId)
        .eq("patient_id", patientId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return NextResponse.json(
          { error: "Documento no encontrado." },
          { status: 404 }
        );
      }
      existing = data;
    }

    const path = existing?.storage_path || storagePathFor(patientId, file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await service.storage.from(BUCKET).upload(path, buffer, {
      cacheControl: "3600",
      upsert: true,
      contentType: "application/pdf",
    });
    if (uploadError) throw uploadError;

    const payload = {
      patient_id: patientId,
      file_name: file.name || "antropometria.pdf",
      storage_path: path,
      mime_type: "application/pdf",
      file_size: file.size,
      uploaded_by: staff.user.id,
      updated_at: new Date().toISOString(),
    };

    let saved;
    if (existing?.id) {
      const { data, error } = await service
        .from("anthropometry_documents")
        .update(payload)
        .eq("id", existing.id)
        .select(DOC_SELECT)
        .single();
      if (error) {
        const { data: retry, error: retryError } = await service
          .from("anthropometry_documents")
          .update({ ...payload, uploaded_by: null })
          .eq("id", existing.id)
          .select(DOC_SELECT)
          .single();
        if (retryError) throw retryError;
        saved = retry;
      } else {
        saved = data;
      }
    } else {
      const { data, error } = await service
        .from("anthropometry_documents")
        .insert(payload)
        .select(DOC_SELECT)
        .single();
      if (error) {
        const { data: retry, error: retryError } = await service
          .from("anthropometry_documents")
          .insert({ ...payload, uploaded_by: null })
          .select(DOC_SELECT)
          .single();
        if (retryError) throw retryError;
        saved = retry;
      } else {
        saved = data;
      }
    }

    return NextResponse.json({
      document: saved,
      signedUrl: await signedFor(service, path),
    });
  } catch (error) {
    return NextResponse.json(
      { error: missingSchemaMessage(error) },
      { status: 500 }
    );
  }
}

/** DELETE ?patientId=… &documentId=… */
export async function DELETE(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;

  try {
    const url = new URL(request.url);
    const patientId = url.searchParams.get("patientId")?.trim() ?? "";
    const documentId = url.searchParams.get("documentId")?.trim() ?? "";

    if (!UUID_RE.test(patientId)) {
      return NextResponse.json({ error: "Paciente inválido." }, { status: 400 });
    }
    if (!UUID_RE.test(documentId)) {
      return NextResponse.json(
        { error: "Indicá qué PDF eliminar (documentId)." },
        { status: 400 }
      );
    }

    const service = createServiceClient();
    const { data: doc, error } = await service
      .from("anthropometry_documents")
      .select("id, storage_path")
      .eq("id", documentId)
      .eq("patient_id", patientId)
      .maybeSingle();
    if (error) throw error;
    if (!doc) {
      return NextResponse.json({ ok: true });
    }

    await service.storage.from(BUCKET).remove([doc.storage_path]);
    const { error: delError } = await service
      .from("anthropometry_documents")
      .delete()
      .eq("id", doc.id);
    if (delError) throw delError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: missingSchemaMessage(error) },
      { status: 500 }
    );
  }
}
