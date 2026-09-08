/**
 * Traduce errores técnicos de Supabase/Postgres a mensajes amigables en español.
 */
export function errorMessage(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message ?? "");
  }
  return String(error);
}

export function friendlyError(error: unknown, fallback = "Ocurrió un error. Intentá nuevamente.") {
  if (!error) return fallback;

  const message = errorMessage(error) || fallback;
  const lower = message.toLowerCase();

  if (
    lower.includes("record_time") ||
    lower.includes("weight_kg") ||
    lower.includes("height_cm") ||
    lower.includes("bmi_classification") ||
    lower.includes("cie10_code") ||
    lower.includes("schema cache") ||
    (lower.includes("column") && lower.includes("does not exist"))
  ) {
    return "Faltan columnas nuevas en la base. Ejecutá en Supabase la migración 012_patient_clinical_header_and_evolution.sql";
  }

  if (lower.includes("duplicate") || lower.includes("unique") || lower.includes("already exists")) {
    if (lower.includes("dni")) return "Ya existe un paciente con ese DNI.";
    if (lower.includes("appointments") || lower.includes("horario")) {
      return "El horario seleccionado ya no está disponible.";
    }
    return "El registro ya existe.";
  }

  if (lower.includes("invalid login") || lower.includes("invalid credentials")) {
    return "Email o contraseña incorrectos.";
  }

  if (
    lower.includes("already been registered") ||
    lower.includes("already registered") ||
    lower.includes("user already exists") ||
    lower.includes("email address has already")
  ) {
    return "Ese email ya está en uso por otra cuenta.";
  }

  if (
    lower.includes("rate limit") ||
    lower.includes("only request this after") ||
    lower.includes("for security purposes")
  ) {
    return "Esperá un momento e intentá de nuevo (límite de intentos).";
  }

  if (
    lower.includes("error sending") ||
    lower.includes("confirmation email") ||
    lower.includes("smtp") ||
    lower.includes("unable to send")
  ) {
    return "Supabase no pudo enviar el correo de confirmación. Revisá el SMTP o usá el cambio desde el panel.";
  }

  if (lower.includes("email not confirmed")) {
    return "Debés confirmar tu email antes de ingresar.";
  }

  if (lower.includes("jwt") || lower.includes("not authenticated") || lower.includes("unauthorized")) {
    return "Tu sesión expiró. Volvé a iniciar sesión.";
  }

  if (
    lower.includes("row-level security") ||
    lower.includes("rls") ||
    lower.includes("permission") ||
    lower.includes("42501")
  ) {
    return "No tenés permisos para realizar esta acción.";
  }

  if (lower.includes("file size") || lower.includes("payload too large")) {
    return "El archivo supera el tamaño máximo permitido.";
  }

  if (lower.includes("mime") || lower.includes("not allowed")) {
    return "El tipo de archivo no está permitido.";
  }

  if (lower.includes("network") || lower.includes("fetch")) {
    return "No se pudo conectar con el servidor. Verificá tu conexión.";
  }

  if (lower.includes("invalid input syntax") && lower.includes("time")) {
    return "La hora de la evolución no es válida.";
  }

  if (lower.includes("invalid input syntax") && lower.includes("uuid")) {
    return "Hay un dato inválido en el formulario. Recargá la ficha e intentá de nuevo.";
  }

  if (lower.includes("foreign key") || lower.includes("violates foreign key")) {
    return "El paciente no existe o ya no está disponible.";
  }

  // Mensajes ya amigables emitidos por RPC / validaciones de negocio (español)
  const cleaned = message.replace(/^.*ERROR:\s*/i, "").split("\n")[0].trim();
  if (
    /horario|consultorio|bloquead|paciente|Datos|DNI|tel[eé]fono|Nombre|apellido|anticipaci[oó]n|agenda|turno|duraci[oó]n|obligatorio|inv[aá]lido|disponible|contraseñ|email|sesi[oó]n|incorrect|mismo que el actual/i.test(
      cleaned
    ) &&
    cleaned.length < 220 &&
    !/permission denied|row-level|schema cache|PGRST|postgres|sql/i.test(cleaned)
  ) {
    return cleaned;
  }

  // Mensajes claros de la app / Auth (no técnicos)
  if (
    cleaned.length > 3 &&
    cleaned.length < 220 &&
    !/permission denied|row-level security|schema cache|pgrst|postgres|sql state|violates|null value|foreign key|jwt|stack|ecode/i.test(
      lower
    )
  ) {
    return cleaned;
  }

  // No filtrar mensajes técnicos crudos al usuario final
  return fallback;
}
