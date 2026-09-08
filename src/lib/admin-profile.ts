import { createClient } from "@/lib/supabase/client";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { formatAdminDisplayName } from "@/lib/utils";

const PROFILE_CACHE_KEY = "admin-profile-basic-v4";
const AVATAR_CACHE_KEY = "profile-avatar-url";

export type AdminProfileBasic = {
  full_name: string | null;
  email: string | null;
  /** Nombre listo para UI: mayúsculas y separado. */
  display_name: string;
};

/** Limpia caches de perfil/avatar al cerrar sesión (evita fuga entre usuarios). */
export function clearAdminProfileCache() {
  invalidateCache(PROFILE_CACHE_KEY);
  invalidateCache(AVATAR_CACHE_KEY);
}

/** Una sola lectura de perfil compartida entre sidebar y header. */
export async function getAdminProfileBasic(): Promise<AdminProfileBasic | null> {
  const cached = getCached<AdminProfileBasic>(PROFILE_CACHE_KEY);
  if (cached) return cached;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("system_settings")
      .select("professional_name")
      .limit(1)
      .maybeSingle(),
  ]);

  const email = profile?.email ?? user.email ?? null;
  const value: AdminProfileBasic = {
    full_name: profile?.full_name ?? null,
    email,
    display_name: formatAdminDisplayName(
      settings?.professional_name,
      profile?.full_name,
      email?.split("@")[0]
    ),
  };
  setCached(PROFILE_CACHE_KEY, value, 120_000);
  return value;
}
