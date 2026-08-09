/**
 * Traduce errores técnicos de Supabase/Postgres a mensajes amigables en español.
 */
export function friendlyError(error: unknown, fallback = "Ocurrió un error. Intentá nuevamente.") {
  if (!error) return fallback;

  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : fallback;

  const lower = message.toLowerCase();

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

  if (lower.includes("email not confirmed")) {
    return "Debés confirmar tu email antes de ingresar.";
  }

  if (lower.includes("jwt") || lower.includes("not authenticated") || lower.includes("unauthorized")) {
    return "Tu sesión expiró. Volvé a iniciar sesión.";
  }

  if (lower.includes("row-level security") || lower.includes("rls") || lower.includes("permission")) {
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

  // Mensajes ya amigables emitidos por RPC
  if (
    message.includes("horario") ||
    message.includes("consultorio") ||
    message.includes("bloqueada") ||
    message.includes("paciente") ||
    message.includes("Datos")
  ) {
    return message.replace(/^.*ERROR:\s*/i, "").split("\n")[0];
  }

  return fallback;
}
