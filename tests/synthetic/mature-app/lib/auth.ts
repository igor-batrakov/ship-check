import type { User, SupabaseClient } from "@supabase/supabase-js";
import { userClient } from "./supabase";

export interface AuthContext {
  user: User;
  supabase: SupabaseClient;
}

/**
 * Resolve the caller from the `Authorization: Bearer <token>` header. The token
 * is verified by Supabase (`auth.getUser`), so the identity comes from a trusted
 * server-side check and never from the request body. Returns null when the
 * caller is anonymous or the token is invalid.
 */
export async function getUser(req: Request): Promise<AuthContext | null> {
  const header = req.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  const supabase = userClient(token);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { user: data.user, supabase };
}
