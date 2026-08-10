import type { SupabaseClient } from "@supabase/supabase-js";

export async function updateOwnAvatarUrl(
  supabase: SupabaseClient,
  userId: string,
  avatarUrl: string | null
) {
  const { data, error } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId)
    .select("id, full_name, email, role, avatar_url, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function getOwnProfile(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
