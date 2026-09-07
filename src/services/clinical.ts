import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnthropometryDocument,
  ClinicalRecord,
  PatientFile,
  FileCategory,
} from "@/types";
import { errorMessage } from "@/lib/errors";
import { patientSearchOrFilter } from "@/lib/postgrest";

const PATIENT_MIN =
  "id, first_name, last_name, dni, phone";

const CLINICAL_BASE_SELECT = `
  id, patient_id, appointment_id, record_date, reason, evolution, observations,
  objectives, recommendations, professional_notes, created_at, updated_at,
  patient:patients(${PATIENT_MIN})
`.replace(/\s+/g, " ").trim();

const CLINICAL_LIST_SELECT = `
  id, patient_id, appointment_id, record_date, record_time, reason, evolution, observations,
  objectives, recommendations, professional_notes, weight_kg, height_cm, bmi, bmi_classification, cie10_code,
  created_at, updated_at,
  patient:patients(${PATIENT_MIN})
`.replace(/\s+/g, " ").trim();

const CLINICAL_INSERT_RETURN =
  "id, patient_id, appointment_id, record_date, reason, evolution, created_at, updated_at";

function isMissingClinicalColumn(error: unknown) {
  const message = errorMessage(error);
  return /record_time|weight_kg|height_cm|bmi_classification|\bbmi\b|cie10_code|column .* does not exist|Could not find the|schema cache|PGRST204/i.test(
    message
  );
}

function clinicalInsertPayload(payload: Partial<ClinicalRecord>, extended: boolean) {
  const weight =
    payload.weight_kg != null && Number.isFinite(Number(payload.weight_kg))
      ? Number(payload.weight_kg)
      : null;
  const height =
    payload.height_cm != null && Number.isFinite(Number(payload.height_cm))
      ? Number(payload.height_cm)
      : null;

  const row: Record<string, unknown> = {
    patient_id: payload.patient_id,
    appointment_id: payload.appointment_id ?? null,
    record_date: payload.record_date,
    reason: payload.reason || null,
    evolution: payload.evolution || null,
  };

  if (extended) {
    // Postgres TIME acepta HH:MM; normalizamos a HH:MM:SS
    const rawTime = payload.record_time ? String(payload.record_time).trim() : "";
    row.record_time = rawTime
      ? rawTime.length === 5
        ? `${rawTime}:00`
        : rawTime
      : null;
    row.weight_kg = weight;
    row.height_cm = height;
    row.bmi =
      payload.bmi != null && Number.isFinite(Number(payload.bmi))
        ? Number(payload.bmi)
        : null;
    row.bmi_classification = payload.bmi_classification || null;
  }

  return row;
}

const FILE_LIST_SELECT = `
  id, patient_id, category, file_name, storage_path, mime_type, file_size, file_date, notes, uploaded_by, created_at,
  patient:patients(${PATIENT_MIN})
`.replace(/\s+/g, " ").trim();

const ANTHROPOMETRY_DOC_SELECT = `
  id, patient_id, file_name, storage_path, mime_type, file_size, uploaded_by, created_at, updated_at,
  patient:patients(${PATIENT_MIN})
`.replace(/\s+/g, " ").trim();

export const ANTHROPOMETRY_BUCKET = "anthropometry";

async function resolvePatientIds(
  supabase: SupabaseClient,
  patientSearch?: string
) {
  if (!patientSearch?.trim()) return null;
  const filter = patientSearchOrFilter(patientSearch);
  if (!filter) return [];
  const { data: patients, error: pErr } = await supabase
    .from("patients")
    .select("id")
    .eq("is_active", true)
    .or(filter)
    .limit(50);
  if (pErr) throw pErr;
  return (patients ?? []).map((p) => p.id);
}

export async function listClinicalRecords(
  supabase: SupabaseClient,
  opts: {
    patientId?: string;
    patientSearch?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("clinical_records")
    .select(CLINICAL_LIST_SELECT, { count: "exact" })
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (opts.patientId) q = q.eq("patient_id", opts.patientId);

  const searchIds = await resolvePatientIds(supabase, opts.patientSearch);
  if (searchIds) {
    if (!searchIds.length) return { data: [] as unknown as ClinicalRecord[], count: 0 };
    q = q.in("patient_id", searchIds);
  }

  let { data, error, count } = await q;
  if (error && isMissingClinicalColumn(error)) {
    let fallback = supabase
      .from("clinical_records")
      .select(CLINICAL_BASE_SELECT, { count: "exact" })
      .order("record_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (opts.patientId) fallback = fallback.eq("patient_id", opts.patientId);
    if (searchIds?.length) fallback = fallback.in("patient_id", searchIds);
    const retry = await fallback;
    data = retry.data;
    error = retry.error;
    count = retry.count;
  }
  if (error) throw error;
  return { data: (data ?? []) as unknown as ClinicalRecord[], count: count ?? 0 };
}

export async function getClinicalRecord(
  supabase: SupabaseClient,
  id: string
) {
  const full = await supabase
    .from("clinical_records")
    .select(`*, patient:patients(${PATIENT_MIN})`)
    .eq("id", id)
    .single();
  if (!full.error) return full.data as unknown as ClinicalRecord;

  if (isMissingClinicalColumn(full.error)) {
    const { data, error } = await supabase
      .from("clinical_records")
      .select(CLINICAL_BASE_SELECT)
      .eq("id", id)
      .single();
    if (error) throw error;
    return data as unknown as ClinicalRecord;
  }
  throw full.error;
}

export async function createClinicalRecord(
  supabase: SupabaseClient,
  payload: Partial<ClinicalRecord>
) {
  if (!payload.patient_id) {
    throw new Error("Falta el paciente de la evolución.");
  }
  if (!payload.record_date) {
    throw new Error("La fecha de la evolución es obligatoria.");
  }

  const attempt = async (extended: boolean) => {
    const row = clinicalInsertPayload(payload, extended);
    return supabase
      .from("clinical_records")
      .insert(row)
      .select(CLINICAL_INSERT_RETURN)
      .single();
  };

  // Primero con hora/peso/IMC; si la migración 012 no está, reintenta lo básico
  const first = await attempt(true);
  if (!first.error) {
    return first.data as unknown as ClinicalRecord;
  }
  const retry = await attempt(false);
  if (!retry.error) {
    return retry.data as unknown as ClinicalRecord;
  }
  throw isMissingClinicalColumn(first.error) ? retry.error : first.error;
}

export async function updateClinicalRecord(
  supabase: SupabaseClient,
  id: string,
  payload: Partial<ClinicalRecord>
) {
  const { data, error } = await supabase
    .from("clinical_records")
    .update(payload)
    .eq("id", id)
    .select(CLINICAL_INSERT_RETURN)
    .single();
  if (error) throw error;
  return data as unknown as ClinicalRecord;
}

export async function listAnthropometryDocuments(
  supabase: SupabaseClient,
  opts: {
    patientId?: string;
    patientSearch?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 40;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("anthropometry_documents")
    .select(ANTHROPOMETRY_DOC_SELECT, { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (opts.patientId) q = q.eq("patient_id", opts.patientId);

  const searchIds = await resolvePatientIds(supabase, opts.patientSearch);
  if (searchIds) {
    if (!searchIds.length) {
      return { data: [] as AnthropometryDocument[], count: 0 };
    }
    q = q.in("patient_id", searchIds);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return {
    data: (data ?? []) as unknown as AnthropometryDocument[],
    count: count ?? 0,
  };
}

/** Documento más reciente del paciente (compat). Preferí listAnthropometryDocuments. */
export async function getAnthropometryDocument(
  supabase: SupabaseClient,
  patientId: string
) {
  const { data, error } = await supabase
    .from("anthropometry_documents")
    .select(ANTHROPOMETRY_DOC_SELECT)
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as AnthropometryDocument | null) ?? null;
}

export async function getAnthropometrySignedUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn = 3600
) {
  const { data, error } = await supabase.storage
    .from(ANTHROPOMETRY_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

function anthropometryStoragePath(patientId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const base = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
  return `${patientId}/${Date.now()}_${base}`;
}

export async function uploadAnthropometryPdf(
  supabase: SupabaseClient,
  opts: {
    patientId: string;
    file: File;
    uploadedBy?: string | null;
    /** Si se indica, reemplaza ese documento; si no, crea uno nuevo. */
    documentId?: string | null;
  }
) {
  const { validateAnthropometryPdf } = await import("@/lib/validations");
  const validationError = validateAnthropometryPdf(opts.file);
  if (validationError) throw new Error(validationError);

  let existing: AnthropometryDocument | null = null;
  if (opts.documentId) {
    const { data, error } = await supabase
      .from("anthropometry_documents")
      .select(ANTHROPOMETRY_DOC_SELECT)
      .eq("id", opts.documentId)
      .eq("patient_id", opts.patientId)
      .maybeSingle();
    if (error) throw error;
    existing = (data as unknown as AnthropometryDocument | null) ?? null;
    if (!existing) throw new Error("Documento no encontrado.");
  }

  const storagePath = existing?.storage_path
    ? existing.storage_path
    : anthropometryStoragePath(opts.patientId, opts.file.name || "antropometria.pdf");

  const { error: uploadError } = await supabase.storage
    .from(ANTHROPOMETRY_BUCKET)
    .upload(storagePath, opts.file, {
      cacheControl: "3600",
      upsert: true,
      contentType: "application/pdf",
    });
  if (uploadError) throw uploadError;

  const payload = {
    patient_id: opts.patientId,
    file_name: opts.file.name,
    storage_path: storagePath,
    mime_type: opts.file.type || "application/pdf",
    file_size: opts.file.size,
    uploaded_by: opts.uploadedBy ?? null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { data, error } = await supabase
      .from("anthropometry_documents")
      .update(payload)
      .eq("id", existing.id)
      .select(ANTHROPOMETRY_DOC_SELECT)
      .single();
    if (error) throw error;
    return data as unknown as AnthropometryDocument;
  }

  const { data, error } = await supabase
    .from("anthropometry_documents")
    .insert(payload)
    .select(ANTHROPOMETRY_DOC_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as AnthropometryDocument;
}

export async function deleteAnthropometryPdf(
  supabase: SupabaseClient,
  document: AnthropometryDocument
) {
  const { error: storageError } = await supabase.storage
    .from(ANTHROPOMETRY_BUCKET)
    .remove([document.storage_path]);
  if (storageError) throw storageError;

  const { error } = await supabase
    .from("anthropometry_documents")
    .delete()
    .eq("id", document.id);
  if (error) throw error;
}

export async function listFiles(
  supabase: SupabaseClient,
  opts: {
    patientId?: string;
    category?: FileCategory;
    page?: number;
    pageSize?: number;
    patientSearch?: string;
  } = {}
) {
  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 20;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("files")
    .select(FILE_LIST_SELECT, { count: "exact" })
    .order("file_date", { ascending: false })
    .range(from, to);

  if (opts.patientId) q = q.eq("patient_id", opts.patientId);
  if (opts.category) q = q.eq("category", opts.category);

  const searchIds = await resolvePatientIds(supabase, opts.patientSearch);
  if (searchIds) {
    if (!searchIds.length) return { data: [] as unknown as PatientFile[], count: 0 };
    q = q.in("patient_id", searchIds);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: (data ?? []) as unknown as PatientFile[], count: count ?? 0 };
}

export async function createFileRecord(
  supabase: SupabaseClient,
  payload: Partial<PatientFile>
) {
  const { data, error } = await supabase
    .from("files")
    .insert(payload)
    .select(FILE_LIST_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as PatientFile;
}

export async function deleteFileRecord(
  supabase: SupabaseClient,
  id: string,
  storagePath: string
) {
  const { error: storageError } = await supabase.storage
    .from("patient-files")
    .remove([storagePath]);
  if (storageError) throw storageError;

  const { error } = await supabase.from("files").delete().eq("id", id);
  if (error) throw error;
}

export async function getSignedFileUrl(
  supabase: SupabaseClient,
  storagePath: string,
  expiresIn = 3600
) {
  const { data, error } = await supabase.storage
    .from("patient-files")
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function uploadPatientFile(
  supabase: SupabaseClient,
  opts: {
    patientId: string;
    category: FileCategory;
    file: File;
    fileDate?: string;
    notes?: string | null;
    uploadedBy?: string | null;
  }
) {
  const { validateUploadFile } = await import("@/lib/validations");
  const validationError = validateUploadFile(opts.file);
  if (validationError) {
    throw new Error(validationError);
  }

  const folder = categoryToFolder(opts.category);
  const safeName = opts.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${opts.patientId}/${folder}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("patient-files")
    .upload(storagePath, opts.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: opts.file.type || undefined,
    });
  if (uploadError) throw uploadError;

  try {
    return await createFileRecord(supabase, {
      patient_id: opts.patientId,
      category: opts.category,
      file_name: opts.file.name,
      storage_path: storagePath,
      mime_type: opts.file.type || null,
      file_size: opts.file.size,
      file_date: opts.fileDate || new Date().toISOString().slice(0, 10),
      notes: opts.notes || null,
      uploaded_by: opts.uploadedBy ?? null,
    });
  } catch (err) {
    await supabase.storage.from("patient-files").remove([storagePath]);
    throw err;
  }
}

export function categoryToFolder(category: FileCategory) {
  const map: Record<FileCategory, string> = {
    antropometria: "anthropometry",
    analisis: "analysis",
    estudios: "studies",
    fotos: "photos",
    plan_alimentario: "nutrition-plans",
    otros: "other",
  };
  return map[category];
}
