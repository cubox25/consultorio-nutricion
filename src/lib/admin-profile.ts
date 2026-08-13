import { createClient } from "@/lib/supabase/client";
import { getCached, setCached } from "@/lib/query-cache";

const PROFILE_CACHE_KEY = "admin-profile-basic";

export type AdminProfileBasic = {
  full_name: string | null;
  email: string | null;
};

/** Una sola lectura de perfil compartida entre sidebar y header. */
export async function getAdminProfileBasic(): Promise<AdminProfileBasic | null> {
  const cached = getCached<AdminProfileBasic>(PROFILE_CACHE_KEY);
  if (cached) return cached;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const value: AdminProfileBasic = {
    full_name: profile?.full_name ?? null,
    email: profile?.email ?? user.email ?? null,
  };
  setCached(PROFILE_CACHE_KEY, value, 120_000);
  return value;
}
