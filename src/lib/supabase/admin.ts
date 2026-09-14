import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con service role. SOLO usar en servidor (API routes / server actions).
 * Nunca importar este módulo en componentes cliente.
 */
export function createServiceClient() {
  const client = tryCreateServiceClient();
  if (!client) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en el servidor (Vercel → Environment Variables)."
    );
  }
  return client;
}

/** Devuelve null si no hay service role configurado (no lanza). */
export function tryCreateServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
