import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Identity is verified by Supabase Auth; workspace membership is proven by
 * reading a row protected by owner-only RLS. Never trust URL params, display
 * names or editable JWT user_metadata for workspace permissions.
 */
export async function hasMikeWorkspace(sb: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await sb.from("michael_revenue_leads")
    .select("id")
    .eq("owner_id", userId)
    .limit(1);
  if (error) throw new Error("Could not verify your private workspace.");
  return (data?.length ?? 0) > 0;
}

/** Return only a path inside Presser; no account or buyer data in the URL. */
export async function signedInLandingPath(sb: SupabaseClient): Promise<"/mike" | "/" | "/login"> {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return "/login";
  return (await hasMikeWorkspace(sb, data.user.id)) ? "/mike" : "/";
}
