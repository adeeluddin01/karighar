import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_HOME, roleOf } from "@/components/nav";

/**
 * Where to send someone straight after they sign in.
 *
 * An explicit `next` always wins — it's where the user was headed. Only the
 * default "/" is resolved by role, so a provider lands on their dashboard
 * rather than bouncing off the customer Home via <RoleRoute>.
 */
export async function resolveSignInDest(
  supabase: SupabaseClient,
  userId: string,
  next = "/"
): Promise<string> {
  if (next !== "/") return next;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role;

  // Only an *approved* provider gets the provider area; see roleOf().
  let status: string | null = null;
  if (role === "provider") {
    const { data: prov } = await supabase
      .from("providers")
      .select("status")
      .eq("profile_id", userId)
      .maybeSingle();
    status = (prov as { status?: string } | null)?.status ?? null;
  }

  return ROLE_HOME[roleOf(true, role, status)];
}
