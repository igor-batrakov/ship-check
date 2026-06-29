import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL!;
const anonKey = process.env.SUPABASE_ANON_KEY!;

const baseOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

/**
 * A request-scoped client that acts as the signed-in user. The access token is
 * attached to every request, so PostgREST runs as the `authenticated` role and
 * Row Level Security restricts rows to the token's owner.
 */
export function userClient(accessToken: string) {
  return createClient(url, anonKey, {
    ...baseOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * An unauthenticated client (anon role) for flows that run before login, such
 * as password reset. RLS still applies.
 */
export function anonClient() {
  return createClient(url, anonKey, baseOptions);
}

/**
 * Service-role client. It bypasses Row Level Security, so it is used only
 * server-side for storage operations such as minting signed URLs for the
 * private documents bucket. It must never reach the browser.
 */
export function serviceClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, baseOptions);
}
