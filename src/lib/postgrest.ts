export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string) {
  return UUID_RE.test(value.trim());
}

/** Evita romper filtros `.or()` de PostgREST con comas, puntos o comodines. */
export function sanitizeIlikeTerm(term: string, maxLen = 80) {
  return term
    .trim()
    .replace(/[%_,().\\]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, maxLen);
}

export function patientSearchOrFilter(term: string) {
  const safe = sanitizeIlikeTerm(term);
  if (!safe) return null;
  return `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,dni.ilike.%${safe}%,phone.ilike.%${safe}%`;
}
