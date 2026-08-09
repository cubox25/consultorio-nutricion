import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnthropometricRecord,
  ClinicalRecord,
  NutritionPlan,
  PatientFile,
  FileCategory,
} from "@/types";

const PATIENT_MIN =
  "id, first_name, last_name, dni, phone";

const CLINICAL_LIST_SELECT = `
  id, patient_id, appointment_id, record_date, reason, evolution, observations,
  patient:patients(${PATIENT_MIN})
`.replace(/\s+/g, " ").trim();

const CLINICAL_FULL_SELECT = `*, patient:patients(${PATIENT_MIN})`;

const PLAN_LIST_SELECT = `
  id, patient_id, title, plan_date, objective,
  patient:patients(${PATIENT_MIN})
`.replace(/\s+/g, " ").trim();

const PLAN_FULL_SELECT = `*, patient:patients(${PATIENT_MIN})`;

const FILE_LIST_SELECT = `
  id, patient_id, category, file_name, storage_path, mime_type, file_size, file_date, notes, uploaded_by, created_at,
  patient:patients(${PATIENT_MIN})
`.replace(/\s+/g, " ").trim();

const ANTHROPOMETRY_SELECT = `
  id, patient_id, measured_at, weight_kg, height_cm, bmi, waist_cm, hip_cm, arm_cm, thigh_cm, neck_cm,
  body_fat_percent, muscle_mass_kg, fat_mass_kg, body_water_percent, basal_metabolism_kcal, custom_measures, notes, created_at,
  patient:patients(${PATIENT_MIN})
`.replace(/\s+/g, " ").trim();

async function resolvePatientIds(
  supabase: SupabaseClient,
  patientSearch?: string
) {
  if (!patientSearch?.trim()) return null;
  const term = patientSearch.trim();
  const { data: patients, error: pErr } = await supabase
    .from("patients")
    .select("id")
    .eq("is_active", true)
    .or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,dni.ilike.%${term}%`
    )
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

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: (data ?? []) as unknown as ClinicalRecord[], count: count ?? 0 };
}

export async function getClinicalRecord(
  supabase: SupabaseClient,
  id: string
) {
  const { data, error } = await supabase
    .from("clinical_records")
    .select(CLINICAL_FULL_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as ClinicalRecord;
}

export async function createClinicalRecord(
  supabase: SupabaseClient,
  payload: Partial<ClinicalRecord>
) {
  const { data, error } = await supabase
    .from("clinical_records")
    .insert(payload)
    .select(CLINICAL_FULL_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as ClinicalRecord;
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
    .select(CLINICAL_FULL_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as ClinicalRecord;
}

export async function listAnthropometry(
  supabase: SupabaseClient,
  patientId?: string
) {
  let q = supabase
    .from("anthropometric_records")
    .select(ANTHROPOMETRY_SELECT)
    .order("measured_at", { ascending: true });
  if (patientId) q = q.eq("patient_id", patientId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AnthropometricRecord[];
}

export async function createAnthropometry(
  supabase: SupabaseClient,
  payload: Partial<AnthropometricRecord>
) {
  const { data, error } = await supabase
    .from("anthropometric_records")
    .insert(payload)
    .select(ANTHROPOMETRY_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as AnthropometricRecord;
}

export async function listNutritionPlans(
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
    .from("nutrition_plans")
    .select(PLAN_LIST_SELECT, { count: "exact" })
    .order("plan_date", { ascending: false })
    .range(from, to);

  if (opts.patientId) q = q.eq("patient_id", opts.patientId);

  const searchIds = await resolvePatientIds(supabase, opts.patientSearch);
  if (searchIds) {
    if (!searchIds.length) return { data: [] as unknown as NutritionPlan[], count: 0 };
    q = q.in("patient_id", searchIds);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  return { data: (data ?? []) as unknown as NutritionPlan[], count: count ?? 0 };
}

export async function getNutritionPlan(
  supabase: SupabaseClient,
  id: string
) {
  const { data, error } = await supabase
    .from("nutrition_plans")
    .select(PLAN_FULL_SELECT)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as NutritionPlan;
}

export async function createNutritionPlan(
  supabase: SupabaseClient,
  payload: Partial<NutritionPlan>
) {
  const { data, error } = await supabase
    .from("nutrition_plans")
    .insert(payload)
    .select(PLAN_FULL_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as NutritionPlan;
}

export async function updateNutritionPlan(
  supabase: SupabaseClient,
  id: string,
  payload: Partial<NutritionPlan>
) {
  const { data, error } = await supabase
    .from("nutrition_plans")
    .update(payload)
    .eq("id", id)
    .select(PLAN_FULL_SELECT)
    .single();
  if (error) throw error;
  return data as unknown as NutritionPlan;
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
